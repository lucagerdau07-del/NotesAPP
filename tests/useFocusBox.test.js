import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import useFocusBox from '../src/hooks/useFocusBox';

describe('useFocusBox', () => {
  it('should initialize with default dimensions', () => {
    const { result } = renderHook(() => useFocusBox());
    expect(result.current.focusBox).toEqual({
      x: 50,
      y: 50,
      width: 250,
      height: 100
    });
  });

  it('should update coordinates on drag', () => {
    const { result } = renderHook(() => useFocusBox());
    act(() => {
      result.current.handleDrag(20, -10);
    });
    expect(result.current.focusBox).toEqual({
      x: 70,
      y: 40,
      width: 250,
      height: 100
    });
  });
});
