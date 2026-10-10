import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import TabBar from '../src/components/TabBar';

describe('TabBar Component', () => {
  it('calls onTabChange when a tab is clicked', () => {
    const mockOnTabChange = vi.fn();
    render(<TabBar activeTab="smartCanvas" onTabChange={mockOnTabChange} />);
    
    const delegationButton = screen.getByRole('button', { name: /delegation/i });
    fireEvent.click(delegationButton);
    
    expect(mockOnTabChange).toHaveBeenCalledWith('delegation');
  });
});
