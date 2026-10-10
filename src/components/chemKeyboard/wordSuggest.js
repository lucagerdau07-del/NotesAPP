import { WORD_LIST } from "./wordList.js";

// Word suggestions for the keyboard strip. predict() always returns exactly
// `limit` words: completions of what is being typed, then close spellings
// (typos), then the word as typed, then common words as filler.

const TOKEN = /\p{L}{2,}/gu;
const base = [...new Set(WORD_LIST.split(" "))];
const FALLBACK = base.slice(0, 12);

const personal = new Map(); // lowercase -> { surfaces: Map(surface -> n), n }
const follows = new Map(); // lowercase -> Map(next lowercase -> n)
const glossary = new Set();
const seenTexts = new Set();
let index = null; // [{ word, lower, score }] best first
let byLower = new Map();

// Formulas like NaCl are not vocabulary.
const isWordLike = (word) => !/\p{Ll}\p{Lu}/u.test(word);

export function learn(text) {
  if (!text || seenTexts.has(text)) return;
  seenTexts.add(text);
  for (const segment of text.split(/[.!?;:\n]+/)) {
    let previous = "";
    for (const [word] of segment.matchAll(TOKEN)) {
      if (!isWordLike(word)) {
        previous = "";
        continue;
      }
      const lower = word.toLowerCase();
      const entry = personal.get(lower) ?? { surfaces: new Map(), n: 0 };
      entry.n += 1;
      entry.surfaces.set(word, (entry.surfaces.get(word) ?? 0) + 1);
      personal.set(lower, entry);
      if (previous) {
        const next = follows.get(previous) ?? new Map();
        next.set(lower, (next.get(lower) ?? 0) + 1);
        follows.set(previous, next);
      }
      previous = lower;
    }
  }
  index = null;
}

export function setGlossary(terms) {
  glossary.clear();
  for (const term of terms) for (const [word] of String(term).matchAll(/\p{L}{3,}/gu)) glossary.add(word);
  index = null;
}

// Reads the words out of every stored note once per session. Regex over the raw
// JSON (text objects are {"text":"..."}) instead of parsing megabytes of strokes.
let scanned = null;
export function learnFromStorage(storage = globalThis.localStorage) {
  scanned ??= (async () => {
    const keys = [];
    for (let i = 0; i < (storage?.length ?? 0); i++) {
      const key = storage.key(i);
      if (key?.startsWith("notes-app:ink:")) keys.push(key);
    }
    for (const key of keys) {
      for (const [, literal] of (storage.getItem(key) ?? "").matchAll(/"text":"((?:[^"\\]|\\.)*)"/g)) {
        try {
          learn(JSON.parse(`"${literal}"`));
        } catch {
          // a literal we cannot decode is simply not vocabulary
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  })();
  return scanned;
}

function buildIndex() {
  const map = new Map();
  base.forEach((word, i) => {
    const lower = word.toLowerCase();
    if (!map.has(lower)) map.set(lower, { word, lower, score: base.length - i });
  });
  for (const [lower, { surfaces, n }] of personal) {
    const bonus = 150 * Math.min(n, 12);
    const known = map.get(lower);
    if (known) known.score += bonus;
    else {
      const [word] = [...surfaces].sort((a, b) => b[1] - a[1])[0];
      map.set(lower, { word, lower, score: 1000 + bonus });
    }
  }
  for (const word of glossary) {
    const lower = word.toLowerCase();
    const known = map.get(lower);
    if (known) known.score += 1500;
    else map.set(lower, { word, lower, score: 2500 });
  }
  byLower = map;
  index = [...map.values()].sort((a, b) => b.score - a.score);
}

// Optimal-string-alignment distance: insert, delete, substitute, swap.
function distance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  }
  return rows[a.length][b.length];
}

export function predict({ prefix = "", previous = "", sentenceStart = false, extraWords = [] } = {}, limit = 3) {
  if (!index) buildIndex();
  const needle = prefix.toLowerCase();
  const capital = /^\p{Lu}/u.test(prefix) || (!needle && sentenceStart);
  const shape = (word) => (capital ? word[0].toLocaleUpperCase("de") + word.slice(1) : word);
  const out = [];
  const seen = new Set([needle, previous]);
  const add = (word) => {
    const key = word.toLowerCase();
    if (out.length >= limit || seen.has(key)) return;
    seen.add(key);
    out.push(shape(byLower.get(key)?.word ?? word));
  };

  if (needle) {
    const longer = (lower) => lower.length > needle.length && lower.startsWith(needle);
    // A known word typed in full stays first, in its right case (atom -> Atom).
    const exact = byLower.get(needle);
    if (exact && needle.length >= 2) out.push(shape(exact.word));
    // Words already typed in this field first, then the ranked vocabulary; a
    // shorter completion beats a long compound of similar rank (Wasser vs
    // Wasserstoffbrückenbindung).
    for (const word of extraWords) if (longer(word.toLowerCase())) add(word);
    const matches = index
      .filter((entry) => longer(entry.lower))
      .sort((a, b) => b.score - 40 * b.lower.length - (a.score - 40 * a.lower.length));
    for (const entry of matches) add(entry.word);
    // Short prefixes are too vague to call a typo unless nothing else matched.
    if (needle.length >= 3 && (needle.length >= 4 || out.length === 0) && out.length < limit) {
      const tolerance = needle.length <= 5 ? 1 : 2;
      const close = [];
      for (const entry of index) {
        if (entry.lower[0] !== needle[0] || entry.lower.startsWith(needle)) continue;
        const d = Math.min(
          distance(needle, entry.lower.slice(0, needle.length - 1)),
          distance(needle, entry.lower.slice(0, needle.length)),
          distance(needle, entry.lower.slice(0, needle.length + 1)),
        );
        if (d <= tolerance) close.push([d, entry]);
      }
      close.sort((a, b) => a[0] - b[0] || b[1].score - a[1].score);
      for (const [, entry] of close) add(entry.word);
    }
    if (out.length < limit && !out.includes(prefix)) out.push(prefix);
  } else {
    const next = follows.get(previous);
    if (next) for (const [lower] of [...next].sort((a, b) => b[1] - a[1])) add(lower);
  }

  for (const word of FALLBACK) add(word);
  return out;
}
