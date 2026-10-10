import { beforeEach, describe, expect, it } from 'vitest';
import {
  PALM_PROFILE_DEFAULTS,
  loadPalmProfile,
  markPenSeen,
  palmGuardFromProfile,
  savePalmProfile,
} from '../src/ink/palmSettings.js';

const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  };
};

describe('palm profile', () => {
  it('fills defaults in for a profile stored before the new fields existed', () => {
    const storage = memoryStorage();
    storage.setItem('notes.palmGuard', JSON.stringify({ detectionStrength: 20 }));
    const profile = loadPalmProfile(storage);
    expect(profile.detectionStrength).toBe(20);
    expect(profile.passiveStylus).toBe(true);
    expect(profile.measured).toBe(null);
  });

  it('prefers a measured threshold over the slider default', () => {
    const guard = palmGuardFromProfile({
      ...PALM_PROFILE_DEFAULTS,
      detectionStrength: 50,
      measured: { palmContactPx: 40, penMaxPx: 16, sizeChannel: 'geometry', geometryUsable: true },
    });
    expect(guard.palmContactPx).toBe(40);
    expect(guard.penMaxPx).toBe(16);
  });

  it('lets the strength slider scale a measured threshold by ±25 percent', () => {
    const measured = { palmContactPx: 40, penMaxPx: 16, sizeChannel: 'geometry', geometryUsable: true };
    const loose = palmGuardFromProfile({ ...PALM_PROFILE_DEFAULTS, detectionStrength: 0, measured });
    const tight = palmGuardFromProfile({ ...PALM_PROFILE_DEFAULTS, detectionStrength: 100, measured });
    expect(loose.palmContactPx).toBe(50);
    expect(tight.palmContactPx).toBe(30);
  });

  it('turns the size layer off when calibration found no usable channel', () => {
    const guard = palmGuardFromProfile({
      ...PALM_PROFILE_DEFAULTS,
      measured: { geometryUsable: false, sizeChannel: 'none' },
    });
    expect(guard.geometryUsable).toBe(false);
    expect(guard.sizeChannel).toBe('none');
  });

  it('remembers that this device has a real pen', () => {
    const storage = memoryStorage();
    markPenSeen(storage);
    expect(loadPalmProfile(storage).sawPenPointer).toBe(true);
  });
});
