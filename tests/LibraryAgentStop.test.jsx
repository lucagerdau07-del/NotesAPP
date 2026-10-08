import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const stop = vi.fn();
vi.mock('../src/hooks/useAgent.js', () => ({
  default: () => ({
    messages: [], sessions: [], activeId: 'a', steps: [], isRunning: true, error: null,
    tokens: 0, elapsedMs: 0, streamText: '', send: vi.fn(), stop, clear: vi.fn(),
    selectSession: vi.fn(), startNew: vi.fn(), deleteSession: vi.fn(), renameSession: vi.fn(),
  }),
}));
vi.mock('../src/hooks/useLiquidGlass.js', () => ({ default: vi.fn() }));

import Library from '../src/components/Library.jsx';

describe('Library agent cancel', () => {
  it('stops a running agent from the search bar and from the status row', () => {
    render(<Library documentLibraryOptions={{ repository: { listImportedNotes: vi.fn(async () => []) } }} />);
    fireEvent.click(screen.getByTestId('agent-stop-btn'));
    expect(stop).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('agent-cancel-btn'));
    expect(stop).toHaveBeenCalledTimes(2);
  });
});
