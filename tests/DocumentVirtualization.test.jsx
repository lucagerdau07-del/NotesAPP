import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import DocumentPage from '../src/components/document/DocumentPage.jsx';

describe('DocumentPage Virtualization', () => {
  let observerCallback;
  beforeEach(() => {
    globalThis.IntersectionObserver = class {
      constructor(cb) {
        observerCallback = cb;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    };
  });

  it('defers rendering of canvases until intersecting', () => {
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
    });

    expect(container.querySelector('canvas')).not.toBeInTheDocument();
  });
});
