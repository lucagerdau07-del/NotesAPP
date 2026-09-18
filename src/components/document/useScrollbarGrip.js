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
