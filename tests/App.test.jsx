import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import App from '../src/App';

describe('App Component', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText('Smart Canvas')).toBeInTheDocument();
  });

  it('updates view when Delegation tab is clicked', () => {
    render(<App />);
    const delegationTab = screen.getByRole('button', { name: /delegation/i });
    fireEvent.click(delegationTab);
    expect(screen.getByText('Delegation Mode (TBD)')).toBeInTheDocument();
  });
});
