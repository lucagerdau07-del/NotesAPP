import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SplitLayout from '../src/components/SplitLayout';

describe('SplitLayout', () => {
  it('renders both DocumentView and WritingZone in Smart Canvas mode', () => {
    render(<SplitLayout activeTab="smartCanvas" />);
    expect(screen.getByTestId('document-view')).toBeInTheDocument();
    expect(screen.getByTestId('writing-zone')).toBeInTheDocument();
  });

  it('renders TBD placeholder in delegation mode', () => {
    render(<SplitLayout activeTab="delegation" />);
    expect(screen.getByText('Delegation Mode (TBD)')).toBeInTheDocument();
  });
});
