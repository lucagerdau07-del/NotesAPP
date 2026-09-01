import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Settings from '../src/components/Settings.jsx';
import { loadPalmProfile } from '../src/ink/palmSettings.js';

const stroke = (element, sizes) => {
  sizes.forEach((size, index) => {
    fireEvent.pointerDown(element, {
      pointerId: 1, pointerType: 'touch', width: size, height: size,
      clientX: index * 5, clientY: 0, pressure: 0.5,
    });
    fireEvent.pointerMove(element, {
      pointerId: 1, pointerType: 'touch', width: size, height: size,
      clientX: index * 5 + 3, clientY: 0, pressure: 0.5,
    });
    fireEvent.pointerUp(element, { pointerId: 1, pointerType: 'touch' });
  });
};

describe('palm calibration wizard', () => {
  it('writes measured thresholds into the profile', () => {
    render(<Settings onBack={() => {}} />);
    fireEvent.click(screen.getByTestId('recalibrate-btn'));

    stroke(screen.getByTestId('calibration-surface'), [8, 9, 10, 11, 12]);
    fireEvent.click(screen.getByTestId('calibration-next'));

    stroke(screen.getByTestId('calibration-surface'), [50, 55, 60, 65, 70]);
    fireEvent.click(screen.getByTestId('calibration-finish'));

    const measured = loadPalmProfile().measured;
    expect(measured.geometryUsable).toBe(true);
    expect(measured.palmContactPx).toBeGreaterThan(measured.penMaxPx);
  });

  it('reports honestly when the panel cannot separate pen from palm', () => {
    render(<Settings onBack={() => {}} />);
    fireEvent.click(screen.getByTestId('recalibrate-btn'));

    stroke(screen.getByTestId('calibration-surface'), [33, 33, 33, 33]);
    fireEvent.click(screen.getByTestId('calibration-next'));

    stroke(screen.getByTestId('calibration-surface'), [33, 33, 33, 33]);
    fireEvent.click(screen.getByTestId('calibration-finish'));

    expect(loadPalmProfile().measured.geometryUsable).toBe(false);
    expect(screen.getByTestId('calibration-result')).toHaveTextContent(/nicht/i);
  });
});
