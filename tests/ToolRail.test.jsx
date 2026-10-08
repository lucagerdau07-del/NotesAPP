import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import ToolRail, { TEXT_TOOL } from '../src/components/ToolRail.jsx';

afterEach(() => vi.restoreAllMocks());

function railProps(overrides = {}) {
  return {
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    canUndo: true,
    canRedo: false,
    tool: 'pen',
    setInputMode: vi.fn(),
    isMoveMode: false,
    isEraser: false,
    setIsEraser: vi.fn(),
    setIsSelectMode: vi.fn(),
    isBucketMode: false,
    setIsBucketMode: vi.fn(),
    isLassoMode: false,
    setIsLassoMode: vi.fn(),
    setLassoSelection: vi.fn(),
    placingTool: null,
    setPlacingTool: vi.fn(),
    isDesignToolsOpen: false,
    setIsDesignToolsOpen: vi.fn(),
    isTextSettingsOpen: false,
    setIsTextSettingsOpen: vi.fn(),
    setIsPenSettingsOpen: vi.fn(),
    setIsEraserSettingsOpen: vi.fn(),
    setIsColorPickerOpen: vi.fn(),
    anchorPopoverToButton: vi.fn(),
    customColors: ['#111111', '#222222', '#333333'],
    penColor: '#111111',
    applyPenColor: vi.fn(),
    setActivePickerIndex: vi.fn(),
    isCommentMode: false,
    setIsCommentMode: vi.fn(),
    isLayersOpen: false,
    toggleLayers: vi.fn(),
    ...overrides,
  };
}

test('renders the shared tool set and no focus-box button by default', () => {
  render(<ToolRail {...railProps()} />);
  for (const id of ['move-tool-btn', 'pen-tool-btn', 'bucket-tool-btn', 'lasso-tool-btn', 'design-tools-btn', 'text-tool-btn', 'comment-btn', 'layers-toggle-btn']) {
    expect(screen.getByTestId(id)).toBeInTheDocument();
  }
  expect(screen.getByTitle('Radiergummi')).toBeInTheDocument();
  expect(document.querySelectorAll('.rail-color-wrapper')).toHaveLength(3);
  expect(screen.queryByTestId('select-mode-btn')).toBeNull();
  expect(screen.getByTitle('Wiederholen')).toBeDisabled();
});

test('pen is the active tool until another mode takes over', () => {
  const { rerender } = render(<ToolRail {...railProps()} />);
  expect(screen.getByTestId('pen-tool-btn')).toHaveClass('active');
  rerender(<ToolRail {...railProps({ isEraser: true })} />);
  expect(screen.getByTestId('pen-tool-btn')).not.toHaveClass('active');
  expect(screen.getByTitle('Radiergummi')).toHaveClass('active');
  rerender(<ToolRail {...railProps({ isEraser: true, isSelectMode: true })} />);
  expect(screen.getByTitle('Radiergummi')).not.toHaveClass('active');
});

test('eraser button arms the eraser first, opens settings on the second tap', () => {
  const props = railProps();
  const { rerender } = render(<ToolRail {...props} />);
  fireEvent.click(screen.getByTitle('Radiergummi'));
  expect(props.setIsEraser).toHaveBeenCalledWith(true);
  expect(props.setIsEraserSettingsOpen).not.toHaveBeenCalled();

  rerender(<ToolRail {...props} isEraser />);
  fireEvent.click(screen.getByTitle('Radiergummi'));
  expect(props.anchorPopoverToButton).toHaveBeenCalled();
  expect(props.setIsEraserSettingsOpen).toHaveBeenCalledTimes(1);
});

test('leaving move mode when a drawing tool is picked', () => {
  const props = railProps({ isMoveMode: true });
  render(<ToolRail {...props} />);
  fireEvent.click(screen.getByTitle('Radiergummi'));
  expect(props.setInputMode).toHaveBeenCalledWith('stylus');
});

test('text button arms the text tool', () => {
  const props = railProps();
  render(<ToolRail {...props} />);
  fireEvent.click(screen.getByTestId('text-tool-btn'));
  expect(props.setPlacingTool).toHaveBeenCalledWith(TEXT_TOOL);
  expect(props.setIsEraser).toHaveBeenCalledWith(false);
});

test('focus-box button arms the box and leaves the other modes', () => {
  const onFocusBoxArm = vi.fn();
  const props = railProps({ showFocusBoxButton: true, onFocusBoxArm });
  render(<ToolRail {...props} />);
  fireEvent.click(screen.getByTestId('select-mode-btn'));
  expect(props.setIsSelectMode).toHaveBeenCalledWith(true);
  expect(props.setIsEraser).toHaveBeenCalledWith(false);
  expect(onFocusBoxArm).toHaveBeenCalledOnce();
});

test('an inactive color slot applies its color, the active one opens the picker', () => {
  const props = railProps();
  render(<ToolRail {...props} />);
  fireEvent.click(screen.getByTestId('color-slot-1'));
  expect(props.applyPenColor).toHaveBeenCalledWith('#222222');
  expect(props.setActivePickerIndex).toHaveBeenCalledWith(1);

  fireEvent.click(screen.getByTestId('color-slot-0'));
  expect(props.setIsColorPickerOpen).toHaveBeenCalled();
});
