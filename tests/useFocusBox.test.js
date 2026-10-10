import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import useFocusBox from '../src/hooks/useFocusBox';

describe('useFocusBox', () => {
  it('initializes the focus rectangle on the requested page', () => {
    const { result } = renderHook(() => useFocusBox(['note-page-1', 'note-page-2']));
    expect(result.current.focusBox).toEqual({
      pageId: 'note-page-1',
      x: 50,
      y: 50,
      width: 250,
      height: 100
    });
  });

  it('updates page-local coordinates on drag without changing pages', () => {
    const { result } = renderHook(() => useFocusBox(['note-page-2']));
    act(() => {
      result.current.handleDrag(20, -10);
    });
    expect(result.current.focusBox).toEqual({
      pageId: 'note-page-2',
      x: 70,
      y: 40,
      width: 250,
      height: 100
    });
  });

  it('moves the focus rectangle to a new document page without retaining a stale page id', () => {
    const { result, rerender } = renderHook(
      ({ pageIds }) => useFocusBox(pageIds),
      { initialProps: { pageIds: ['first-note-page-1'] } },
    );

    rerender({ pageIds: ['second-note-page-1'] });

    expect(result.current.focusBox).toEqual({
      pageId: 'second-note-page-1',
      x: 50,
      y: 50,
      width: 250,
      height: 100,
    });
  });

  it('resets to a live page when the selected page is removed', () => {
    const { result, rerender } = renderHook(
      ({ pageIds }) => useFocusBox(pageIds),
      { initialProps: { pageIds: ['note-page-1', 'note-page-2'] } },
    );
    act(() => {
      result.current.setFocusBox({
        pageId: 'note-page-2', x: 20, y: 30, width: 200, height: 80,
      });
    });

    rerender({ pageIds: ['note-page-1'] });

    expect(result.current.focusBox).toEqual({
      pageId: 'note-page-1', x: 50, y: 50, width: 250, height: 100,
    });
  });
});
