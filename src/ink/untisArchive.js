import { UNTIS_API_URL } from "./untisSettings.js";

// WebUntis only serves roughly last week to two weeks ahead. Every week we do
// fetch is kept here so older weeks stay swipeable afterwards.
const STORAGE_KEY = "notes.untisArchive";
const UPDATED_KEY = "notes.untisUpdatedAt"; // { weekMonday: ms of last successful fetch }
export const UNTIS_MAX_WEEKS_BACK = 26;

const pad = (n) => String(n).padStart(2, "0");
export const untisDateNumber = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

export function untisMonday(offsetWeeks = 0) {
  const d = new Date();
  d.setDate(d.getDate() + (d.getDay() === 0 ? -6 : 1 - d.getDay()) + offsetWeeks * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Raw lessons carry the whole class list (~1.5 KB each); the grid needs a sliver.
function slim(l) {
  const pick = (list, keys) => (list || []).map((x) => Object.fromEntries(keys.map((k) => [k, x[k]])));
  return {
    id: l.id,
    date: l.date,
    startTime: l.startTime,
    endTime: l.endTime,
    su: pick(l.su, ["name", "longname"]),
    ro: pick(l.ro, ["id", "name", "orgname"]),
    te: pick(l.te, ["id", "name", "orgname"]),
    code: l.code,
    substText: l.substText,
    lstext: l.lstext,
  };
}

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function loadArchivedWeek(monday) {
  return readAll()[untisDateNumber(monday)] || null;
}

export function loadUpdatedAt(monday) {
  try {
    return JSON.parse(localStorage.getItem(UPDATED_KEY))?.[untisDateNumber(monday)] || null;
  } catch {
    return null;
  }
}

function saveWeek(monday, lessons) {
  const all = readAll();
  all[untisDateNumber(monday)] = lessons;
  let updated = {};
  try {
    updated = JSON.parse(localStorage.getItem(UPDATED_KEY)) || {};
  } catch {}
  updated[untisDateNumber(monday)] = Date.now();
  const oldest = untisDateNumber(untisMonday(-UNTIS_MAX_WEEKS_BACK));
  for (const key of Object.keys(all)) if (Number(key) < oldest) delete all[key];
  for (const key of Object.keys(updated)) if (Number(key) < oldest) delete updated[key];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    localStorage.setItem(UPDATED_KEY, JSON.stringify(updated));
  } catch {
    // Storage full/blocked: the week just isn't archived.
  }
}

// Fetches one week from Untis and archives it. Throws Untis' own message when
// it refuses (past or too-far-future weeks).
export async function fetchUntisWeek(creds, monday) {
  const mid = new Date(monday);
  mid.setDate(mid.getDate() + 2); // midweek: safe against any timezone shift on the server
  const res = await fetch(UNTIS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...creds,
      date: `${mid.getFullYear()}-${pad(mid.getMonth() + 1)}-${pad(mid.getDate())}`,
    }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Stundenplan konnte nicht geladen werden.");
  const lessons = (data.timetable || []).map(slim).sort((a, b) => a.startTime - b.startTime);
  saveWeek(monday, lessons);
  return lessons;
}
