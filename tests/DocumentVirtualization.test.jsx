import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import DocumentPage from '../src/components/document/DocumentPage.jsx';

describe('DocumentPage Virtualization', () => {
  let observerCallback;
  let observerOptions;
  beforeEach(() => {
    globalThis.IntersectionObserver = class {
      constructor(cb, options) {
        observerCallback = cb;
        observerOptions = options;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('defers rendering of canvases until intersecting, and hides again once it settles out of view', () => {
    const page = { id: 'p1', index: 0, width: 800, height: 1200 };
    const { container } = render(
      <DocumentPage
        page={page}
        sourceType="pdf"
        sourceHandle={{ document: {} }}
      />
    );

    expect(container.querySelector('canvas')).not.toBeInTheDocument();

    act(() => {
      observerCallback([{ isIntersecting: true }]);
    });

    expect(container.querySelector('canvas')).toBeInTheDocument();

    act(() => {
      observerCallback([{ isIntersecting: false }]);
      vi.advanceTimersByTime(400);
    });

    expect(container.querySelector('canvas')).not.toBeInTheDocument();
  });

  it('stops rendering a page ahead once zoom makes a page canvas expensive', () => {
    // A page's canvas costs zoom² pixels while this band is a fixed share of
    // the viewport, so "one page ahead" costs 4MB at 1x and 61MB at 3x, twice
    // over for background plus ink. Measured on the tablet: 246MB of canvas at
    // 3x and CrRendererMain aborting on its allocation ceiling.
    const page = { id: 'p1', index: 0, width: 800, height: 1200 };
    const marginAt = (zoom) => {
      render(
        <DocumentPage page={page} sourceType="pdf" sourceHandle={{ document: {} }} zoom={zoom} />
      );
      return Number.parseInt(observerOptions.rootMargin, 10);
    };

    expect(marginAt(1)).toBe(150);
    expect(marginAt(3)).toBeLessThan(30);
  });

  it('does not unmount the canvas on a brief flicker out of view (pinch/zoom transform jitter)', () => {
    // A pinch/zoom preview transforms the shared ancestor of every page every
    // frame, which can flicker a page in and out of the observer's margin
    // many times a second. Losing the canvas on every flicker is what blinked
    // the PDF and retriggered a full LiquidGlass recapture each time.
    const page = { id: 'p1', index: 0, width: 800, height: 1200 };
    const { container } = render(
      <DocumentPage
        page={page}
        sourceType="pdf"
        sourceHandle={{ document: {} }}
      />
    );

    act(() => {
      observerCallback([{ isIntersecting: true }]);
    });
    expect(container.querySelector('canvas')).toBeInTheDocument();

    act(() => {
      observerCallback([{ isIntersecting: false }]);
      vi.advanceTimersByTime(100);
      observerCallback([{ isIntersecting: true }]);
      vi.advanceTimersByTime(400);
    });

    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('keeps the canvas while a pinch previews itself with a transform', () => {
    // The preview moves the page's rendered box without relayouting, so the
    // observer reports pages out of view that never went anywhere. Dropping
    // the canvas there costs a full pdf.js re-render on the way back - the
    // blink. DocumentView flags the transformed ancestor for the duration.
    const page = { id: 'p1', index: 0, width: 800, height: 1200 };
    const { container } = render(
      <DocumentPage page={page} sourceType="pdf" sourceHandle={{ document: {} }} />
    );

    act(() => {
      observerCallback([{ isIntersecting: true }]);
    });
    container.setAttribute('data-pinch-preview', '');

    act(() => {
      observerCallback([{ isIntersecting: false }]);
      vi.advanceTimersByTime(2000);
    });
    expect(container.querySelector('canvas')).toBeInTheDocument();

    // Gesture committed: the next report is about the real layout again.
    container.removeAttribute('data-pinch-preview');
    act(() => {
      observerCallback([{ isIntersecting: false }]);
      vi.advanceTimersByTime(400);
    });
    expect(container.querySelector('canvas')).not.toBeInTheDocument();
  });

  it('gives up on a flag that never clears instead of pinning the canvas', () => {
    // Every mounted page holds a full-size canvas and the tablet's WebView
    // renderer is 32-bit: a stuck flag pinning every page on screen ran it out
    // of canvas memory and killed the app (SIGTRAP in CrRendererMain).
    const page = { id: 'p1', index: 0, width: 800, height: 1200 };
    const { container } = render(
      <DocumentPage page={page} sourceType="pdf" sourceHandle={{ document: {} }} />
    );

    act(() => {
      observerCallback([{ isIntersecting: true }]);
    });
    container.setAttribute('data-pinch-preview', '');

    act(() => {
      observerCallback([{ isIntersecting: false }]);
      vi.advanceTimersByTime(60_000);
    });

    expect(container.querySelector('canvas')).not.toBeInTheDocument();
  });
});
