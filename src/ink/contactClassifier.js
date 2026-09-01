import { PRESSURE_SCALE_PX } from './pointerProbe.js';

// Without a digitizer there is no pointerType to trust, so the question shifts
// from "is this a pen?" to "which of the contacts currently on the glass is the
// pen?". Exactly one wins; the rest of the hand loses by construction.
export const CONTACT_DEFAULTS = {
  // Hard gate: nothing this large is ever a writing tip.
  palmContactPx: 45,
  // A contact above this may still be a fingertip, but never the elected tip.
  penMaxPx: 26,
  // A hand that lands and stays is resting, not writing.
  restingPx: 8,
  restingMs: 220,
  // Palm blobs cluster; two fingers deliberately spread to pinch do not.
  pinchMinSeparationPx: 180,
  sizeChannel: 'geometry',
  geometryUsable: true,
  pressureScalePx: PRESSURE_SCALE_PX,
};

export function contactSize(event, tuning = CONTACT_DEFAULTS) {
  if (!tuning.geometryUsable || tuning.sizeChannel === 'none') return 0;
  if (tuning.sizeChannel === 'pressure') {
    const pressure = Number.isFinite(event.pressure) ? event.pressure : 0;
    return pressure > 0 ? pressure * (tuning.pressureScalePx ?? PRESSURE_SCALE_PX) : 0;
  }
  const size = Math.max(
    Number.isFinite(event.width) ? event.width : 0,
    Number.isFinite(event.height) ? event.height : 0,
  );
  // 1x1 is the placeholder a device with no contact geometry reports. Reading
  // it as "smallest contact on the glass" would elect a palm as the pen.
  return size > 1 ? size : 0;
}

const number = (value) => (Number.isFinite(value) ? value : 0);

export function updateContacts(contacts, event, tuning = CONTACT_DEFAULTS) {
  if (event.pointerType !== 'touch') return contacts;
  const id = event.pointerId;
  if (event.phase === 'up' || event.phase === 'cancel' || event.phase === 'abort') {
    if (!(id in contacts)) return contacts;
    const next = { ...contacts };
    delete next[id];
    return next;
  }
  const size = contactSize(event, tuning);
  const x = number(event.clientX);
  const y = number(event.clientY);
  const time = number(event.timeStamp);
  const previous = contacts[id];
  if (!previous || event.phase === 'down') {
    return {
      ...contacts,
      [id]: { id, maxSize: size, x, y, downAt: time, lastAt: time, pathPx: 0, speed: 0 },
    };
  }
  const step = Math.hypot(x - previous.x, y - previous.y);
  return {
    ...contacts,
    [id]: {
      ...previous,
      maxSize: Math.max(previous.maxSize, size),
      x,
      y,
      lastAt: time,
      pathPx: previous.pathPx + step,
      // Travel since touchdown only ever grows, so it ranks contacts by age
      // rather than by what they are doing now. Current speed is what separates
      // a hand parked on the glass from a tip writing beside it, whatever
      // either of them did a second ago. Smoothed, so one coalesced or dropped
      // frame does not read as a stop.
      speed: previous.speed * 0.5 + (step / Math.max(1, time - previous.lastAt)) * 0.5,
    },
  };
}

export function isPinchPair(contacts, tuning = CONTACT_DEFAULTS) {
  const list = Object.values(contacts);
  if (list.length !== 2) return false;
  const [first, second] = list;
  if (first.maxSize >= tuning.palmContactPx || second.maxSize >= tuning.palmContactPx) return false;
  // That size guard is the only thing keeping a hand out of this test, and it
  // only fires on a panel that reports a palm as palm-sized. Plenty do not —
  // the device this was reported on tops out around 17px for hand and tip
  // alike — leaving separation as the sole test, which a hand parked at the
  // edge of the screen clears against any tip writing across the page. So
  // require the pair to be doing the same thing: both travelling, or both
  // still new to the glass and not yet committed to anything. One parked while
  // the other writes is a hand and a tip, on every panel, calibrated or not.
  const pinchSpeed = tuning.restingPx / tuning.restingMs;
  const travelling = first.speed >= pinchSpeed && second.speed >= pinchSpeed;
  const bothNew = first.lastAt - first.downAt < tuning.restingMs
    && second.lastAt - second.downAt < tuning.restingMs;
  if (!travelling && !bothNew) return false;
  return Math.hypot(first.x - second.x, first.y - second.y) >= tuning.pinchMinSeparationPx;
}

export function classifyContacts(contacts, tuning = CONTACT_DEFAULTS, now = 0) {
  const list = Object.values(contacts);
  const oversized = list
    .filter((contact) => contact.maxSize >= tuning.palmContactPx)
    .map((contact) => contact.id);
  // Two well-separated normal contacts are a gesture the user meant. Electing a
  // pen out of them would break zoom for the sake of a palm that is not there.
  if (isPinchPair(contacts, tuning)) return { electedId: null, palmIds: oversized };

  const resting = list
    .filter((contact) => now - contact.downAt >= tuning.restingMs && contact.pathPx < tuning.restingPx)
    .map((contact) => contact.id);
  const eligible = list.filter(
    (contact) => contact.maxSize < tuning.palmContactPx && !resting.includes(contact.id),
  );
  const sized = eligible.filter(
    (contact) => contact.maxSize > 0 && contact.maxSize <= tuning.penMaxPx,
  );
  // The pace that separates a settling hand from a writing tip, taken from the
  // resting rule rather than added as a second knob to keep in sync with it.
  const writingSpeed = tuning.restingPx / tuning.restingMs;
  // A hand parked on the glass is never the tip that is writing, whatever size
  // it reports, so a contact that is moving outranks one that is not. Sizes
  // only break the tie among those still in the running.
  const moving = sized.filter((contact) => contact.speed >= writingSpeed);
  const candidates = moving.length > 0 ? moving : sized;
  const elected = candidates.length > 0
    ? candidates.reduce((best, contact) => (contact.maxSize < best.maxSize ? contact : best))
    // No usable geometry: the hand parks and the tip writes, so the contact
    // that is moving fastest right now is the only thing left to elect on.
    // Ranking by distance travelled instead would hand the slot to whichever
    // contact has been down longest — always the hand, which lands first and
    // then wanders a couple of px per frame for as long as it is resting.
    : eligible
        .filter((contact) => contact.speed >= writingSpeed)
        .reduce((best, contact) => (!best || contact.speed > best.speed ? contact : best), null);

  const electedId = elected ? elected.id : null;
  // Losing the election costs a contact its ink until it lifts, so the election
  // has to have meant something. On a panel that reads a hand and a tip alike —
  // the one this was reported on puts both around 5px — two same-sized contacts
  // are a coin flip, and calling the loser a palm is how the pen goes dead
  // beside a resting hand. Unless the winner earned it by moving, or was the
  // only candidate there was, nobody is condemned and the next frame decides.
  const decisive = elected !== null
    && (elected.speed >= writingSpeed || sized.length <= 1);
  const palmIds = [...new Set([
    ...oversized,
    ...resting,
    // A single unclassified contact is left alone on purpose: stalling it until
    // it proves itself would put a visible lag on every ordinary stroke.
    ...(decisive
      ? list.filter((contact) => contact.id !== electedId).map((contact) => contact.id)
      : []),
  ])];
  return { electedId, palmIds };
}
