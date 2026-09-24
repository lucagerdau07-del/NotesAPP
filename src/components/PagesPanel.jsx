import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FileText, GripVertical, Plus, Trash2, X } from "lucide-react";
import { renderPagesFromDocument, subscribeToPreviewImages } from "../documents/notePreview.js";

const DRAG_START_PX = 5;
const THUMB_MAX_DIMENSION = 500;

// An imported PDF/image page is the file itself, not ink, so its thumbnail
// backdrop is rendered from the open source handle - once per handle and page.
const sourceThumbs = new WeakMap();
function sourceThumbOf(handle, type, sourceIndex) {
  let perHandle = sourceThumbs.get(handle);
  if (!perHandle) sourceThumbs.set(handle, (perHandle = new Map()));
  if (!perHandle.has(sourceIndex))
    perHandle.set(sourceIndex, renderSourceThumb(handle, type, sourceIndex).catch(() => ""));
  return perHandle.get(sourceIndex);
}

async function renderSourceThumb(handle, type, sourceIndex) {
  const canvas = document.createElement("canvas");
  const fit = (width, height) => {
    const scale = THUMB_MAX_DIMENSION / Math.max(width, height);
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    // JPEG has no alpha and pdf.js leaves the paper transparent.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    return { context, scale };
  };
  if (type === "pdf") {
    const pdfPage = await handle.document.getPage(sourceIndex + 1);
    const natural = pdfPage.getViewport({ scale: 1 });
    const { context, scale } = fit(natural.width, natural.height);
    await pdfPage.render({ canvasContext: context, viewport: pdfPage.getViewport({ scale }) }).promise;
    pdfPage.cleanup?.();
  } else {
    const image = handle.image;
    const width = image?.naturalWidth || image?.width;
    const height = image?.naturalHeight || image?.height;
    if (!width || !height) return "";
    fit(width, height).context.drawImage(image, 0, 0, canvas.width, canvas.height);
  }
  return canvas.toDataURL("image/jpeg", 0.8);
}

// Ink pages of an imported document carry no size (it comes from the file),
// so without this they'd render cropped to their strokes, dark and misaligned
// with the page underneath. Pages added later take the first page's size.
function withSourcePageSizes(doc, sourcePages) {
  if (!sourcePages?.length) return doc;
  const byId = new Map(sourcePages.map((page) => [page.id, page]));
  return {
    ...doc,
    pages: doc.pages.map((page) => {
      const source = byId.get(page.id) || sourcePages[0];
      return { ...page, width: source.width, height: source.height, background: page.background || "#fff" };
    }),
  };
}

