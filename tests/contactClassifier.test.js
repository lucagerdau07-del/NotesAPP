import { describe, expect, it } from 'vitest';
import {
  CONTACT_DEFAULTS,
  classifyContacts,
  contactSize,
  isPinchPair,
  updateContacts,
} from '../src/ink/contactClassifier.js';

const touch = (phase, pointerId, { size = 0, x = 0, y = 0, timeStamp = 1_000 } = {}) => ({
  phase, pointerId, pointerType: 'touch', timeStamp,
  width: size, height: size, clientX: x, clientY: y,
});

const track = (events, tuning = CONTACT_DEFAULTS) =>
  events.reduce((contacts, event) => updateContacts(contacts, event, tuning), {});

describe('contact classifier', () => {
  it('reads a 1x1 report as unknown rather than tiny', () => {
    expect(contactSize({ width: 1, height: 1 }, CONTACT_DEFAULTS)).toBe(0);
    expect(contactSize({ width: 18, height: 12 }, CONTACT_DEFAULTS)).toBe(18);
  });

  it('reads pressure as the size proxy when the profile says so', () => {
    const tuning = { ...CONTACT_DEFAULTS, sizeChannel: 'pressure' };
    expect(contactSize({ width: 33, height: 33, pressure: 0.5 }, tuning)).toBe(30);
  });

  it('remembers the largest patch a contact ever reported', () => {
    const contacts = track([
      touch('down', 1, { size: 10 }),
      touch('move', 1, { size: 60 }),
      touch('move', 1, { size: 12 }),
    ]);
    expect(contacts[1].maxSize).toBe(60);
  });

  it('accumulates the path a contact has travelled and forgets it on release', () => {
    const moved = track([
      touch('down', 1, { x: 0, y: 0 }),
      touch('move', 1, { x: 3, y: 4 }),
      touch('move', 1, { x: 3, y: 14 }),
    ]);
    expect(moved[1].pathPx).toBe(15);
    expect(updateContacts(moved, touch('up', 1), CONTACT_DEFAULTS)).toEqual({});
  });

  it('elects the smallest contact and condemns every other one', () => {
    const contacts = track([
      touch('down', 1, { size: 60, x: 10, y: 10 }),
      touch('down', 2, { size: 9, x: 200, y: 200 }),
    ]);
    const verdict = classifyContacts(contacts, CONTACT_DEFAULTS, 1_000);
    expect(verdict.electedId).toBe(2);
    expect(verdict.palmIds).toEqual([1]);
  });

  it('re-elects when a smaller contact lands later, condemning the earlier one', () => {
    let contacts = track([touch('down', 1, { size: 30, x: 10, y: 10 })]);
    expect(classifyContacts(contacts, CONTACT_DEFAULTS, 1_000).palmIds).toEqual([]);
    contacts = updateContacts(contacts, touch('down', 2, { size: 8, x: 40, y: 40 }), CONTACT_DEFAULTS);
    const verdict = classifyContacts(contacts, CONTACT_DEFAULTS, 1_010);
    expect(verdict.electedId).toBe(2);
    expect(verdict.palmIds).toEqual([1]);
  });

  it('condemns a contact that rests without travelling', () => {
    const contacts = track([
      touch('down', 1, { size: 20, x: 5, y: 5, timeStamp: 1_000 }),
      touch('move', 1, { size: 20, x: 6, y: 5, timeStamp: 1_400 }),
    ]);
    const verdict = classifyContacts(contacts, CONTACT_DEFAULTS, 1_400);
    expect(verdict.palmIds).toEqual([1]);
    expect(verdict.electedId).toBe(null);
  });

  it('elects the contact that travelled when the panel reports no geometry', () => {
    const tuning = { ...CONTACT_DEFAULTS, sizeChannel: 'none', geometryUsable: false };
    const contacts = track([
      touch('down', 1, { x: 10, y: 10, timeStamp: 1_000 }),
      touch('down', 2, { x: 60, y: 10, timeStamp: 1_000 }),
      touch('move', 2, { x: 160, y: 10, timeStamp: 1_050 }),
    ], tuning);
    const verdict = classifyContacts(contacts, tuning, 1_050);
    expect(verdict.electedId).toBe(2);
    expect(verdict.palmIds).toEqual([1]);
  });

  it('leaves a deliberate two-finger pinch alone once both fingers are moving', () => {
    // A pinch is two contacts travelling. Size cannot carry this test: the
    // panel this was tuned against reports a hand and a tip alike, so a pair
    // that has merely landed far apart is just as likely to be the hand and the
    // pen, and calling that a pinch freezes writing while a palm is down.
    const contacts = track([
      touch('down', 1, { size: 20, x: 100, y: 100, timeStamp: 1_000 }),
      touch('down', 2, { size: 22, x: 400, y: 300, timeStamp: 1_000 }),
      touch('move', 1, { size: 20, x: 80, y: 90, timeStamp: 1_016 }),
      touch('move', 2, { size: 22, x: 420, y: 310, timeStamp: 1_016 }),
    ]);
    expect(isPinchPair(contacts, CONTACT_DEFAULTS)).toBe(true);
    const verdict = classifyContacts(contacts, CONTACT_DEFAULTS, 1_016);
    expect(verdict.electedId).toBe(null);
    expect(verdict.palmIds).toEqual([]);
  });

  it('does not call a pair that has merely landed far apart a pinch', () => {
    // The hand and the tip touch down together too, so nothing may be decided
    // before either has moved. Nobody is condemned meanwhile.
    const contacts = track([
      touch('down', 1, { size: 20, x: 100, y: 100 }),
      touch('down', 2, { size: 22, x: 400, y: 300 }),
    ]);
    expect(isPinchPair(contacts, CONTACT_DEFAULTS)).toBe(false);
    expect(classifyContacts(contacts, CONTACT_DEFAULTS, 1_000).palmIds).toEqual([]);
  });

  it('does not mistake two clustered palm blobs for a pinch', () => {
    const contacts = track([
      touch('down', 1, { size: 50, x: 100, y: 100 }),
      touch('down', 2, { size: 48, x: 140, y: 120 }),
    ]);
    expect(isPinchPair(contacts, CONTACT_DEFAULTS)).toBe(false);
    expect(classifyContacts(contacts, CONTACT_DEFAULTS, 1_000).palmIds).toEqual([1, 2]);
  });

  it('lets a lone unclassified contact draw instead of stalling on it', () => {
    const contacts = track([touch('down', 1, { size: 0, x: 10, y: 10 })]);
    const verdict = classifyContacts(contacts, CONTACT_DEFAULTS, 1_000);
    expect(verdict.electedId).toBe(null);
    expect(verdict.palmIds).toEqual([]);
  });
});
