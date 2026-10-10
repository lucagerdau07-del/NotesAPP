import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CalculatorPanel from '../CalculatorPanel.jsx';

describe('CalculatorPanel component', () => {
  it('renders panel with title and device image when active', () => {
    const onClose = vi.fn();
    render(<CalculatorPanel active={true} onClose={onClose} />);

    expect(screen.getByTestId('calculator-panel')).toBeInTheDocument();
    expect(screen.getByText('CASIO fx-991DEX')).toBeInTheDocument();
    expect(screen.getByAltText('CASIO fx-991DEX ClassWiz')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<CalculatorPanel active={true} onClose={onClose} />);

    const closeBtn = screen.getByTitle('Schließen');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('updates display when clicking number buttons and equals', () => {
    render(<CalculatorPanel active={true} onClose={() => {}} />);

    const btn7 = screen.getByTitle('7');
    const btnPlus = screen.getByTitle('+');
    const btn8 = screen.getByTitle('8');
    const btnEquals = screen.getByTitle('=');

    fireEvent.click(btn7);
    fireEvent.click(btnPlus);
    fireEvent.click(btn8);
    fireEvent.click(btnEquals);

    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('clears screen when AC is pressed', () => {
    render(<CalculatorPanel active={true} onClose={() => {}} />);

    const btn5 = screen.getByTitle('5');
    const btnAC = screen.getByTitle('AC');

    fireEvent.click(btn5);
    expect(screen.getByText('5')).toBeInTheDocument();

    fireEvent.click(btnAC);
    expect(screen.queryByText('5')).toBeNull();
  });
});
