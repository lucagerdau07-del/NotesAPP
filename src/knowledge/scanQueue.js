// Eine Notiz gilt als "fertiggestellt", wenn sie zwei Stunden lang nicht mehr
// angefasst wurde. Das ersetzt einen "Fertig"-Knopf: der Benutzer muss nichts
// markieren, und ein Scan fällt nie mitten ins Schreiben.
export const QUIET_PERIOD_MS = 2 * 60 * 60 * 1000;

// Zwei feste Tageszeiten statt eines 12-Stunden-Abstands: der Abstand würde
// mit jedem Lauf verrutschen, die festen Slots liegen verlässlich nach der
// Schule und am Abend.
export const SCAN_SLOT_HOURS = [15, 21];

export const MAX_NOTES_PER_RUN = 10;

// Die jüngste Slotgrenze, die zum Zeitpunkt `timestamp` schon vorbei ist.
// Vor dem ersten Slot des Tages ist das der letzte Slot des Vortags.
function lastSlotBefore(timestamp) {
  const date = new Date(timestamp);
  const descending = [...SCAN_SLOT_HOURS].sort((a, b) => b - a);
  for (const hour of descending) {
    if (date.getHours() >= hour) {
      const slot = new Date(date);
      slot.setHours(hour, 0, 0, 0);
      return slot.getTime();
    }
  }
  const slot = new Date(date);
  slot.setDate(slot.getDate() - 1);
  slot.setHours(descending[0], 0, 0, 0);
  return slot.getTime();
}

export function isRunDue({ now, scanState }) {
  const lastRunAt = Number(scanState?.lastRunAt);
  if (!Number.isFinite(lastRunAt)) return true;
  return lastRunAt < lastSlotBefore(now);
}

export function dueNotes({ now, notes, scanState, quietPeriodMs = QUIET_PERIOD_MS }) {
  const scanned = scanState?.notes || {};
  return (Array.isArray(notes) ? notes : [])
    .filter((note) => {
      const updatedAt = Number(note?.updatedAt);
      if (!Number.isFinite(updatedAt)) return false;
      if (now - updatedAt < quietPeriodMs) return false;
      const lastScannedAt = Number(scanned[note.id]);
      return !Number.isFinite(lastScannedAt) || updatedAt > lastScannedAt;
    })
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, MAX_NOTES_PER_RUN);
}
