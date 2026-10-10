import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recognize, isNativePlatform } = vi.hoisted(() => ({
  recognize: vi.fn(),
  isNativePlatform: vi.fn(() => true),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: (...args) => isNativePlatform(...args) },
  registerPlugin: () => ({ recognize }),
}));

import { tryRecognizeLink } from '../src/ink/linkRecognizer.js';

function stroke(points, overrides = {}) {
  return { id: 's1', pageId: 'p1', points, ...overrides };
}

describe('tryRecognizeLink', () => {
  beforeEach(() => {
    recognize.mockReset();
    isNativePlatform.mockReturnValue(true);
  });

  it('does nothing outside a native platform', async () => {
    isNativePlatform.mockReturnValue(false);
    const inkController = { removeStrokes: vi.fn(), addObject: vi.fn() };

    await tryRecognizeLink(stroke([{ x: 0, y: 0 }]), inkController);

    expect(recognize).not.toHaveBeenCalled();
    expect(inkController.addObject).not.toHaveBeenCalled();
  });

  it('swaps a recognized URL stroke for a link object', async () => {
    recognize.mockResolvedValue({ text: 'www.example.com' });
    const inkController = { removeStrokes: vi.fn(), addObject: vi.fn() };
    const points = [{ x: 10, y: 20 }, { x: 50, y: 40 }];

    await tryRecognizeLink(stroke(points), inkController);

    expect(inkController.removeStrokes).toHaveBeenCalledWith(['s1']);
    expect(inkController.addObject).toHaveBeenCalledWith(expect.objectContaining({
      type: 'link',
      href: 'https://www.example.com',
      pageId: 'p1',
      x: 10,
      y: 20,
      width: 40,
      height: 20,
    }));
  });

  it('leaves the ink alone when the recognized text is not a URL', async () => {
    recognize.mockResolvedValue({ text: 'hello there' });
    const inkController = { removeStrokes: vi.fn(), addObject: vi.fn() };

    await tryRecognizeLink(stroke([{ x: 0, y: 0 }, { x: 5, y: 5 }]), inkController);

    expect(inkController.removeStrokes).not.toHaveBeenCalled();
    expect(inkController.addObject).not.toHaveBeenCalled();
  });

  it('leaves the ink alone when recognition fails or finds nothing', async () => {
    const inkController = { removeStrokes: vi.fn(), addObject: vi.fn() };

    recognize.mockRejectedValueOnce(new Error('offline'));
    await tryRecognizeLink(stroke([{ x: 0, y: 0 }]), inkController);

    recognize.mockResolvedValueOnce({ text: '' });
    await tryRecognizeLink(stroke([{ x: 0, y: 0 }]), inkController);

    expect(inkController.removeStrokes).not.toHaveBeenCalled();
    expect(inkController.addObject).not.toHaveBeenCalled();
  });

  it('accepts a bare domain and a full https URL alike', async () => {
    const inkController = { removeStrokes: vi.fn(), addObject: vi.fn() };

    recognize.mockResolvedValueOnce({ text: 'example.com/path' });
    await tryRecognizeLink(stroke([{ x: 0, y: 0 }], { id: 'a' }), inkController);
    expect(inkController.addObject).toHaveBeenCalledWith(expect.objectContaining({ href: 'https://example.com/path' }));

    recognize.mockResolvedValueOnce({ text: 'https://sub.domain.org' });
    await tryRecognizeLink(stroke([{ x: 0, y: 0 }], { id: 'b' }), inkController);
    expect(inkController.addObject).toHaveBeenCalledWith(expect.objectContaining({ href: 'https://sub.domain.org' }));
  });
});
