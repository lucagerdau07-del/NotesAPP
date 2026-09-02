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
      // How fast this contact is moving right now, smoothed so one coalesced or
      // dropped frame does not read as a stop. Travel since touchdown only ever
      // grows, so it cannot tell a hand that has been parked for a second from
      // a tip that is writing; current pace can.
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
  // needs a panel that reports a palm as palm-sized. Measured on the device this
  // was reported from: hand and tip both read around 5px, and a single contact
  // swings between 1px and 34px over its own lifetime. Nothing there is ever
  // oversized, so separation was the only surviving test — and a hand resting
  // beside a tip writing across the page clears any separation threshold. So
  // require both contacts to be moving: pinching is two fingers travelling, and
  // a hand never travels like the tip writing next to it. A pair that has only
  // just landed is not a pinch yet either — hand and tip touch down together
  // too — and nothing is condemned while the verdict is still open, so waiting
  // for real movement costs nothing.
  const pinchSpeed = tuning.restingPx / tuning.restingMs;
  if (first.speed < pinchSpeed || second.speed < pinchSpeed) return false;
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
  const elected = sized.length > 0
    ? sized.reduce((best, contact) => (contact.maxSize < best.maxSize ? contact : best))
    // No usable geometry: the hand rests and the tip writes, so the contact
    // that has actually travelled is the only thing left to elect on.
    : eligible
        .filter((contact) => contact.pathPx >= tuning.restingPx)
        .reduce((best, contact) => (!best || contact.pathPx > best.pathPx ? contact : best), null);

  const electedId = elected ? elected.id : null;
  // Losing this election costs a contact its ink until it lifts, so the election
  // has to have meant something. Measured on the device this was reported from,
  // the hand and the tip both read about 5px: sizing them against each other is
  // a coin flip, the hand wins it by landing first, and the tip is marked palm
  // and blocked — the pen going dead beside a resting hand. Unless the winner
  // earned it by moving, or was the only candidate there was, nobody is
  // condemned and the next frame decides.
  // A rival that has not reported a move yet has had no chance to show what it
  // is, and the two fingers of a real pinch land one frame apart.
  const undecided = sized.some((contact) => contact.lastAt === contact.downAt);
  const decisive = sized.length <= 1
    || (!undecided && elected !== null
      && elected.speed >= tuning.restingPx / tuning.restingMs);
  const sizedIds = sized.map((contact) => contact.id);
  const losers = elected === null
    ? []
    : list.filter((contact) => contact.id !== electedId);
  const palmIds = [...new Set([
    ...oversized,
    ...resting,
    // A single unclassified contact is left alone on purpose: stalling it until
    // it proves itself would put a visible lag on every ordinary stroke.
    // A contact too large to be a tip is condemned as soon as a tip is elected:
    // that verdict rests on its size, not on the election. Contacts that are
    // still plausible tips wait for the election to actually mean something.
    ...(decisive ? losers : losers.filter((contact) => !sizedIds.includes(contact.id)))
      .map((contact) => contact.id),
  ])];
  return { electedId, palmIds };
}
