import { useEffect, useRef } from "react";

// The native scrollbar on this tablet is a few pixels wide: too thin to grab,
// and grabbing it is the only way to cross a long document quickly. A wide
// invisible grab area would fix that but eat every swipe that starts near the
// edge, so this one only exists for a finger that *holds* there: press in the
// right-hand strip and keep still, and after HOLD_MS a fat thumb appears and
// follows the finger like a scrollbar. Move before that and the touch is an
// ordinary swipe, untouched.
//
// Everything here is DOM and listeners, no React state: DocumentView is huge
// and a re-render per touch move is exactly the jank this exists to avoid.
//
// ponytail: touch only (the pen draws and a mouse has the real scrollbar),
// one grip at a time. The numbers are the calibration knobs.
export const HOLD_MS = 350;
export const EDGE_PX = 56;
const SLOP_PX = 10;
const MIN_THUMB_PX = 56;
const THUMB_WIDTH_PX = 12;

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

export default function useScrollbarGrip(scrollRef, { onEngage } = {}) {
  // Read late: DocumentView hands over a fresh function every render, and
  // restarting the listeners for that would drop a grip in progress.
  const onEngageRef = useRef(onEngage);
  onEngageRef.current = onEngage;

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return undefined;

    const thumb = document.createElement("div");
    thumb.className = "scroll-grip-thumb";
    document.body.append(thumb);

    let press = null; // finger down in the strip, still waiting out HOLD_MS
    let grip = null; // finger that has become a scrollbar
    let frame = 0;

    const geometry = () => {
      const rect = scroller.getBoundingClientRect();
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const height = clamp(
        (rect.height * scroller.clientHeight) / Math.max(1, scroller.scrollHeight),
        MIN_THUMB_PX,
        rect.height,
      );
      const travel = Math.max(0, rect.height - height);
      const top = rect.top + (max > 0 ? scroller.scrollTop / max : 0) * travel;
      return { rect, max, height, travel, top };
    };

    const place = () => {
      const { rect, height, top } = geometry();
      thumb.style.height = `${height}px`;
      thumb.style.transform = `translate(${rect.right - THUMB_WIDTH_PX - 4}px, ${top}px)`;
    };

    const inStrip = (event) => {
      const rect = scroller.getBoundingClientRect();
      // Past the scroller's own edge counts too: its right margin is exactly
      // where a thumb reaching for the scrollbar lands.
      return (
        event.clientX >= rect.right - EDGE_PX &&
        event.clientX <= rect.right + 24 &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      );
    };

    const cancelPress = () => {
      if (press) clearTimeout(press.timer);
      press = null;
    };

    const engage = (pointerId, y) => {
      press = null;
      // Whatever the page's own handlers started with this finger — a pan, a
      // dot of ink — is not what the user is doing any more.
      onEngageRef.current?.(pointerId);
      const { top, height } = geometry();
      // Grabbing the thumb keeps it where it is under the finger; grabbing the
      // track puts the thumb's middle there.
      const offset = y >= top && y <= top + height ? y - top : height / 2;
      grip = { pointerId, offset };
      place();
      thumb.classList.add("is-gripped");
    };

    const drag = (y) => {
      const { rect, max, travel } = geometry();
      const ratio = travel > 0 ? clamp((y - grip.offset - rect.top) / travel, 0, 1) : 0;
      scroller.scrollTop = ratio * max;
      place();
    };

    const onDown = (event) => {
      if (event.pointerType !== "touch" || !event.isPrimary || grip) return;
      if (!inStrip(event)) return;
      cancelPress();
      press = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        timer: setTimeout(() => engage(event.pointerId, event.clientY), HOLD_MS),
      };
    };

    const onMove = (event) => {
      if (grip?.pointerId === event.pointerId) {
        event.stopImmediatePropagation();
        event.preventDefault();
        const y = event.clientY;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => grip && drag(y));
        return;
      }
      if (press?.pointerId === event.pointerId) {
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > SLOP_PX) cancelPress();
      }
    };

    const onUp = (event) => {
      if (grip?.pointerId === event.pointerId) {
        event.stopImmediatePropagation();
        event.preventDefault();
        cancelAnimationFrame(frame);
        grip = null;
        thumb.classList.remove("is-gripped");
        return;
      }
      if (press?.pointerId === event.pointerId) cancelPress();
    };

    // Capture on document: sees every touch before the page's handlers, and
    // can keep a gripping finger away from them.
    const options = { capture: true, passive: false };
    document.addEventListener("pointerdown", onDown, options);
    document.addEventListener("pointermove", onMove, options);
    document.addEventListener("pointerup", onUp, options);
    document.addEventListener("pointercancel", onUp, options);
    return () => {
      document.removeEventListener("pointerdown", onDown, options);
      document.removeEventListener("pointermove", onMove, options);
      document.removeEventListener("pointerup", onUp, options);
      document.removeEventListener("pointercancel", onUp, options);
      cancelPress();
      cancelAnimationFrame(frame);
      thumb.remove();
    };
  }, [scrollRef]);
}

