import { PALM_GUARD_DEFAULTS } from './inputPolicy.js';

const STORAGE_KEY = 'notes.palmGuard';

export const PALM_PROFILE_DEFAULTS = {
  detectionStrength: 56,
  smallContacts: 56,
  contactWindow: 56,
  passiveStylus: true,
  // Written once by the calibration wizard; null means "never measured".
  measured: null,
  // Persisted so a tablet that does have a digitizer never falls back to the
  // passive-stylus path just because no pen has touched down yet this session.
  sawPenPointer: false,
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
  const measured = profile?.measured ?? null;
  // A measured threshold beats a formula; the slider then trims it by a
  // quarter either way, because the hand that was calibrated is not always the
  // grip that is writing.
  const scale = 1.25 - strength * 0.005;
  const measuredOrDefault = (key, fallback) =>
    Number.isFinite(measured?.[key]) ? Math.round(measured[key] * scale) : fallback;
  return {
    ...PALM_GUARD_DEFAULTS,
    palmContactPx: measuredOrDefault('palmContactPx', Math.round(80 - strength * 0.62)),
    penMaxPx: measuredOrDefault('penMaxPx', PALM_GUARD_DEFAULTS.penMaxPx),
    palmLatchMs: Math.round(smallContacts * 4),
    postPenGuardMs,
    penProximityMs: postPenGuardMs * 2,
    geometryUsable: measured ? measured.geometryUsable !== false : PALM_GUARD_DEFAULTS.geometryUsable,
    sizeChannel: measured?.sizeChannel ?? PALM_GUARD_DEFAULTS.sizeChannel,
    passiveStylus: profile?.passiveStylus !== false,
  };
}

export function markPenSeen(storage = globalThis.localStorage) {
  const profile = loadPalmProfile(storage);
  if (profile.sawPenPointer) return profile;
  const next = { ...profile, sawPenPointer: true };
  savePalmProfile(next, storage);
  return next;
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
