import { render, act } from '@testing-library/react';
import { expect, test } from 'vitest';
import SplitLayout from '../src/components/SplitLayout';

// The pages panel reorders/adds pages in the ink document; an imported PDF's
// layout used to follow note.pages instead, so nothing moved on screen.
test('imported document follows the ink page order and keeps each page on its own source page', () => {
  const note = {
    id: 'imported-order',
    kind: 'imported',
    title: 'Scan',
    source: { fileId: 'file-order', type: 'pdf' },
    pages: [
      { id: 'imported-order-page-1', index: 0, width: 800, height: 1200 },
      { id: 'imported-order-page-2', index: 1, width: 800, height: 600 },
    ],
  };
  const ref = { current: null };
  const { container } = render(
    <SplitLayout activeTab="smartCanvas" note={note} inkControllerRef={ref} />,
  );
  const order = () =>
    [...container.querySelectorAll('.document-page')].map((el) => [
      el.dataset.pageId,
      el.style.height,
    ]);

  act(() => ref.current.reorderPages(['imported-order-page-2', 'imported-order-page-1']));
  expect(order()).toEqual([
    ['imported-order-page-2', '600px'],
    ['imported-order-page-1', '1200px'],
  ]);

  act(() => ref.current.addPage());
  expect(order()).toHaveLength(3);
});
