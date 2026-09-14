import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FileText, GripVertical, Plus, Trash2, X } from "lucide-react";
import { renderPagesFromDocument, subscribeToPreviewImages } from "../documents/notePreview.js";

const DRAG_START_PX = 5;

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
  const draggingRef = useRef(null);
  const orderRef = useRef(pages);
  const confirmTimerRef = useRef(null);
  const listRef = useRef(null);
  const suppressClickRef = useRef(false);
  const cardRefs = useRef(new Map());
  const prevRectsRef = useRef(new Map());

  // Play a transform-only transition then hand the element back to its CSS
  // class - an inline `transition` left in place would otherwise override
  // the class's own border-color/box-shadow transitions forever after.
  const animateSettle = (el, fromTransform) => {
    el.style.transition = "none";
    el.style.transform = fromTransform;
    requestAnimationFrame(() => {
      // Overshoot easing - snaps past rest then settles, instead of a smooth glide.
      el.style.transition = "transform 160ms cubic-bezier(.34,1.56,.64,1)";
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
  // which is already following the pointer directly.
  useLayoutEffect(() => {
    const nextRects = new Map();
    order.forEach((id) => {
      const el = cardRefs.current.get(id);
      if (el) nextRects.set(id, el.getBoundingClientRect());
    });
    nextRects.forEach((rect, id) => {
      if (id === dragId) return;
      const el = cardRefs.current.get(id);
      const prevRect = prevRectsRef.current.get(id);
      if (!el || !prevRect) return;
      const dy = prevRect.top - rect.top;
      if (Math.abs(dy) < 1) return;
      animateSettle(el, `translateY(${dy}px)`);
    });
    prevRectsRef.current = nextRects;
  }, [order, dragId]);

  const refreshRenderedPages = () => {
    const doc = inkControllerRef?.current?.document;
    if (doc) setRenderedPages(renderPagesFromDocument(doc, { maxDimension: 500 }));
  };

  // Pulled from the imperative controller ref (not reactive props) so drawing
  // elsewhere doesn't re-render this panel on every stroke - only page-list
  // changes and (re)opening the panel refresh the thumbnails.
  useEffect(() => {
    if (!active) return;
    refreshRenderedPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pages]);

  // Image/fill objects decode async; once one lands, re-render so it shows
  // up instead of staying blank until the next unrelated refresh.
  useEffect(() => subscribeToPreviewImages(() => active && refreshRenderedPages()), [active]);

  useEffect(() => () => clearTimeout(confirmTimerRef.current), []);

  // A mouse drag starts the moment the pointer moves - people press and drag in
  // one motion, so a hold-still-first gesture never arms for them. Touch keeps
  // the card free for scrolling and drags via the grip handle instead.
  const beginDrag = (event, id, immediate) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (!immediate && event.pointerType !== "mouse") return;
    const startX = event.clientX;
    const startY = event.clientY;
    let armed = false;
    let lastY = event.clientY;
    let tilt = 0;

    const arm = () => {
      armed = true;
      draggingRef.current = { id };
      setDragId(id);
      const el = cardRefs.current.get(id);
      if (el) el.style.transition = "none";
    };
    if (immediate) {
      event.preventDefault();
      arm();
    }

    // Card follows the pointer 1:1 (no CSS transition - that's reserved for
    // the FLIP settle of the *other* cards) with a small velocity-based tilt,
    // like actually picking the card up rather than teleporting between slots.
    const followPointer = (clientY) => {
      const el = cardRefs.current.get(id);
      if (!el) return;
      const velocity = clientY - lastY;
      lastY = clientY;
      tilt = Math.max(-8, Math.min(8, tilt * 0.6 + velocity * 0.5));
      el.style.transform = `translateY(${clientY - startY}px) scale(1.03) rotate(${tilt}deg)`;
    };

    // Insert where the pointer actually is, measured against the other cards'
    // midpoints - card heights vary with page aspect ratio and the list
    // scrolls, so a fixed per-card step would drift.
    const updateOrder = (clientY) => {
      const others = Array.from(listRef.current?.children ?? []).filter(
        (card) => card.dataset.pageId !== id,
      );
      let insertAt = others.findIndex((card) => {
        const rect = card.getBoundingClientRect();
        return clientY < rect.top + rect.height / 2;
      });
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
      if (list.scrollTop !== before) updateOrder(pointerY);
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
