import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import useCanvas from '../src/hooks/useCanvas';

describe('useCanvas', () => {
  it('should initialize isDrawing to false', () => {
    const { result } = renderHook(() => useCanvas());
    expect(result.current.isDrawing).toBe(false);
  });
});