export default function PagesPanel({
  active = false,
  pages = [],
  currentPage = 1,
  inkControllerRef,
  onNavigate,
  onAddPage,
  onRemovePage,
  onReorderPages,
  onClose,
}) {
  const [order, setOrder] = useState(pages);
  const [dragId, setDragId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  // Real rendered pages (ink + shapes/text + ruling + background), the exact
  // same renderer the library uses for note previews - not a hand-rolled
  // re-draw that would drift from what the page actually looks like.
  const [renderedPages, setRenderedPages] = useState([]);
  const [sourceThumbs, setSourceThumbs] = useState({});
  const draggingRef = useRef(null);
  const orderRef = useRef(pages);
  const confirmTimerRef = useRef(null);
  const listRef = useRef(null);
  const suppressClickRef = useRef(false);
  const cardRefs = useRef(new Map());
  const prevTopsRef = useRef(new Map());

  // Play a transform-only transition then hand the element back to its CSS
  // class - an inline `transition` left in place would otherwise override
  // the class's own border-color/box-shadow transitions forever after.
  const animateSettle = (el, fromTransform) => {
    el.style.transition = "none";
    el.style.transform = fromTransform;
    requestAnimationFrame(() => {
      // Plain ease-out: an overshoot here read as the card jumping past its
      // slot and back when it snapped in.
      el.style.transition = "transform 200ms cubic-bezier(.2,.8,.2,1)";
      el.style.transform = "";
      el.addEventListener(
        "transitionend",
        () => {
          el.style.transition = "";
        },
        { once: true },
      );
    });
  };

  useEffect(() => {
    if (!draggingRef.current) {
      setOrder(pages);
      orderRef.current = pages;
    }
  }, [pages]);

  // FLIP: whenever the order changes, the cards that shifted teleport to
  // their new slot instantly (browser reflow). Play that jump back as a
  // transform animation instead - skip the card being actively dragged,
  // which is already following the pointer directly. Slots are compared by
  // offsetTop (layout, unaffected by scroll and transforms); a card still
  // mid-settle keeps whatever offset it is currently shown at on top of that,
  // so a quick second reorder continues from where it is instead of jumping.
  useLayoutEffect(() => {
    const list = listRef.current;
    const nextTops = new Map();
    order.forEach((id) => {
      const el = cardRefs.current.get(id);
      if (!el) return;
      nextTops.set(id, el.offsetTop);
      if (id === dragId || !list) return;
      const prevTop = prevTopsRef.current.get(id);
      if (prevTop === undefined || prevTop === el.offsetTop) return;
      const shown =
        el.getBoundingClientRect().top - (list.getBoundingClientRect().top - list.scrollTop + el.offsetTop);
      animateSettle(el, `translateY(${prevTop - el.offsetTop + shown}px)`);
    });
    prevTopsRef.current = nextTops;
    // The reorder just moved the dragged card's own slot; re-pin it to the
    // pointer before paint, or it shows one frame in the wrong place.
    draggingRef.current?.follow?.();
  }, [order, dragId]);

  const refreshRenderedPages = () => {
    const controller = inkControllerRef?.current;
    if (!controller?.document) return;
    setRenderedPages(
      renderPagesFromDocument(withSourcePageSizes(controller.document, controller.sourcePages), {
        maxDimension: THUMB_MAX_DIMENSION,
      }),
    );
  };

  // Pulled from the imperative controller ref (not reactive props) so drawing
  // elsewhere doesn't re-render this panel on every stroke - only page-list
  // changes and (re)opening the panel refresh the thumbnails.
  useEffect(() => {
    if (!active) return;
    refreshRenderedPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pages]);

  useEffect(() => {
    const controller = inkControllerRef?.current;
    const handle = controller?.sourceHandle;
    if (!active || !handle || !controller.sourcePages) return undefined;
    let cancelled = false;
    controller.sourcePages.forEach((page) =>
      sourceThumbOf(handle, controller.sourceType, page.index).then((src) => {
        if (!cancelled && src) setSourceThumbs((current) => ({ ...current, [page.id]: src }));
      }),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pages]);

  // Image/fill objects decode async; once one lands, re-render so it shows
  // up instead of staying blank until the next unrelated refresh.
  useEffect(() => subscribeToPreviewImages(() => active && refreshRenderedPages()), [active]);

  useEffect(() => () => clearTimeout(confirmTimerRef.current), []);

  // A mouse drag starts the moment the pointer moves - people press and drag in
  // one motion, so a hold-still-first gesture never arms for them. Touch has no
  // hover, so it only drags via the footer's touchImmediate grab - and even
  // there, immediate means "no movement threshold", never "skip the DOM".
  const beginDrag = (event, id, touchImmediate) => {
    if (event.button !== undefined && event.button !== 0) return;
    const isTouch = event.pointerType !== "mouse";
    if (isTouch && !touchImmediate) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let armed = false;
    let grabOffset = 0;

    const arm = () => {
      armed = true;
      draggingRef.current = { id, follow: () => followPointer(pointerY) };
      setDragId(id);
      const el = cardRefs.current.get(id);
      if (el) {
        el.style.transition = "none";
        // Cursor's offset from the card's own top, not just from the drag
        // start point - so grabbing low on a tall card doesn't snap its top
        // up to the cursor.
        grabOffset = startY - el.getBoundingClientRect().top;
      }
    };
    if (isTouch && touchImmediate) {
      event.preventDefault();
      arm();
    }

    // Card follows the pointer 1:1 (no CSS transition - that's reserved for
    // the FLIP settle of the *other* cards) with a small velocity-based tilt,
    // like actually picking the card up rather than teleporting between slots.
    // Re-measures the card's *current* natural position every call (by
    // subtracting off the transform we applied last time) instead of trusting
    // a one-time offset from drag start - auto-scroll and live reordering
    // both keep moving the card's natural slot underneath the transform, and
    // a fixed offset drifts away from the pointer the moment either happens.
    // Natural top comes from layout (offsetTop), not the card's rect: the rect
    // includes the scale applied here, so reading it back fed that into the
    // next frame and the card trembled. No tilt either - a velocity-driven
    // rotation from a noisy pen/finger is jitter by definition.
    const followPointer = (clientY) => {
      const el = cardRefs.current.get(id);
      const list = listRef.current;
      if (!el || !list) return;
      const naturalTop = list.getBoundingClientRect().top - list.scrollTop + el.offsetTop;
      el.style.transform = `translateY(${clientY - grabOffset - naturalTop}px) scale(0.94)`;
    };

    // Insert where the pointer actually is, measured against the other cards'
    // midpoints - card heights vary with page aspect ratio, so a fixed
    // per-card step would drift. Compared using offsetTop/offsetHeight (flow
    // position), never getBoundingClientRect: a sibling that just got
    // reordered is mid-FLIP-settle-animation with its own transform applied,
    // so its rect lies about where it visually is - and while auto-scroll
    // runs, every card's rect keeps sliding too. Either one, compared against
    // a stationary cursor, flips the insert decision back and forth forever
    // (these cards are nearly as tall as the panel, so one flip swings
    // hundreds of pixels) instead of settling. offsetTop/offsetHeight reflect
    // true layout position, ignoring transforms and scroll entirely.
    const updateOrder = (clientY) => {
      const list = listRef.current;
      if (!list) return;
      const virtualY = clientY - list.getBoundingClientRect().top + list.scrollTop;
      const others = Array.from(list.children).filter(
        (card) => card.dataset.pageId !== id,
      );
      let insertAt = others.findIndex(
        (card) => virtualY < card.offsetTop + card.offsetHeight / 2,
      );
      if (insertAt === -1) insertAt = others.length;
      setOrder((current) => {
        const next = current.filter((pageId) => pageId !== id);
        next.splice(insertAt, 0, id);
        if (next.every((pageId, index) => pageId === current[index])) return current;
        orderRef.current = next;
        return next;
      });
    };

    // Cards are nearly as tall as the panel, so the drop target is usually
    // off-screen. Scroll on a timer, not on pointermove, so holding still at
    // the edge keeps scrolling instead of stalling.
    let pointerY = startY;
    const autoScroll = setInterval(() => {
      const list = listRef.current;
      if (!armed || !list) return;
      const rect = list.getBoundingClientRect();
      const edge = 70;
      const delta =
        pointerY < rect.top + edge ? -14 : pointerY > rect.bottom - edge ? 14 : 0;
      if (!delta) return;
      const before = list.scrollTop;
      list.scrollTop += delta;
      if (list.scrollTop !== before) {
        updateOrder(pointerY);
        followPointer(pointerY);
      }
    }, 16);

    const handleMove = (moveEvent) => {
      if (!armed) {
        if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < DRAG_START_PX) {
          return;
        }
        arm();
      }
      moveEvent.preventDefault();
      pointerY = moveEvent.clientY;
      followPointer(pointerY);
      updateOrder(pointerY);
    };
    const handleUp = () => {
      clearInterval(autoScroll);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      if (!armed) return;
      const el = cardRefs.current.get(id);
      if (el) animateSettle(el, el.style.transform);
      draggingRef.current = null;
      setDragId(null);
      suppressClickRef.current = true;
      onReorderPages?.(orderRef.current);
    };
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  };

  const handleCardClick = (id) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onNavigate?.(id);
  };

  const handleDeleteClick = (id) => {
    if (confirmDeleteId === id) {
      clearTimeout(confirmTimerRef.current);
      setConfirmDeleteId(null);
      onRemovePage?.(id);
      return;
    }
    setConfirmDeleteId(id);
    clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = setTimeout(() => setConfirmDeleteId(null), 2500);
  };

  return (
    <section
      className="rail-pages"
      data-testid="pages-panel"
      hidden={!active}
      aria-hidden={!active}
    >
      <header className="pages-panel-header">
        <span className="pages-panel-title">
          <FileText size={14} /> Seiten
        </span>
        <button className="editor-popover-close" onClick={onClose} title="Schließen">
          <X size={14} />
        </button>
      </header>
      <div className="pages-panel-list" ref={listRef}>
        {order.map((id, index) => {
          const rendered = renderedPages.find((p) => p.id === id);
          return (
            <div
              key={id}
              ref={(el) => {
                if (el) cardRefs.current.set(id, el);
                else cardRefs.current.delete(id);
              }}
              className={`pages-panel-card ${currentPage === index + 1 ? "active" : ""} ${
                dragId === id ? "dragging" : ""
              }`}
              onPointerDown={(event) => beginDrag(event, id, false)}
              onClick={() => handleCardClick(id)}
              data-testid="pages-panel-row"
              data-page-id={id}
            >
              <div
                className="pages-panel-thumb"
                style={{
                  aspectRatio: rendered?.aspectRatio || 0.71,
                  background: rendered?.background || "#141418",
                }}
              >
                {sourceThumbs[id] && <img src={sourceThumbs[id]} alt="" draggable={false} />}
                {rendered?.src && (
                  <img src={rendered.src} alt="" draggable={false} />
                )}
              </div>
              <div
                className="pages-panel-card-footer"
                title="Zum Verschieben ziehen"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  beginDrag(event, id, true);
                }}
              >
                <span className="pages-panel-card-label">
                  <GripVertical size={14} className="grip" />
                  Seite {index + 1}
                </span>
                <button
                  className={`pages-panel-delete ${confirmDeleteId === id ? "confirm" : ""}`}
                  disabled={order.length <= 1}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDeleteClick(id);
                  }}
                  title={
                    order.length <= 1
                      ? "Letzte Seite kann nicht gelöscht werden"
                      : confirmDeleteId === id
                        ? "Nochmal tippen zum Löschen"
                        : "Seite löschen"
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button className="pages-panel-add" onClick={() => onAddPage?.()}>
        <Plus size={16} /> Seite hinzufügen
      </button>
    </section>
  );
}
