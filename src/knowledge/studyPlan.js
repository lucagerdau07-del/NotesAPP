// The school-day baseline provides review time even when no task is due.
export const BASE_MINUTES = 70;
export const MAX_MINUTES = 120;

export const HOMEWORK_MINUTES = 30;
export const EXAM_MINUTES = 180;
export const EXAM_LEAD_DAYS = 10;

export const PLAN_DAYS = 7;
// Learning time happens at school on Wednesdays, so no app time is planned.
export const WEDNESDAY = 3;

export function isoDate(value) {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const dateOf = (iso) => new Date(`${iso}T00:00:00`);

function weekdayOf(iso) {
  return dateOf(iso).getDay();
}

function baseMinutes(iso) {
  const weekday = weekdayOf(iso);
  if (weekday === WEDNESDAY) return 0;
  return weekday >= 1 && weekday <= 5 ? BASE_MINUTES : 0;
}

// setDate preserves the local calendar date across daylight-saving changes.
function daysFrom(startIso, count) {
  const days = [];
  const cursor = dateOf(startIso);
  for (let index = 0; index < count; index += 1) {
    days.push(isoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function learningDays(startIso, endIso) {
  const days = [];
  const cursor = dateOf(startIso);
  const end = dateOf(endIso);
  while (cursor <= end) {
    const iso = isoDate(cursor);
    if (cursor.getDay() !== WEDNESDAY) days.push(iso);
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function dailyBudgets(events, { today, days = PLAN_DAYS } = {}) {
  const window = daysFrom(today, days);
  const demand = new Map(window.map((iso) => [iso, 0]));

  for (const event of Array.isArray(events) ? events : []) {
    if (!event || event.done) continue;

    const due = event.due < today ? today : event.due;
    let spread = learningDays(today, due);
    if (event.kind === "exam") {
      spread = spread.filter((iso) => iso < due).slice(-EXAM_LEAD_DAYS);
    }
    if (spread.length === 0) spread = [today];

    const minutes = event.kind === "exam" ? EXAM_MINUTES : HOMEWORK_MINUTES;
    const share = minutes / spread.length;
    for (const iso of spread) {
      if (demand.has(iso)) demand.set(iso, demand.get(iso) + share);
    }
  }

  return window.map((iso) => {
    if (weekdayOf(iso) === WEDNESDAY) return { date: iso, budgetMinutes: 0 };
    const total = baseMinutes(iso) + demand.get(iso);
    return { date: iso, budgetMinutes: Math.min(MAX_MINUTES, Math.round(total)) };
  });
}
