import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useScrollbarGrip, { EDGE_PX, HOLD_MS } from '../src/components/document/useScrollbarGrip.js';

// 1000x600 scroller at the origin, 6000px of content: max scrollTop 5400.
function makeScroller() {
  const el = document.createElement('div');
  document.body.append(el);
  el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 });
  Object.defineProperty(el, 'clientHeight', { value: 600 });
  Object.defineProperty(el, 'scrollHeight', { value: 6000 });
  el.scrollTop = 0;
  return el;
}

const fire = (type, x, y, extra = {}) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: x, clientY: y, ...extra });
  document.body.dispatchEvent(event);
  return event;
};

describe('useScrollbarGrip', () => {
  let scroller;
  let onEngage;
  let unmount;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
    vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id));
    scroller = makeScroller();
    onEngage = vi.fn();
    ({ unmount } = renderHook(() => useScrollbarGrip({ current: scroller }, { onEngage })));
  });
  afterEach(() => {
    unmount();
    scroller.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('leaves a quick touch in the strip alone', () => {
    fire('pointerdown', 990, 100);
    vi.advanceTimersByTime(HOLD_MS - 50);
    fire('pointerup', 990, 100);
    vi.advanceTimersByTime(1000);
    expect(onEngage).not.toHaveBeenCalled();
    expect(document.querySelector('.scroll-grip-thumb').classList.contains('is-gripped')).toBe(false);
  });

  it('treats a touch that moves before the hold is up as an ordinary swipe', () => {
    fire('pointerdown', 990, 100);
    fire('pointermove', 990, 130);
    vi.advanceTimersByTime(HOLD_MS + 100);
    expect(onEngage).not.toHaveBeenCalled();
  });

  it('ignores holds outside the strip and holds by anything but a finger', () => {
    fire('pointerdown', 1000 - EDGE_PX - 20, 100);
    fire('pointerdown', 990, 100, { pointerType: 'pen', pointerId: 2 });
    vi.advanceTimersByTime(HOLD_MS + 100);
    expect(onEngage).not.toHaveBeenCalled();
  });

  it('grabbing the thumb keeps it where it is under the finger', () => {
    fire('pointerdown', 990, 40); // the thumb spans 0..60 at scrollTop 0
    vi.advanceTimersByTime(HOLD_MS + 10);
    expect(onEngage).toHaveBeenCalledTimes(1);
    fire('pointermove', 990, 330);
    vi.advanceTimersByTime(20);
    // Grab offset 40, travel 540: ratio (330 - 40) / 540.
    expect(scroller.scrollTop).toBeCloseTo((290 / 540) * 5400, 0);
  });

  it('turns a hold on the track into a scrollbar and hides the drag from the page', () => {
    fire('pointerdown', 990, 200); // off the thumb: its middle (30px) goes under the finger
    vi.advanceTimersByTime(HOLD_MS + 10);
    expect(onEngage).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.scroll-grip-thumb').classList.contains('is-gripped')).toBe(true);

    vi.advanceTimersByTime(20);
    expect(scroller.scrollTop).toBe(0); // engaging alone must not jump the page
    const move = fire('pointermove', 990, 330);
    vi.advanceTimersByTime(20);
    expect(scroller.scrollTop).toBeCloseTo((300 / 540) * 5400, 0);

    fire('pointermove', 990, 2000);
    vi.advanceTimersByTime(20);
    expect(scroller.scrollTop).toBe(5400); // pinned at the end, never past it

    const up = fire('pointerup', 990, 2000);
    expect(document.querySelector('.scroll-grip-thumb').classList.contains('is-gripped')).toBe(false);
    expect(move.defaultPrevented).toBe(true);
    expect(up.defaultPrevented).toBe(true);
  });
});