// Left-hand scrubber: a fat horizontal track in the top-left quarter of the
// screen. Dragging the thumb scrolls the document sideways (x axis), so the left
// hand can pan while the right one writes. Hidden while nothing overflows.
export function useLeftHandScrubber(scrollRef, { onEngage } = {}) {
  const onEngageRef = useRef(onEngage);
  onEngageRef.current = onEngage;

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return undefined;

    const track = document.createElement("div");
    track.className = "scroll-scrubber";
    const thumb = document.createElement("div");
    thumb.className = "scroll-scrubber-thumb";
    track.append(thumb);
    document.body.append(track);

    let frame = 0;
    let dragId = null;
    let offset = 0;

    const geometry = () => {
      const width = track.clientWidth;
      const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      const size = clamp((width * scroller.clientWidth) / Math.max(1, scroller.scrollWidth), MIN_THUMB_PX, width);
      return { width, max, size, travel: Math.max(0, width - size) };
    };

    const place = () => {
      const { max, size, travel } = geometry();
      track.classList.toggle("is-idle", max <= 1);
      thumb.style.width = `${size}px`;
      thumb.style.transform = `translateX(${(max > 0 ? scroller.scrollLeft / max : 0) * travel}px)`;
    };

    const drag = (clientX) => {
      const { max, travel } = geometry();
      const x = clientX - track.getBoundingClientRect().left;
      scroller.scrollLeft = (travel > 0 ? clamp((x - offset) / travel, 0, 1) : 0) * max;
    };

    const onDown = (event) => {
      if (dragId !== null) return;
      event.preventDefault();
      event.stopPropagation();
      onEngageRef.current?.(event.pointerId);
      dragId = event.pointerId;
      track.setPointerCapture(dragId);
      const { size } = geometry();
      const left = track.getBoundingClientRect().left;
      const thumbLeft = left + Number.parseFloat(/-?[\d.]+/.exec(thumb.style.transform)?.[0] || 0);
      // Grabbing the thumb keeps it under the finger; the track centres it.
      offset = event.clientX >= thumbLeft && event.clientX <= thumbLeft + size ? event.clientX - thumbLeft : size / 2;
      track.classList.add("is-gripped");
      drag(event.clientX);
    };
    const onMove = (event) => {
      if (event.pointerId !== dragId) return;
      event.preventDefault();
      const x = event.clientX;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => drag(x));
    };
    const onUp = (event) => {
      if (event.pointerId !== dragId) return;
      dragId = null;
      track.classList.remove("is-gripped");
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };

    track.addEventListener("pointerdown", onDown);
    track.addEventListener("pointermove", onMove);
    track.addEventListener("pointerup", onUp);
    track.addEventListener("pointercancel", onUp);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    place();
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
      track.remove();
    };
  }, [scrollRef]);
}
