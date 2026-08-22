import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SplitLayout, { mixOnPaper } from '../src/components/SplitLayout';

describe('SplitLayout', () => {
  it('renders DocumentView full-page by default, with WritingZone available via the split toggle', () => {
    render(<SplitLayout activeTab="smartCanvas" />);
    expect(screen.getByTestId('document-view')).toBeInTheDocument();
    expect(screen.queryByTestId('writing-zone')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('layout-mode-btn'));
    expect(screen.getByTestId('writing-zone')).toBeInTheDocument();
  });

  it('renders TBD placeholder in delegation mode', () => {
    render(<SplitLayout activeTab="delegation" />);
    expect(screen.getByText('Delegation Mode (TBD)')).toBeInTheDocument();
  });

  it('mixOnPaper blends a hex colour onto the paper tone and stays opaque', () => {
    expect(mixOnPaper('#ffffff', 1)).toBe('#ffffff');   // volle Deckkraft = Originalfarbe
    expect(mixOnPaper('#ffffff', 0)).toBe('#1d1b21');   // keine Deckkraft = reiner Papierton
    expect(mixOnPaper('#ffffff', 0.5)).toBe('#8e8d90'); // Mitte zwischen beiden
    expect(mixOnPaper('not-a-colour', 0.4)).toBe('not-a-colour'); // unverändert durchgereicht
  });
});
