import { PALM_GUARD_DEFAULTS } from './inputPolicy.js';

const STORAGE_KEY = 'notes.palmGuard';

export const PALM_PROFILE_DEFAULTS = {
  detectionStrength: 56,
  smallContacts: 56,
  contactWindow: 56,
};

const clamp = (value, fallback) =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback;

// Contact geometry arrives in CSS pixels, so the palm threshold is not portable:
// the same palm reads differently on another panel's DPI and digitizer. The
// sliders exist so a device that lands outside the default can be dialled in
// instead of the guard silently misfiring, hence the mapping lives here.
export function palmGuardFromProfile(profile) {
  const strength = clamp(profile?.detectionStrength, PALM_PROFILE_DEFAULTS.detectionStrength);
  const smallContacts = clamp(profile?.smallContacts, PALM_PROFILE_DEFAULTS.smallContacts);
  const contactWindow = clamp(profile?.contactWindow, PALM_PROFILE_DEFAULTS.contactWindow);
  const postPenGuardMs = Math.round(contactWindow * 6);
  return {
    ...PALM_GUARD_DEFAULTS,
    palmContactPx: Math.round(80 - strength * 0.62),
    palmLatchMs: Math.round(smallContacts * 4),
    postPenGuardMs,
    penProximityMs: postPenGuardMs * 2,
  };
}

export function loadPalmProfile(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? { ...PALM_PROFILE_DEFAULTS, ...JSON.parse(raw) } : { ...PALM_PROFILE_DEFAULTS };
  } catch {
    return { ...PALM_PROFILE_DEFAULTS };
  }
}

export function savePalmProfile(profile, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // A full or blocked store just means the guard runs on defaults next time.
  }
}
