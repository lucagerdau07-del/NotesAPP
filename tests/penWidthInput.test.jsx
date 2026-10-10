import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { PenSettingsPopover } from '../src/components/DocumentView';

function setup(rawLineWidth = 3) {
  const setLineWidth = vi.fn();
  render(
    <PenSettingsPopover
      tool="pen"
      rawLineWidth={rawLineWidth}
      setLineWidth={setLineWidth}
      penColor="#ffffff"
      onClose={() => {}}
    />,
  );
  return { setLineWidth, input: screen.getByTestId('pen-width-input') };
}

test('pen slider reaches hairlines in 0.1 steps', () => {
  setup();
  const slider = document.querySelector('.thickness-slider');
  expect(slider).toHaveAttribute('min', '0.1');
  expect(slider).toHaveAttribute('step', '0.1');
});

test('typed pen width commits on blur, rounded to 0.1 and clamped', () => {
  const { setLineWidth, input } = setup();
  fireEvent.change(input, { target: { value: '0.25' } });
  fireEvent.blur(input);
  expect(setLineWidth).toHaveBeenLastCalledWith(0.3);
  fireEvent.change(input, { target: { value: '0' } });
  fireEvent.blur(input);
  expect(setLineWidth).toHaveBeenLastCalledWith(0.1);
  fireEvent.change(input, { target: { value: '99' } });
  fireEvent.blur(input);
  expect(setLineWidth).toHaveBeenLastCalledWith(20);
});

test('garbage in the pen width field leaves the width alone', () => {
  const { setLineWidth, input } = setup();
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.blur(input);
  expect(setLineWidth).not.toHaveBeenCalled();
});
