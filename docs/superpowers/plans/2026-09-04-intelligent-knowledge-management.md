# Intelligente KI-Datenverwaltung — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fertiggestellte Notizen werden zweimal täglich von einem Vision-Modell gelesen; gefundene Hausaufgaben und Klausurtermine landen in einem Kalender, Fachbegriffe in einem Glossar, und daraus entsteht ein Lernplan mit festen Zeitregeln.

**Architecture:** Der Scan läuft im Client, weil die Notizen nur dort liegen. Vier Module ohne React und ohne Netzwerkabhängigkeit tragen die Logik: `scanQueue` entscheidet was wann fällig ist, `documentScan` macht aus einer Notiz geprüfte Funde, `knowledgeRepository` speichert sie in `localStorage`, `studyPlan` rechnet Minutenbudgets. Der bestehende Proxy auf dem Hugging-Face-Space wird nicht angefasst: er erkennt `image_url`-Teile selbst und routet dann auf das Vision-Modell. Zeitregeln sind Code, Inhalte kommen vom Modell.

**Tech Stack:** React 19, Vite 8, Vitest 4 + Testing Library, `localStorage` für Persistenz, OpenRouter über den bestehenden Space-Proxy (`deepseek/deepseek-v4-flash-vision-exp` für Bilder, `deepseek/deepseek-v4-flash` für Text).

**Spec:** `docs/superpowers/specs/2026-09-04-intelligent-knowledge-management-design.md`

## Global Constraints

* **Keine neuen npm-Abhängigkeiten.**
* **Keine Änderung am Hugging-Face-Space.** Der Proxy kann bereits alles Nötige.
* **Alle sichtbaren Texte auf Deutsch.** Knopfbeschriftungen, Fehlermeldungen, Panel-Überschriften.
* **Keine echte Netzwerkanfrage in Tests.** `complete` und `renderPages` werden überall injiziert.
* **Persistenzfehler sind still.** Ein fehlgeschlagener `localStorage`-Schreibvorgang darf nie eine Ausnahme nach außen werfen (bestehendes Verhalten in `noteRepository.js`).
* **Zeitkonstanten** (Spec 6.1): `BASE_MINUTES = 70`, `MAX_MINUTES = 120`, `HOMEWORK_MINUTES = 30`, `EXAM_MINUTES = 180`, `EXAM_LEAD_DAYS = 10`, `PLAN_DAYS = 7`, Mittwoch = Wochentag `3` und immer `0` Minuten.
* **Scan-Konstanten** (Spec 2.1, 3.3, 4.4, 5.1): `QUIET_PERIOD_MS = 2 h`, `SCAN_SLOT_HOURS = [15, 21]`, `MAX_NOTES_PER_RUN = 10`, `MAX_SCAN_PAGES = 8`, `MAX_EVENTS_PER_NOTE = 20`, `MAX_TERMS_PER_NOTE = 40`.
* **Datumsformat überall:** `"YYYY-MM-DD"` als Zeichenkette, geprüft mit `/^\d{4}-\d{2}-\d{2}$/`. Tagesschritte immer über `date.setDate(date.getDate() + 1)`, nie über Addition von 86 400 000 ms — sonst verschiebt die Sommerzeitumstellung das Datum.
* **Nach jeder Aufgabe committen.** `.agents/AGENTS.md` verlangt einen Speicherpunkt nach jeder Änderung.
* **Testlauf:** `npm test` für alles, `npx vitest run <datei>` für eine einzelne Datei.

---

## Dateiübersicht

| Datei | Verantwortung | Aufgabe |
| --- | --- | --- |
| `src/knowledge/scanQueue.js` *(neu)* | Ist ein Lauf fällig, welche Notizen kommen dran | 1 |
| `src/knowledge/knowledgeRepository.js` *(neu)* | Termine, Begriffe, Scanzustand, Plan, Einstellung — Persistenz und Deduplizierung | 2 |
| `src/documents/notePreview.js` | `renderNotePagesOf` bekommt Optionen für Größe und Format | 3 |
| `src/knowledge/documentScan.js` *(neu)* | Antwort parsen und prüfen; eine Notiz scannen; Lauf orchestrieren | 4, 5, 6 |
| `src/knowledge/studyPlan.js` *(neu)* | Minutenbudget je Tag; Plan mit Modellinhalten füllen | 7, 8 |
| `src/hooks/useKnowledge.js` *(neu)* | React-Anbindung: Lauf anstoßen, Daten liefern, Plan erneuern | 9 |
| `src/components/UpcomingCard.jsx` *(neu)* | „Anstehend"-Karte in der Bibliothek | 10 |
| `src/components/Library.jsx` | Karte einhängen, Knopf zum Plan-Bildschirm | 10, 11 |
| `src/components/PlanScreen.jsx` *(neu)* | Lernplan und Glossar | 11 |
| `src/App.jsx` | Bildschirm `plan` in die Umschaltung | 11 |
| `src/components/Settings.jsx` | Schalter, Knopf und Statuszeile unter `KI & Netzwerk` | 12 |
| `src/styles/main.css` | Klassen für die neuen Ansichten | 10, 11 |

**Abhängigkeitsrichtung:** `documentScan` importiert aus `scanQueue` und `notePreview`. `studyPlan` importiert `extractJson` aus `documentScan` — die einzige Kante zwischen den beiden, und sie geht nur in diese Richtung; `documentScan` importiert nichts aus `studyPlan`, es gibt also keinen Zyklus. `useKnowledge` importiert aus allen vieren. Kein Modul importiert aus `useKnowledge` oder aus einer Komponente.

---

# Phase A — Datenschicht

## Task 1: Scan-Warteschlange

Reine Logik, kein Netzwerk, kein React. Beantwortet zwei Fragen: läuft der Scan heute überhaupt noch mal, und welche Notizen sind dran.

**Files:**
- Create: `src/knowledge/scanQueue.js`
- Test: `tests/scanQueue.test.js`

**Interfaces:**
- Consumes: nichts.
- Produces:
  - `QUIET_PERIOD_MS = 7200000`
  - `SCAN_SLOT_HOURS = [15, 21]`
  - `MAX_NOTES_PER_RUN = 10`
  - `isRunDue({ now, scanState }) -> boolean`
  - `dueNotes({ now, notes, scanState, quietPeriodMs }) -> Array<note>`
  - `notes` ist die Liste aus `browserNoteRepository.listNotes()`: Objekte mit mindestens `{ id, updatedAt }`.
  - `scanState` ist `{ lastRunAt: number|null, notes: { [noteId]: number } }`.

- [ ] **Step 1: Write the failing test**

`tests/scanQueue.test.js`:

```js
import { describe, expect, it } from "vitest";
import { dueNotes, isRunDue, MAX_NOTES_PER_RUN } from "../src/knowledge/scanQueue.js";

// Lokale Zeit, damit die Slotgrenzen (15:00/21:00 Ortszeit) getroffen werden.
const at = (day, hour, minute = 0) =>
  new Date(2026, 8, day, hour, minute, 0, 0).getTime();

const HOUR = 60 * 60 * 1000;

describe("isRunDue", () => {
  it("läuft, wenn noch nie gelaufen", () => {
    expect(isRunDue({ now: at(7, 16), scanState: { lastRunAt: null, notes: {} } })).toBe(true);
  });

  it("läuft nach 15:00, wenn der letzte Lauf davor war", () => {
    expect(isRunDue({ now: at(7, 16), scanState: { lastRunAt: at(7, 14), notes: {} } })).toBe(true);
  });

  it("läuft nicht ein zweites Mal am selben Nachmittag", () => {
    expect(isRunDue({ now: at(7, 18), scanState: { lastRunAt: at(7, 15, 30), notes: {} } })).toBe(false);
  });

  it("läuft abends erneut, wenn der letzte Lauf am Nachmittag war", () => {
    expect(isRunDue({ now: at(7, 21, 5), scanState: { lastRunAt: at(7, 16), notes: {} } })).toBe(true);
  });

  it("läuft morgens nicht, wenn der Abendlauf schon erledigt ist", () => {
    expect(isRunDue({ now: at(8, 7), scanState: { lastRunAt: at(7, 22), notes: {} } })).toBe(false);
  });

  it("läuft morgens, wenn der letzte Lauf vor dem gestrigen Abendslot war", () => {
    expect(isRunDue({ now: at(8, 7), scanState: { lastRunAt: at(7, 16), notes: {} } })).toBe(true);
  });
});

describe("dueNotes", () => {
  const now = at(7, 16);

  it("nimmt eine unberührte, lang genug ruhende Notiz", () => {
    const notes = [{ id: "a", updatedAt: now - 3 * HOUR }];
    expect(dueNotes({ now, notes, scanState: { notes: {} } })).toHaveLength(1);
  });

  it("überspringt eine Notiz, die vor weniger als zwei Stunden bearbeitet wurde", () => {
    const notes = [{ id: "a", updatedAt: now - HOUR }];
    expect(dueNotes({ now, notes, scanState: { notes: {} } })).toEqual([]);
  });

  it("überspringt eine seit dem letzten Scan unveränderte Notiz", () => {
    const notes = [{ id: "a", updatedAt: now - 5 * HOUR }];
    const scanState = { notes: { a: now - 4 * HOUR } };
    expect(dueNotes({ now, notes, scanState })).toEqual([]);
  });

  it("nimmt eine nach dem letzten Scan ergänzte Notiz erneut", () => {
    const notes = [{ id: "a", updatedAt: now - 3 * HOUR }];
    const scanState = { notes: { a: now - 5 * HOUR } };
    expect(dueNotes({ now, notes, scanState })).toHaveLength(1);
  });

  it("sortiert nach ältester Bearbeitung zuerst", () => {
    const notes = [
      { id: "neu", updatedAt: now - 3 * HOUR },
      { id: "alt", updatedAt: now - 9 * HOUR },
    ];
    expect(dueNotes({ now, notes, scanState: { notes: {} } }).map((n) => n.id)).toEqual(["alt", "neu"]);
  });

  it("deckelt bei zehn Notizen je Lauf", () => {
    const notes = Array.from({ length: 14 }, (_, index) => ({
      id: `n${index}`,
      updatedAt: now - (3 + index) * HOUR,
    }));
    expect(dueNotes({ now, notes, scanState: { notes: {} } })).toHaveLength(MAX_NOTES_PER_RUN);
  });

  it("ignoriert die Ruhezeit, wenn quietPeriodMs 0 ist", () => {
    const notes = [{ id: "a", updatedAt: now - 60 * 1000 }];
    expect(dueNotes({ now, notes, scanState: { notes: {} }, quietPeriodMs: 0 })).toHaveLength(1);
  });

  it("ignoriert Notizen ohne brauchbares updatedAt", () => {
    const notes = [{ id: "a" }, { id: "b", updatedAt: "gestern" }];
    expect(dueNotes({ now, notes, scanState: { notes: {} } })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scanQueue.test.js`
Expected: FAIL — `Failed to resolve import "../src/knowledge/scanQueue.js"`

- [ ] **Step 3: Write minimal implementation**

`src/knowledge/scanQueue.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scanQueue.test.js`
Expected: PASS, 15 Tests

- [ ] **Step 5: Commit**

```bash
git add src/knowledge/scanQueue.js tests/scanQueue.test.js
git commit -m "feat(knowledge): add scan queue scheduling rules"
```

---

## Task 2: Wissensspeicher

Persistenz für Termine, Begriffe, Scanzustand, Plan und die Automatik-Einstellung. Der Kern ist die Deduplizierung: ein erneuter Scan einer ergänzten Notiz liefert alte Funde noch einmal mit und darf den Kalender nicht verdoppeln.

**Files:**
- Create: `src/knowledge/knowledgeRepository.js`
- Test: `tests/knowledgeRepository.test.js`

**Interfaces:**
- Consumes: nichts.
- Produces:
  - `KNOWLEDGE_STORAGE_KEY = "notes.knowledge.v1"`
  - `createKnowledgeRepository(storage, { now }) -> repository`
  - `browserKnowledgeRepository` — an `globalThis.localStorage` gebunden
  - `repository.read() -> { version, events, terms, scanState, plan, settings }`
  - `repository.mergeFindings({ events, terms, sourceNoteId }) -> { addedEvents, addedTerms }`
  - `repository.setEventDone(id, done) -> void`
  - `repository.markNoteScanned(noteId, at) -> void`
  - `repository.finishRun({ at, error }) -> void`
  - `repository.savePlan(plan) -> void`
  - `repository.setAutoScan(enabled) -> void`
  - Termin: `{ id, kind, title, subject, due, sourceNoteId, done, createdAt, updatedAt }`
  - Begriff: `{ id, term, definition, subject, sourceNoteId, createdAt, updatedAt }`

- [ ] **Step 1: Write the failing test**

`tests/knowledgeRepository.test.js`:

```js
import { beforeEach, describe, expect, it } from "vitest";
import {
  createKnowledgeRepository,
  KNOWLEDGE_STORAGE_KEY,
} from "../src/knowledge/knowledgeRepository.js";

let values;
let storage;

beforeEach(() => {
  values = new Map();
  storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
});

const repo = (now = () => 1000) => createKnowledgeRepository(storage, { now });

const hausaufgabe = {
  kind: "homework",
  title: "Aufgabe 4a-c",
  subject: "Mathe",
  due: "2026-09-08",
};

describe("knowledge repository", () => {
  it("liefert einen leeren Zustand ohne gespeicherte Daten", () => {
    const state = repo().read();
    expect(state.events).toEqual([]);
    expect(state.terms).toEqual([]);
    expect(state.scanState).toEqual({ lastRunAt: null, lastError: null, notes: {} });
    expect(state.plan).toBeNull();
    expect(state.settings.autoScan).toBe(true);
  });

  it("erholt sich von kaputtem Speicher", () => {
    values.set(KNOWLEDGE_STORAGE_KEY, "kein-json");
    expect(repo().read().events).toEqual([]);
  });

  it("legt Termine und Begriffe an und vergibt Quelle und Zeitstempel", () => {
    const repository = repo();
    const result = repository.mergeFindings({
      events: [hausaufgabe],
      terms: [{ term: "Ableitung", definition: "Steigung", subject: "Mathe" }],
      sourceNoteId: "note-1",
    });
    expect(result).toEqual({ addedEvents: 1, addedTerms: 1 });
    const [event] = repository.read().events;
    expect(event).toMatchObject({
      kind: "homework",
      title: "Aufgabe 4a-c",
      sourceNoteId: "note-1",
      done: false,
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(event.id).toBeTruthy();
  });

  it("verdoppelt einen erneut gefundenen Termin nicht", () => {
    const repository = repo();
    repository.mergeFindings({ events: [hausaufgabe], terms: [], sourceNoteId: "note-1" });
    repository.mergeFindings({ events: [hausaufgabe], terms: [], sourceNoteId: "note-1" });
    expect(repository.read().events).toHaveLength(1);
  });

  it("erkennt denselben Termin trotz Groß-/Kleinschreibung und Satzzeichen", () => {
    const repository = repo();
    repository.mergeFindings({ events: [hausaufgabe], terms: [], sourceNoteId: "note-1" });
    repository.mergeFindings({
      events: [{ ...hausaufgabe, title: "  aufgabe 4a-c.  " }],
      terms: [],
      sourceNoteId: "note-1",
    });
    expect(repository.read().events).toHaveLength(1);
  });

  it("behält den Abhak-Zustand bei einem erneuten Scan", () => {
    let time = 1000;
    const repository = repo(() => time);
    repository.mergeFindings({ events: [hausaufgabe], terms: [], sourceNoteId: "note-1" });
    const { id, createdAt } = repository.read().events[0];
    repository.setEventDone(id, true);

    time = 5000;
    repository.mergeFindings({ events: [hausaufgabe], terms: [], sourceNoteId: "note-1" });
    const [event] = repository.read().events;
    expect(event.done).toBe(true);
    expect(event.id).toBe(id);
    expect(event.createdAt).toBe(createdAt);
    expect(event.updatedAt).toBe(5000);
  });

  it("aktualisiert die Definition eines bereits bekannten Begriffs", () => {
    const repository = repo();
    repository.mergeFindings({
      events: [],
      terms: [{ term: "Ableitung", definition: "kurz", subject: "Mathe" }],
      sourceNoteId: "note-1",
    });
    repository.mergeFindings({
      events: [],
      terms: [{ term: "Ableitung", definition: "die Steigung einer Funktion", subject: "Mathe" }],
      sourceNoteId: "note-2",
    });
    const terms = repository.read().terms;
    expect(terms).toHaveLength(1);
    expect(terms[0].definition).toBe("die Steigung einer Funktion");
  });

  it("hält gleichnamige Begriffe verschiedener Fächer auseinander", () => {
    const repository = repo();
    repository.mergeFindings({
      events: [],
      terms: [
        { term: "Wurzel", definition: "Umkehrung des Quadrats", subject: "Mathe" },
        { term: "Wurzel", definition: "Organ der Pflanze", subject: "Chemie" },
      ],
      sourceNoteId: "note-1",
    });
    expect(repository.read().terms).toHaveLength(2);
  });

  it("hält Scanzustand und Fehler fest", () => {
    const repository = repo();
    repository.markNoteScanned("note-1", 4200);
    repository.finishRun({ at: 4300, error: "Server nicht erreichbar." });
    expect(repository.read().scanState).toEqual({
      lastRunAt: 4300,
      lastError: "Server nicht erreichbar.",
      notes: { "note-1": 4200 },
    });
  });

  it("speichert Plan und Automatik-Einstellung", () => {
    const repository = repo();
    repository.savePlan({ generatedFor: "2026-09-04", days: [] });
    repository.setAutoScan(false);
    const state = repository.read();
    expect(state.plan.generatedFor).toBe("2026-09-04");
    expect(state.settings.autoScan).toBe(false);
  });

  it("wirft nicht, wenn der Speicher schreibgeschützt ist", () => {
    const blocked = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const repository = createKnowledgeRepository(blocked, { now: () => 1000 });
    expect(() =>
      repository.mergeFindings({ events: [hausaufgabe], terms: [], sourceNoteId: "note-1" }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/knowledgeRepository.test.js`
Expected: FAIL — `Failed to resolve import "../src/knowledge/knowledgeRepository.js"`

- [ ] **Step 3: Write minimal implementation**

`src/knowledge/knowledgeRepository.js`:

```js
export const KNOWLEDGE_STORAGE_KEY = "notes.knowledge.v1";

function emptyState() {
  return {
    version: 1,
    events: [],
    terms: [],
    scanState: { lastRunAt: null, lastError: null, notes: {} },
    plan: null,
    settings: { autoScan: true },
  };
}

// Ein erneuter Scan derselben Notiz liefert bekannte Funde noch einmal, in
// leicht anderer Schreibweise. Ohne diese Normalisierung wüchse der Kalender
// bei jedem Lauf.
function normalizeKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .trim();
}

const eventKey = (event) =>
  `${event.kind}|${normalizeKey(event.subject)}|${event.due}|${normalizeKey(event.title)}`;

const termKey = (term) => `${normalizeKey(term.subject)}|${normalizeKey(term.term)}`;

export function createKnowledgeRepository(storage, { now = Date.now } = {}) {
  let sequence = 0;
  const nextId = (prefix) =>
    globalThis.crypto?.randomUUID?.() || `${prefix}-${now()}-${sequence++}`;

  const read = () => {
    try {
      const parsed = JSON.parse(storage?.getItem?.(KNOWLEDGE_STORAGE_KEY) || "null");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyState();
      const empty = emptyState();
      return {
        ...empty,
        ...parsed,
        events: Array.isArray(parsed.events) ? parsed.events : [],
        terms: Array.isArray(parsed.terms) ? parsed.terms : [],
        scanState: { ...empty.scanState, ...(parsed.scanState || {}) },
        settings: { ...empty.settings, ...(parsed.settings || {}) },
      };
    } catch {
      return emptyState();
    }
  };

  const write = (state) => {
    try {
      storage?.setItem?.(KNOWLEDGE_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Speicher voll oder gesperrt: die Funde gehen verloren, die App nicht.
    }
  };

  const update = (change) => {
    const state = read();
    const next = change(state);
    write(next);
    return next;
  };

  // Bekannter Eintrag: Felder aktualisieren, aber id, createdAt und - bei
  // Terminen - done behalten. Ein abgehakter Termin darf durch einen erneuten
  // Scan nicht wieder auf offen springen.
  const mergeList = (existing, incoming, keyOf, build) => {
    const byKey = new Map(existing.map((entry) => [keyOf(entry), entry]));
    let added = 0;
    for (const raw of incoming) {
      const candidate = build(raw);
      const key = keyOf(candidate);
      const previous = byKey.get(key);
      if (previous) {
        byKey.set(key, {
          ...candidate,
          id: previous.id,
          createdAt: previous.createdAt,
          ...(previous.done !== undefined ? { done: previous.done } : {}),
        });
      } else {
        byKey.set(key, candidate);
        added += 1;
      }
    }
    return { list: [...byKey.values()], added };
  };

  return {
    read,

    mergeFindings({ events = [], terms = [], sourceNoteId = "" }) {
      const timestamp = now();
      let addedEvents = 0;
      let addedTerms = 0;
      update((state) => {
        const merged = mergeList(state.events, events, eventKey, (raw) => ({
          id: nextId("event"),
          kind: raw.kind,
          title: raw.title,
          subject: raw.subject,
          due: raw.due,
          sourceNoteId,
          done: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        }));
        const mergedTerms = mergeList(state.terms, terms, termKey, (raw) => ({
          id: nextId("term"),
          term: raw.term,
          definition: raw.definition,
          subject: raw.subject,
          sourceNoteId,
          createdAt: timestamp,
          updatedAt: timestamp,
        }));
        addedEvents = merged.added;
        addedTerms = mergedTerms.added;
        return { ...state, events: merged.list, terms: mergedTerms.list };
      });
      return { addedEvents, addedTerms };
    },

    setEventDone(id, done) {
      const timestamp = now();
      update((state) => ({
        ...state,
        events: state.events.map((event) =>
          event.id === id ? { ...event, done: Boolean(done), updatedAt: timestamp } : event,
        ),
      }));
    },

    markNoteScanned(noteId, at) {
      update((state) => ({
        ...state,
        scanState: {
          ...state.scanState,
          notes: { ...state.scanState.notes, [noteId]: at },
        },
      }));
    },

    finishRun({ at, error = null }) {
      update((state) => ({
        ...state,
        scanState: { ...state.scanState, lastRunAt: at, lastError: error },
      }));
    },

    savePlan(plan) {
      update((state) => ({ ...state, plan }));
    },

    setAutoScan(enabled) {
      update((state) => ({
        ...state,
        settings: { ...state.settings, autoScan: Boolean(enabled) },
      }));
    },
  };
}

export const browserKnowledgeRepository = createKnowledgeRepository(globalThis.localStorage);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/knowledgeRepository.test.js`
Expected: PASS, 11 Tests

- [ ] **Step 5: Commit**

```bash
git add src/knowledge/knowledgeRepository.js tests/knowledgeRepository.test.js
git commit -m "feat(knowledge): add knowledge repository with finding merge"
```

---

# Phase B — Der Scan

## Task 3: Seitenbilder in Scangröße

`renderNotePagesOf` rendert heute PNG bei bis zu 1280 px. Als Base64 sind das je Seite mehrere hundert Kilobyte; acht Seiten sprengen eine vernünftige Anfrage. Die Funktion bekommt Optionen, der bestehende Aufruf aus der Bibliothek bleibt unverändert.

**Files:**
- Modify: `src/documents/notePreview.js:355-390` (`renderFullPage` und `renderNotePagesOf`)
- Modify: `src/documents/notePreview.js:243-282` (`renderComposite` — `toDataURL`-Aufruf)
- Modify: `tests/setup.js:180-210` (`createCanvasContext` — fehlende Methoden)
- Test: `tests/notePreviewScan.test.js`

**Interfaces:**
- Consumes: nichts.
- Produces:
  - `renderNotePagesOf(documentId, options) -> Array<{ id, src, background, aspectRatio }>`
  - `options = { maxDimension = 640, mimeType = "image/png", quality = undefined }`
  - Ohne `options` verhält sich die Funktion exakt wie bisher.

- [ ] **Step 1: Fehlende Canvas-Methoden in die Test-Attrappe aufnehmen**

`renderComposite` ruft `translate` und `drawImage` auf, `drawPreviewObject` ruft `fillText` und `arc` auf. Keine dieser vier steckt heute in `createCanvasContext` in `tests/setup.js` — bislang hat kein Test `renderNotePagesOf` ausgeführt, deshalb ist es nie aufgefallen. Ohne diesen Schritt scheitert jeder Test dieser Aufgabe an `context.translate is not a function`.

In `tests/setup.js`, in `createCanvasContext`, zu den bestehenden `vi.fn()`-Einträgen ergänzen:

```js
    translate: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    arc: vi.fn(),
```

- [ ] **Step 2: Write the failing test**

`tests/notePreviewScan.test.js`:

```js
import { beforeEach, describe, expect, it } from "vitest";
import { createInkDocument, createInkHistory } from "../src/ink/inkDocument.js";
import { renderNotePagesOf } from "../src/documents/notePreview.js";

beforeEach(() => {
  const document = createInkDocument("note-1", 2);
  globalThis.localStorage.setItem(
    "notes-app:ink:note-1",
    JSON.stringify(createInkHistory(document, 2)),
  );
  HTMLCanvasElement.prototype.toDataURL.mockClear();
});

describe("renderNotePagesOf", () => {
  it("rendert standardmäßig PNG ohne Qualitätsangabe", () => {
    renderNotePagesOf("note-1");
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith("image/png", undefined);
  });

  it("rendert auf Wunsch JPEG mit Qualität", () => {
    renderNotePagesOf("note-1", { mimeType: "image/jpeg", quality: 0.72 });
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.72);
  });

  it("liefert eine Seite je Seite des Dokuments", () => {
    expect(renderNotePagesOf("note-1")).toHaveLength(2);
  });

  it("liefert eine leere Liste für ein unbekanntes Dokument", () => {
    expect(renderNotePagesOf("gibt-es-nicht")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/notePreviewScan.test.js`
Expected: FAIL — der erste Test erwartet zwei Argumente, `toDataURL` wird bisher mit `"image/png"` allein aufgerufen.

- [ ] **Step 4: Write minimal implementation**

In `src/documents/notePreview.js`, `renderComposite`: Signatur um `mimeType` und `quality` erweitern und die Rückgabe ändern.

```js
function renderComposite({ inkDoc, page, pixelWidth, pixelHeight, dpr, scale, offsetX, offsetY, view, mimeType = "image/png", quality }) {
```

Letzte Zeile der Funktion ersetzen:

```js
  return canvas.toDataURL(mimeType, quality);
```

`renderFullPage` nimmt die Optionen entgegen und gibt sie weiter:

```js
function renderFullPage(inkDoc, page, { maxDimension = FULL_PAGE_MAX_DIMENSION, mimeType, quality } = {}) {
  const { minX, minY, maxX, maxY } = fullPageBounds(inkDoc, page);
  const pageWidth = Math.max(1, maxX - minX);
  const pageHeight = Math.max(1, maxY - minY);
  const scale = maxDimension / Math.max(pageWidth, pageHeight);

  return renderComposite({
    inkDoc,
    page,
    pixelWidth: Math.round(pageWidth * scale * FULL_PAGE_DPR),
    pixelHeight: Math.round(pageHeight * scale * FULL_PAGE_DPR),
    dpr: FULL_PAGE_DPR,
    scale,
    offsetX: -minX * scale,
    offsetY: -minY * scale,
    view: { minX, minY, maxX, maxY },
    mimeType,
    quality,
  });
}
```

`renderNotePagesOf` reicht die Optionen durch:

```js
// Optionen: die Detailansicht nimmt die Vorgaben (PNG, 640 px), der
// Dokumentscan fordert JPEG bei 1000 px an - als Base64 in einer HTTP-Anfrage
// ist PNG bei voller Auflösung rund eine Größenordnung zu groß.
export function renderNotePagesOf(documentId, options = {}) {
  if (typeof document === "undefined") return [];
  const inkDoc = browserInkRepository.loadHistory(documentId)?.present;
  if (!inkDoc) return [];
  return inkDoc.pages.map((page) => {
    const { minX, minY, maxX, maxY } = fullPageBounds(inkDoc, page);
    return {
      id: page.id,
      src: renderFullPage(inkDoc, page, options),
      background: page.background || "#0e0e12",
      aspectRatio: (maxX - minX) / Math.max(1, maxY - minY),
    };
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/notePreviewScan.test.js`
Expected: PASS, 4 Tests

- [ ] **Step 6: Run the full suite to check for regressions**

Run: `npm test`
Expected: PASS — der Aufruf ohne Optionen verhält sich unverändert, also darf kein bestehender Test kippen.

- [ ] **Step 7: Commit**

```bash
git add src/documents/notePreview.js tests/setup.js tests/notePreviewScan.test.js
git commit -m "feat(preview): allow page renders at scan size and format"
```

---

## Task 4: Antwort parsen und prüfen

Zwei reine Funktionen. `extractJson` holt das JSON aus einer Modellantwort, die fast nie nur JSON ist. `validateFindings` wirft alles weg, was ein Modell sich ausgedacht haben könnte.

**Files:**
- Create: `src/knowledge/documentScan.js`
- Test: `tests/documentScan.test.js`

**Interfaces:**
- Consumes: nichts.
- Produces:
  - `MAX_SCAN_PAGES = 8`, `MAX_EVENTS_PER_NOTE = 20`, `MAX_TERMS_PER_NOTE = 40`
  - `extractJson(text) -> object|null`
  - `validateFindings(raw, { today, fallbackSubject }) -> { events, terms }`
  - Ein geprüfter Termin ist `{ kind: "homework"|"exam", title, subject, due }` — ohne `id`, `done` oder Zeitstempel; die vergibt Task 2.
  - Ein geprüfter Begriff ist `{ term, definition, subject }`.

- [ ] **Step 1: Write the failing test**

`tests/documentScan.test.js`:

```js
import { describe, expect, it } from "vitest";
import {
  extractJson,
  MAX_EVENTS_PER_NOTE,
  MAX_TERMS_PER_NOTE,
  validateFindings,
} from "../src/knowledge/documentScan.js";

const today = "2026-09-04";

describe("extractJson", () => {
  it("liest reines JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("liest JSON aus einem Codeblock", () => {
    expect(extractJson('Hier:\n```json\n{"a":1}\n```\nFertig.')).toEqual({ a: 1 });
  });

  it("liest JSON aus einem Codeblock ohne Sprachangabe", () => {
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("liest JSON mit umgebendem Fließtext", () => {
    expect(extractJson('Ich habe gefunden: {"a":1} — das war alles.')).toEqual({ a: 1 });
  });

  it("gibt null bei kaputtem JSON", () => {
    expect(extractJson("{ das ist kein json")).toBeNull();
  });

  it("gibt null bei einer Antwort ohne JSON", () => {
    expect(extractJson("Ich konnte nichts finden.")).toBeNull();
  });

  it("gibt null bei einem Array auf oberster Ebene", () => {
    expect(extractJson("[1,2,3]")).toBeNull();
  });

  it("gibt null bei leerer Eingabe", () => {
    expect(extractJson("")).toBeNull();
    expect(extractJson(undefined)).toBeNull();
  });
});

describe("validateFindings", () => {
  it("übernimmt Hausaufgaben und Klausuren mit dem richtigen kind", () => {
    const { events } = validateFindings(
      {
        homework: [{ title: "Aufgabe 4", subject: "Mathe", due: "2026-09-08" }],
        exams: [{ title: "Klausur Analysis", subject: "Mathe", due: "2026-09-19" }],
      },
      { today, fallbackSubject: "" },
    );
    expect(events).toEqual([
      { kind: "homework", title: "Aufgabe 4", subject: "Mathe", due: "2026-09-08" },
      { kind: "exam", title: "Klausur Analysis", subject: "Mathe", due: "2026-09-19" },
    ]);
  });

  it("verwirft einen Termin ohne Titel", () => {
    const { events } = validateFindings(
      { homework: [{ title: "   ", subject: "Mathe", due: "2026-09-08" }] },
      { today, fallbackSubject: "" },
    );
    expect(events).toEqual([]);
  });

  it("verwirft ein Datum im falschen Format", () => {
    const { events } = validateFindings(
      { homework: [{ title: "Aufgabe", due: "8.9.2026" }] },
      { today, fallbackSubject: "Mathe" },
    );
    expect(events).toEqual([]);
  });

  it("verwirft ein unmögliches Datum", () => {
    const { events } = validateFindings(
      { homework: [{ title: "Aufgabe", due: "2026-02-30" }] },
      { today, fallbackSubject: "Mathe" },
    );
    expect(events).toEqual([]);
  });

  it("verwirft ein Datum mehr als ein Jahr entfernt", () => {
    const { events } = validateFindings(
      {
        homework: [
          { title: "Weit weg", due: "2028-01-01" },
          { title: "Lange her", due: "2019-05-05" },
        ],
      },
      { today, fallbackSubject: "Mathe" },
    );
    expect(events).toEqual([]);
  });

  it("nimmt das Fach der Notiz, wenn das Modell keines nennt", () => {
    const { events } = validateFindings(
      { homework: [{ title: "Aufgabe", due: "2026-09-08" }] },
      { today, fallbackSubject: "Chemie" },
    );
    expect(events[0].subject).toBe("Chemie");
  });

  it("kürzt zu lange Titel und Definitionen", () => {
    const { events, terms } = validateFindings(
      {
        homework: [{ title: "x".repeat(400), due: "2026-09-08" }],
        terms: [{ term: "Begriff", definition: "y".repeat(900) }],
      },
      { today, fallbackSubject: "Mathe" },
    );
    expect(events[0].title).toHaveLength(200);
    expect(terms[0].definition).toHaveLength(500);
  });

  it("deckelt die Anzahl der Termine und Begriffe", () => {
    const { events, terms } = validateFindings(
      {
        homework: Array.from({ length: 30 }, (_, i) => ({ title: `A${i}`, due: "2026-09-08" })),
        exams: Array.from({ length: 30 }, (_, i) => ({ title: `K${i}`, due: "2026-09-19" })),
        terms: Array.from({ length: 60 }, (_, i) => ({ term: `B${i}`, definition: "x" })),
      },
      { today, fallbackSubject: "Mathe" },
    );
    expect(events).toHaveLength(MAX_EVENTS_PER_NOTE);
    expect(terms).toHaveLength(MAX_TERMS_PER_NOTE);
  });

  it("verträgt fehlende und falsch getypte Felder", () => {
    expect(validateFindings({}, { today, fallbackSubject: "" })).toEqual({ events: [], terms: [] });
    expect(validateFindings({ homework: "nein", terms: 5 }, { today, fallbackSubject: "" })).toEqual({
      events: [],
      terms: [],
    });
  });

  it("übernimmt einen Begriff auch ohne Definition", () => {
    const { terms } = validateFindings(
      { terms: [{ term: "Katalysator", subject: "Chemie" }] },
      { today, fallbackSubject: "Chemie" },
    );
    expect(terms).toEqual([{ term: "Katalysator", definition: "", subject: "Chemie" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/documentScan.test.js`
Expected: FAIL — `Failed to resolve import "../src/knowledge/documentScan.js"`

- [ ] **Step 3: Write minimal implementation**

`src/knowledge/documentScan.js` (nur diese Hälfte; Task 5 ergänzt den Rest):

```js
// Der Deckel begrenzt die Kosten eines einzelnen Aufrufs. Längere Notizen
// werden nur bis zur achten Seite gelesen.
export const MAX_SCAN_PAGES = 8;
export const MAX_EVENTS_PER_NOTE = 20;
export const MAX_TERMS_PER_NOTE = 40;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Trotz klarer Anweisung antwortet das Modell oft mit Fließtext um das JSON
// herum oder mit einem Codeblock. Drei Versuche in dieser Reihenfolge,
// danach gilt der Scan als fehlgeschlagen.
export function extractJson(text) {
  const source = String(text ?? "");
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  const candidate = fenced ? fenced[1] : first === -1 ? "" : source.slice(first, last + 1);
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cleanText(value, limit) {
  return String(value ?? "").trim().slice(0, limit);
}

// Ein Datum weiter als ein Jahr entfernt stammt fast immer aus einer
// Jahreszahl im Notiztext, nicht aus einem echten Termin.
function validDue(due, todayMs) {
  const text = String(due ?? "");
  if (!DATE_PATTERN.test(text)) return null;
  const time = Date.parse(`${text}T00:00:00`);
  if (!Number.isFinite(time)) return null;
  if (Math.abs(time - todayMs) > YEAR_MS) return null;
  return text;
}

export function validateFindings(raw, { today, fallbackSubject = "" }) {
  const todayMs = Date.parse(`${today}T00:00:00`);
  const events = [];
  for (const [kind, list] of [
    ["homework", raw?.homework],
    ["exam", raw?.exams],
  ]) {
    for (const entry of Array.isArray(list) ? list : []) {
      const title = cleanText(entry?.title, 200);
      const due = validDue(entry?.due, todayMs);
      if (!title || !due) continue;
      events.push({
        kind,
        title,
        subject: cleanText(entry?.subject, 60) || fallbackSubject,
        due,
      });
    }
  }

  const terms = [];
  for (const entry of Array.isArray(raw?.terms) ? raw.terms : []) {
    const term = cleanText(entry?.term, 200);
    if (!term) continue;
    terms.push({
      term,
      definition: cleanText(entry?.definition, 500),
      subject: cleanText(entry?.subject, 60) || fallbackSubject,
    });
  }

  return {
    events: events.slice(0, MAX_EVENTS_PER_NOTE),
    terms: terms.slice(0, MAX_TERMS_PER_NOTE),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/documentScan.test.js`
Expected: PASS, 18 Tests

- [ ] **Step 5: Commit**

```bash
git add src/knowledge/documentScan.js tests/documentScan.test.js
git commit -m "feat(knowledge): parse and validate scan findings"
```

---

## Task 5: Eine Notiz scannen

Der Modellaufruf. `renderPages` und `complete` werden injiziert, damit der Test weder rendert noch ins Netz geht.

**Files:**
- Modify: `src/knowledge/documentScan.js` (anhängen)
- Modify: `tests/documentScan.test.js` (anhängen)

**Interfaces:**
- Consumes: `extractJson`, `validateFindings`, `MAX_SCAN_PAGES` aus Task 4.
- Produces:
  - `SCAN_SYSTEM_PROMPT` (string)
  - `scanImagesOf(documentId) -> Array<{ id, src }>` — bindet `renderNotePagesOf` an die Scan-Optionen
  - `scanNote(note, { renderPages, complete, today }) -> Promise<{ events, terms }>`
  - `note` ist `{ id, title, subject }`.
  - `complete({ messages, signal }) -> Promise<{ content }>` — dieselbe Form, die `requestCompletion` zurückgibt.

- [ ] **Step 1: Write the failing test**

An `tests/documentScan.test.js` anhängen (und den Import oben um `scanNote` erweitern):

```js
import { scanNote } from "../src/knowledge/documentScan.js";

describe("scanNote", () => {
  const note = { id: "note-1", title: "Ableitungsregeln", subject: "Mathe" };
  const pages = [{ id: "p1", src: "data:image/jpeg;base64,AAA" }];
  const answer = JSON.stringify({
    homework: [{ title: "Aufgabe 4", subject: "Mathe", due: "2026-09-08" }],
    exams: [],
    terms: [{ term: "Ableitung", definition: "Steigung", subject: "Mathe" }],
  });

  it("schickt die Seiten als Bildteile und liefert geprüfte Funde", async () => {
    let sent = null;
    const result = await scanNote(note, {
      renderPages: () => pages,
      complete: async (payload) => {
        sent = payload;
        return { content: answer };
      },
      today,
    });

    expect(sent.messages).toHaveLength(2);
    expect(sent.messages[0].role).toBe("system");
    const parts = sent.messages[1].content;
    expect(parts[0].type).toBe("text");
    expect(parts[0].text).toContain("2026-09-04");
    expect(parts[0].text).toContain("Ableitungsregeln");
    expect(parts[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,AAA" },
    });
    expect(result.events).toHaveLength(1);
    expect(result.terms).toHaveLength(1);
  });

  it("schickt höchstens acht Seiten", async () => {
    let sent = null;
    await scanNote(note, {
      renderPages: () =>
        Array.from({ length: 12 }, (_, index) => ({ id: `p${index}`, src: `data:,${index}` })),
      complete: async (payload) => {
        sent = payload;
        return { content: answer };
      },
      today,
    });
    const images = sent.messages[1].content.filter((part) => part.type === "image_url");
    expect(images).toHaveLength(8);
  });

  it("ruft das Modell gar nicht auf, wenn die Notiz keine Seiten hat", async () => {
    let called = false;
    const result = await scanNote(note, {
      renderPages: () => [],
      complete: async () => {
        called = true;
        return { content: answer };
      },
      today,
    });
    expect(called).toBe(false);
    expect(result).toEqual({ events: [], terms: [] });
  });

  it("wirft bei einer Antwort ohne brauchbares JSON", async () => {
    await expect(
      scanNote(note, {
        renderPages: () => pages,
        complete: async () => ({ content: "Ich kann das Bild nicht lesen." }),
        today,
      }),
    ).rejects.toThrow(/JSON/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/documentScan.test.js`
Expected: FAIL — `scanNote is not a function`

- [ ] **Step 3: Write minimal implementation**

An `src/knowledge/documentScan.js` anhängen:

```js
import { renderNotePagesOf } from "../documents/notePreview.js";

// JPEG statt PNG und 1000 px statt 1280: für Handschrift gut lesbar, als
// Base64 in einer HTTP-Anfrage rund eine Größenordnung kleiner.
const SCAN_IMAGE_OPTIONS = { maxDimension: 1000, mimeType: "image/jpeg", quality: 0.72 };

export function scanImagesOf(documentId) {
  return renderNotePagesOf(documentId, SCAN_IMAGE_OPTIONS);
}

export const SCAN_SYSTEM_PROMPT = [
  "Du wertest die Seiten einer Schulnotiz aus. Du antwortest ausschließlich mit JSON, ohne Fließtext davor oder danach.",
  "Du suchst drei Dinge: Hausaufgaben, Klausur- und Prüfungstermine, und Fachbegriffe, die in der Notiz erklärt oder eingeführt werden.",
  "Format:",
  '{"homework":[{"title":"","subject":"","due":"YYYY-MM-DD"}],"exams":[{"title":"","subject":"","due":"YYYY-MM-DD"}],"terms":[{"term":"","definition":"","subject":""}]}',
  "Erfinde nichts. Steht in der Notiz keine Hausaufgabe, bleibt homework leer. Ein leeres Ergebnis ist ein richtiges Ergebnis.",
  "Als Begriff zählt nur ein Fachbegriff mit erkennbarer Bedeutung im Fach, kein Alltagswort.",
  "Rechne relative Angaben wie \"bis nächsten Freitag\" in ein absolutes Datum um, ausgehend vom genannten heutigen Datum.",
].join("\n");

function scanContext(note, today) {
  return [
    `Heutiges Datum: ${today}.`,
    `Notiz: "${note.title || "ohne Titel"}"${note.subject ? ` (Fach: ${note.subject})` : ""}.`,
    "Die folgenden Bilder sind die Seiten dieser Notiz.",
  ].join("\n");
}

export async function scanNote(note, { renderPages, complete, today, signal }) {
  const pages = renderPages(note.id).slice(0, MAX_SCAN_PAGES);
  if (pages.length === 0) return { events: [], terms: [] };

  const message = await complete({
    messages: [
      { role: "system", content: SCAN_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: scanContext(note, today) },
          // Der Space erkennt diese Teile und routet selbst auf das
          // Vision-Modell - deshalb ist am Backend nichts zu ändern.
          ...pages.map((page) => ({ type: "image_url", image_url: { url: page.src } })),
        ],
      },
    ],
    signal,
  });

  const parsed = extractJson(message?.content);
  if (!parsed) throw new Error("Antwort des Modells war kein gültiges JSON.");
  return validateFindings(parsed, { today, fallbackSubject: note.subject || "" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/documentScan.test.js`
Expected: PASS, 22 Tests

- [ ] **Step 5: Commit**

```bash
git add src/knowledge/documentScan.js tests/documentScan.test.js
git commit -m "feat(knowledge): scan one note through the vision model"
```

---

## Task 6: Den Lauf orchestrieren

Die Schleife über die fälligen Notizen. Ein Fehler bei einer Notiz darf den Lauf nicht abbrechen und die Notiz nicht als gescannt markieren — sie muss beim nächsten Lauf wieder drankommen.

**Files:**
- Modify: `src/knowledge/documentScan.js` (anhängen)
- Test: `tests/scanRun.test.js`

**Interfaces:**
- Consumes: `scanNote` aus Task 5; `dueNotes`, `isRunDue` aus Task 1; das Repository aus Task 2.
- Produces:
  - `runScan({ notes, repository, renderPages, complete, now, today, force }) -> Promise<{ scanned, skipped, error }>`
  - `force = true` übergeht Slotgrenze und Ruhezeit, scannt aber weiterhin nur seit dem letzten Scan veränderte Notizen.

- [ ] **Step 1: Write the failing test**

`tests/scanRun.test.js`:

```js
import { beforeEach, describe, expect, it } from "vitest";
import { runScan } from "../src/knowledge/documentScan.js";
import { createKnowledgeRepository } from "../src/knowledge/knowledgeRepository.js";

const today = "2026-09-04";
// 2026-09-04 ist ein Freitag; 16:00 liegt hinter dem 15:00-Slot.
const now = new Date(2026, 8, 4, 16, 0, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;

const answer = JSON.stringify({
  homework: [{ title: "Aufgabe 4", subject: "Mathe", due: "2026-09-08" }],
  exams: [],
  terms: [],
});

let repository;

beforeEach(() => {
  const values = new Map();
  repository = createKnowledgeRepository(
    { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    { now: () => now },
  );
});

const renderPages = () => [{ id: "p1", src: "data:image/jpeg;base64,AAA" }];

describe("runScan", () => {
  it("scannt fällige Notizen und hält Zustand fest", async () => {
    const notes = [{ id: "note-1", title: "A", subject: "Mathe", updatedAt: now - 3 * HOUR }];
    const result = await runScan({
      notes,
      repository,
      renderPages,
      complete: async () => ({ content: answer }),
      now,
      today,
    });

    expect(result).toMatchObject({ scanned: 1, skipped: false, error: null });
    const state = repository.read();
    expect(state.events).toHaveLength(1);
    expect(state.scanState.notes["note-1"]).toBe(now);
    expect(state.scanState.lastRunAt).toBe(now);
  });

  it("überspringt den Lauf, wenn der Slot schon bedient ist", async () => {
    repository.finishRun({ at: now - 30 * 60 * 1000, error: null });
    let called = false;
    const result = await runScan({
      notes: [{ id: "note-1", title: "A", subject: "Mathe", updatedAt: now - 3 * HOUR }],
      repository,
      renderPages,
      complete: async () => {
        called = true;
        return { content: answer };
      },
      now,
      today,
    });

    expect(result.skipped).toBe(true);
    expect(called).toBe(false);
  });

  it("läuft mit force trotz bedientem Slot", async () => {
    repository.finishRun({ at: now - 30 * 60 * 1000, error: null });
    const result = await runScan({
      notes: [{ id: "note-1", title: "A", subject: "Mathe", updatedAt: now - 60 * 1000 }],
      repository,
      renderPages,
      complete: async () => ({ content: answer }),
      now,
      today,
      force: true,
    });

    expect(result).toMatchObject({ scanned: 1, skipped: false });
  });

  it("macht nach einem Fehler mit der nächsten Notiz weiter", async () => {
    const notes = [
      { id: "kaputt", title: "A", subject: "Mathe", updatedAt: now - 9 * HOUR },
      { id: "gut", title: "B", subject: "Mathe", updatedAt: now - 3 * HOUR },
    ];
    const result = await runScan({
      notes,
      repository,
      renderPages,
      complete: async (payload) =>
        payload.messages[1].content[0].text.includes('"A"')
          ? { content: "kein json" }
          : { content: answer },
      now,
      today,
    });

    expect(result.scanned).toBe(1);
    expect(result.error).toMatch(/JSON/);
    const state = repository.read();
    expect(state.scanState.notes.kaputt).toBeUndefined();
    expect(state.scanState.notes.gut).toBe(now);
  });

  it("meldet einen Netzwerkfehler und speichert nichts", async () => {
    const result = await runScan({
      notes: [{ id: "note-1", title: "A", subject: "Mathe", updatedAt: now - 3 * HOUR }],
      repository,
      renderPages,
      complete: async () => {
        throw new Error("Server nicht erreichbar. Verbindung prüfen.");
      },
      now,
      today,
    });

    expect(result.scanned).toBe(0);
    expect(result.error).toBe("Server nicht erreichbar. Verbindung prüfen.");
    expect(repository.read().events).toEqual([]);
  });

  it("verdoppelt bei einem zweiten Lauf nichts", async () => {
    const notes = [{ id: "note-1", title: "A", subject: "Mathe", updatedAt: now - 3 * HOUR }];
    const options = { notes, repository, renderPages, complete: async () => ({ content: answer }), today };
    await runScan({ ...options, now });
    // Notiz danach ergänzt, deshalb wieder fällig.
    notes[0].updatedAt = now + 4 * HOUR;
    await runScan({ ...options, now: now + 7 * HOUR });
    expect(repository.read().events).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scanRun.test.js`
Expected: FAIL — `runScan is not a function`

- [ ] **Step 3: Write minimal implementation**

An `src/knowledge/documentScan.js` anhängen (Import oben ergänzen):

```js
import { dueNotes, isRunDue } from "./scanQueue.js";
```

```js
// Notizen werden nacheinander gescannt, nicht parallel: der Proxy ist eine
// gemeinsame, ratenbegrenzte Ressource, und ein Lauf hat keine Eile.
export async function runScan({
  notes,
  repository,
  renderPages,
  complete,
  now,
  today,
  force = false,
  signal,
}) {
  const { scanState } = repository.read();
  if (!force && !isRunDue({ now, scanState })) return { scanned: 0, skipped: true, error: null };

  const queue = dueNotes({
    now,
    notes,
    scanState,
    ...(force ? { quietPeriodMs: 0 } : {}),
  });

  let scanned = 0;
  let lastError = null;
  for (const note of queue) {
    try {
      const findings = await scanNote(note, { renderPages, complete, today, signal });
      repository.mergeFindings({ ...findings, sourceNoteId: note.id });
      // Erst nach dem erfolgreichen Merge: eine fehlgeschlagene Notiz bleibt
      // fällig und kommt beim nächsten Lauf wieder dran.
      repository.markNoteScanned(note.id, now);
      scanned += 1;
    } catch (error) {
      lastError = error?.message || "Unbekannter Fehler beim Auswerten.";
    }
  }

  repository.finishRun({ at: now, error: lastError });
  return { scanned, skipped: false, error: lastError };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scanRun.test.js`
Expected: PASS, 6 Tests

- [ ] **Step 5: Commit**

```bash
git add src/knowledge/documentScan.js tests/scanRun.test.js
git commit -m "feat(knowledge): orchestrate a scan run over due notes"
```

---

# Phase C — Der Lernplan

## Task 7: Minutenbudget je Tag

Der Kern der Zeitregeln, rein rechnerisch. Ein Sprachmodell hält Minutenbudgets nicht ein; diese Funktion kann sie nicht verletzen.

**Files:**
- Create: `src/knowledge/studyPlan.js`
- Test: `tests/studyPlan.test.js`

**Interfaces:**
- Consumes: nichts.
- Produces:
  - `BASE_MINUTES = 70`, `MAX_MINUTES = 120`, `HOMEWORK_MINUTES = 30`, `EXAM_MINUTES = 180`, `EXAM_LEAD_DAYS = 10`, `PLAN_DAYS = 7`, `WEDNESDAY = 3`
  - `isoDate(value) -> "YYYY-MM-DD"` (Ortszeit)
  - `dailyBudgets(events, { today, days }) -> Array<{ date, budgetMinutes }>`
  - `events` sind die gespeicherten Termine aus Task 2 (`{ kind, due, done, subject, title }`).

- [ ] **Step 1: Write the failing test**

`tests/studyPlan.test.js`:

```js
import { describe, expect, it } from "vitest";
import {
  BASE_MINUTES,
  dailyBudgets,
  isoDate,
  MAX_MINUTES,
} from "../src/knowledge/studyPlan.js";

// 2026-09-07 ist ein Montag, 2026-09-09 ein Mittwoch.
const MONTAG = "2026-09-07";
const MITTWOCH = "2026-09-09";

const budgetOn = (budgets, date) => budgets.find((day) => day.date === date).budgetMinutes;

describe("isoDate", () => {
  it("formatiert in Ortszeit", () => {
    expect(isoDate(new Date(2026, 8, 7, 23, 30))).toBe("2026-09-07");
  });
});

describe("dailyBudgets", () => {
  it("liefert sieben Tage ab heute", () => {
    const budgets = dailyBudgets([], { today: MONTAG });
    expect(budgets).toHaveLength(7);
    expect(budgets[0].date).toBe(MONTAG);
    expect(budgets[6].date).toBe("2026-09-13");
  });

  it("gibt Schultagen ohne Aufgaben den Sockel von 70 Minuten", () => {
    const budgets = dailyBudgets([], { today: MONTAG });
    expect(budgetOn(budgets, MONTAG)).toBe(BASE_MINUTES);
    expect(budgetOn(budgets, "2026-09-08")).toBe(BASE_MINUTES);
    expect(budgetOn(budgets, "2026-09-10")).toBe(BASE_MINUTES);
    expect(budgetOn(budgets, "2026-09-11")).toBe(BASE_MINUTES);
  });

  it("lässt Mittwoch auf null", () => {
    expect(budgetOn(dailyBudgets([], { today: MONTAG }), MITTWOCH)).toBe(0);
  });

  it("hebt den Mittwoch auch unter Klausurdruck nicht an", () => {
    const events = Array.from({ length: 5 }, (_, index) => ({
      kind: "exam",
      title: `Klausur ${index}`,
      subject: "Mathe",
      due: "2026-09-11",
      done: false,
    }));
    expect(budgetOn(dailyBudgets(events, { today: MONTAG }), MITTWOCH)).toBe(0);
  });

  it("lässt das Wochenende ohne Aufgaben leer", () => {
    const budgets = dailyBudgets([], { today: MONTAG });
    expect(budgetOn(budgets, "2026-09-12")).toBe(0);
    expect(budgetOn(budgets, "2026-09-13")).toBe(0);
  });

  it("hebt einen Schultag durch offene Hausaufgaben an", () => {
    const events = [
      { kind: "homework", title: "Aufgabe 1", subject: "Mathe", due: MONTAG, done: false },
    ];
    expect(budgetOn(dailyBudgets(events, { today: MONTAG }), MONTAG)).toBe(BASE_MINUTES + 30);
  });

  it("überschreitet nie 120 Minuten", () => {
    const events = Array.from({ length: 12 }, (_, index) => ({
      kind: "homework",
      title: `Aufgabe ${index}`,
      subject: "Mathe",
      due: MONTAG,
      done: false,
    }));
    expect(budgetOn(dailyBudgets(events, { today: MONTAG }), MONTAG)).toBe(MAX_MINUTES);
  });

  it("ignoriert abgehakte Termine", () => {
    const events = [
      { kind: "homework", title: "Erledigt", subject: "Mathe", due: MONTAG, done: true },
    ];
    expect(budgetOn(dailyBudgets(events, { today: MONTAG }), MONTAG)).toBe(BASE_MINUTES);
  });

  it("verteilt eine Klausur auf die Lerntage davor, nicht auf den Klausurtag", () => {
    const events = [
      { kind: "exam", title: "Klausur", subject: "Mathe", due: "2026-09-11", done: false },
    ];
    const budgets = dailyBudgets(events, { today: MONTAG });
    // Lerntage bis zur Klausur: Mo, Di, Do (Mittwoch fällt raus, Fr ist der
    // Termin selbst). 180 / 3 = 60 Minuten je Tag, plus Sockel 70 wären 130 -
    // der Deckel schneidet auf 120.
    expect(budgetOn(budgets, MONTAG)).toBe(MAX_MINUTES);
    expect(budgetOn(budgets, "2026-09-08")).toBe(MAX_MINUTES);
    expect(budgetOn(budgets, "2026-09-10")).toBe(MAX_MINUTES);
    // Der Klausurtag selbst bekommt keine Vorbereitung mehr, nur den Sockel.
    expect(budgetOn(budgets, "2026-09-11")).toBe(BASE_MINUTES);
  });

  it("verteilt eine weiter entfernte Klausur so, dass der Deckel nicht greift", () => {
    const events = [
      { kind: "exam", title: "Klausur", subject: "Mathe", due: "2026-09-25", done: false },
    ];
    const budgets = dailyBudgets(events, { today: MONTAG });
    // Bis zum 25.09. liegen 15 Lerntage vor der Klausur, also greift
    // EXAM_LEAD_DAYS: nur die letzten zehn bekommen etwas ab, 180 / 10 = 18
    // Minuten je Tag. Von diesen zehn liegt allein der 13.09. noch im
    // Planfenster, der Rest des Fensters bleibt beim Sockel.
    expect(budgetOn(budgets, MONTAG)).toBe(BASE_MINUTES);
    expect(budgetOn(budgets, "2026-09-13")).toBe(18);
  });

  it("schiebt einen überfälligen Termin auf heute", () => {
    const events = [
      { kind: "homework", title: "Vergessen", subject: "Mathe", due: "2026-09-01", done: false },
    ];
    expect(budgetOn(dailyBudgets(events, { today: MONTAG }), MONTAG)).toBe(BASE_MINUTES + 30);
  });

  it("verteilt eine Hausaufgabe gleichmäßig bis zur Fälligkeit", () => {
    const events = [
      { kind: "homework", title: "Aufsatz", subject: "Deutsch", due: "2026-09-08", done: false },
    ];
    const budgets = dailyBudgets(events, { today: MONTAG });
    // Zwei Lerntage (Mo, Di), also 15 Minuten je Tag.
    expect(budgetOn(budgets, MONTAG)).toBe(BASE_MINUTES + 15);
    expect(budgetOn(budgets, "2026-09-08")).toBe(BASE_MINUTES + 15);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/studyPlan.test.js`
Expected: FAIL — `Failed to resolve import "../src/knowledge/studyPlan.js"`

- [ ] **Step 3: Write minimal implementation**

`src/knowledge/studyPlan.js`:

```js
// Der Pflichtsockel an Schultagen: er steht auch dann im Plan, wenn nichts
// ansteht - dann als Wiederholung.
export const BASE_MINUTES = 70;
export const MAX_MINUTES = 120;

// Grobe Pauschalen. Sie sind der erste Wert, an dem gedreht wird, wenn der
// Plan sich falsch anfühlt.
export const HOMEWORK_MINUTES = 30;
export const EXAM_MINUTES = 180;
export const EXAM_LEAD_DAYS = 10;

export const PLAN_DAYS = 7;
// Mittwoch findet die Lernzeit in der Schule statt, deshalb plant die App
// dort nichts ein - unabhängig davon, wie viel ansteht.
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

// Tagesschritte über setDate, nicht über eine Millisekunden-Addition: sonst
// verschiebt die Sommerzeitumstellung das Datum um einen Tag.
function daysFrom(startIso, count) {
  const days = [];
  const cursor = dateOf(startIso);
  for (let index = 0; index < count; index += 1) {
    days.push(isoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// Alle Tage von startIso bis endIso einschließlich, ohne Mittwoche.
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
    // Überfälliges zählt auf heute, nicht auf ein vergangenes Datum.
    const due = event.due < today ? today : event.due;
    let spread = learningDays(today, due);
    if (event.kind === "exam") {
      // Vorbereitung findet vor der Klausur statt, nicht am Klausurtag.
      spread = spread.filter((iso) => iso < due).slice(-EXAM_LEAD_DAYS);
    }
    if (spread.length === 0) spread = [today];
    const share = (event.kind === "exam" ? EXAM_MINUTES : HOMEWORK_MINUTES) / spread.length;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/studyPlan.test.js`
Expected: PASS, 13 Tests

- [ ] **Step 5: Commit**

```bash
git add src/knowledge/studyPlan.js tests/studyPlan.test.js
git commit -m "feat(knowledge): compute daily study minute budgets"
```

---

## Task 8: Den Plan mit Inhalten füllen

Das Modell verteilt Inhalte auf bereits berechnete Minuten. Beim Zusammenbauen wird erzwungen, dass es das Budget nicht sprengt. Fällt der Aufruf aus, entsteht trotzdem ein Plan.

**Files:**
- Modify: `src/knowledge/studyPlan.js` (anhängen)
- Modify: `tests/studyPlan.test.js` (anhängen)

**Interfaces:**
- Consumes: `dailyBudgets`, `PLAN_DAYS` aus Task 7; `extractJson` aus Task 4.
- Produces:
  - `buildPlan({ events, terms, subjects, today, complete }) -> Promise<{ generatedFor, days }>`
  - `days` ist `Array<{ date, budgetMinutes, blocks }>`, `blocks` ist `Array<{ subject, task, minutes }>`.
  - `subjects` ist eine Liste von Fachnamen (Zeichenketten) aus dem Stundenplan.

- [ ] **Step 1: Write the failing test**

An `tests/studyPlan.test.js` anhängen (Import oben um `buildPlan` erweitern):

```js
describe("buildPlan", () => {
  const events = [
    { kind: "homework", title: "Aufgabe 4", subject: "Mathe", due: "2026-09-08", done: false },
  ];

  const answerFor = (blocksByDate) => ({
    content: JSON.stringify({ days: blocksByDate }),
  });

  it("übernimmt die Blöcke des Modells und behält die berechneten Budgets", async () => {
    const plan = await buildPlan({
      events,
      terms: [],
      subjects: ["Mathe"],
      today: MONTAG,
      complete: async () =>
        answerFor({ [MONTAG]: [{ subject: "Mathe", task: "Aufgabe 4 rechnen", minutes: 40 }] }),
    });

    expect(plan.generatedFor).toBe(MONTAG);
    const montag = plan.days.find((day) => day.date === MONTAG);
    expect(montag.budgetMinutes).toBe(BASE_MINUTES + 15);
    expect(montag.blocks[0]).toEqual({ subject: "Mathe", task: "Aufgabe 4 rechnen", minutes: 40 });
  });

  it("kürzt Blöcke, die das Tagesbudget überschreiten", async () => {
    const plan = await buildPlan({
      events: [],
      terms: [],
      subjects: ["Mathe"],
      today: MONTAG,
      complete: async () =>
        answerFor({
          [MONTAG]: [
            { subject: "Mathe", task: "Teil 1", minutes: 60 },
            { subject: "Mathe", task: "Teil 2", minutes: 60 },
            { subject: "Mathe", task: "Teil 3", minutes: 60 },
          ],
        }),
    });

    const montag = plan.days.find((day) => day.date === MONTAG);
    const summe = montag.blocks.reduce((total, block) => total + block.minutes, 0);
    expect(summe).toBe(BASE_MINUTES);
    expect(montag.blocks).toHaveLength(2);
    expect(montag.blocks[1].minutes).toBe(10);
  });

  it("lässt den Mittwoch leer, auch wenn das Modell Blöcke liefert", async () => {
    const plan = await buildPlan({
      events: [],
      terms: [],
      subjects: ["Mathe"],
      today: MONTAG,
      complete: async () =>
        answerFor({ [MITTWOCH]: [{ subject: "Mathe", task: "Trotzdem lernen", minutes: 60 }] }),
    });

    expect(plan.days.find((day) => day.date === MITTWOCH).blocks).toEqual([]);
  });

  it("baut ohne Modell einen Rückfallplan aus den offenen Terminen", async () => {
    const plan = await buildPlan({
      events,
      terms: [],
      subjects: ["Mathe"],
      today: MONTAG,
      complete: async () => {
        throw new Error("Server nicht erreichbar.");
      },
    });

    const montag = plan.days.find((day) => day.date === MONTAG);
    expect(montag.blocks.length).toBeGreaterThan(0);
    expect(montag.blocks[0].task).toContain("Aufgabe 4");
    const summe = montag.blocks.reduce((total, block) => total + block.minutes, 0);
    expect(summe).toBeLessThanOrEqual(montag.budgetMinutes);
  });

  it("verwirft Blöcke ohne Aufgabentext", async () => {
    const plan = await buildPlan({
      events: [],
      terms: [],
      subjects: ["Mathe"],
      today: MONTAG,
      complete: async () =>
        answerFor({ [MONTAG]: [{ subject: "Mathe", task: "   ", minutes: 30 }] }),
    });

    expect(plan.days.find((day) => day.date === MONTAG).blocks).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/studyPlan.test.js`
Expected: FAIL — `buildPlan is not a function`

- [ ] **Step 3: Write minimal implementation**

An `src/knowledge/studyPlan.js` anhängen (Import oben ergänzen):

```js
import { extractJson } from "./documentScan.js";
```

```js
const MIN_BLOCK_MINUTES = 5;

const PLAN_SYSTEM_PROMPT = [
  "Du bist der Lernplaner einer Schul-Notizbuch-App. Du antwortest ausschließlich mit JSON, ohne Fließtext davor oder danach.",
  'Format: {"days":{"YYYY-MM-DD":[{"subject":"","task":"","minutes":0}]}}',
  "Du bekommst für jeden Tag ein festes Minutenbudget. Die Summe der Blockminuten eines Tages darf dieses Budget nicht überschreiten.",
  "Tage mit Budget 0 bekommen keine Blöcke.",
  "Plane vorrangig, was fällig ist: nahe Hausaufgaben zuerst, Klausurstoff verteilt über die Tage davor.",
  "Ist Budget übrig, plane Wiederholung mit den genannten Begriffen und Fächern.",
  "Jede Aufgabe ist ein kurzer, konkreter deutscher Satz, kein Schlagwort.",
].join("\n");

function planRequest({ events, terms, subjects, budgets, today }) {
  const open = events.filter((event) => !event.done);
  return [
    `Heutiges Datum: ${today}.`,
    "",
    "Budgets (Minuten je Tag, unveränderlich):",
    ...budgets.map((day) => `- ${day.date}: ${day.budgetMinutes}`),
    "",
    "Offene Termine:",
    ...(open.length
      ? open.map(
          (event) =>
            `- ${event.due} · ${event.kind === "exam" ? "Klausur" : "Hausaufgabe"} · ${event.subject || "ohne Fach"} · ${event.title}`,
        )
      : ["- keine"]),
    "",
    `Fächer im Stundenplan: ${subjects.length ? subjects.join(", ") : "unbekannt"}.`,
    "",
    "Begriffe für Wiederholung:",
    ...(terms.length
      ? terms.slice(0, 40).map((term) => `- ${term.subject || "ohne Fach"}: ${term.term}`)
      : ["- keine"]),
  ].join("\n");
}

// Die harte Grenze: was das Modell auch liefert, ein Tag bekommt nie mehr
// Minuten als sein berechnetes Budget, und ein Tag mit Budget 0 bleibt leer.
function fitBlocks(blocks, budgetMinutes) {
  if (budgetMinutes <= 0) return [];
  const fitted = [];
  let remaining = budgetMinutes;
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (remaining <= 0) break;
    const task = String(block?.task ?? "").trim().slice(0, 200);
    if (!task) continue;
    const wanted = Math.max(MIN_BLOCK_MINUTES, Math.round(Number(block?.minutes) || 0));
    const minutes = Math.min(remaining, wanted);
    fitted.push({ subject: String(block?.subject ?? "").trim().slice(0, 60), task, minutes });
    remaining -= minutes;
  }
  return fitted;
}

function mostLoadedSubject(events) {
  const counts = new Map();
  for (const event of events) {
    const subject = event.subject || "";
    if (subject) counts.set(subject, (counts.get(subject) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

// Ohne Modellantwort ist der Plan dürftig, aber vorhanden: je fälligem Termin
// ein Block, der Rest Wiederholung im am stärksten belasteten Fach.
function fallbackBlocks(date, events, budgetMinutes) {
  if (budgetMinutes <= 0) return [];
  const open = events.filter((event) => !event.done && event.due >= date);
  const blocks = open.slice(0, 3).map((event) => ({
    subject: event.subject,
    task: event.kind === "exam" ? `Vorbereitung: ${event.title}` : event.title,
    minutes: event.kind === "exam" ? 40 : HOMEWORK_MINUTES,
  }));
  const used = blocks.reduce((total, block) => total + block.minutes, 0);
  if (used < budgetMinutes) {
    blocks.push({
      subject: mostLoadedSubject(open),
      task: "Wiederholung der letzten Stunden",
      minutes: budgetMinutes - used,
    });
  }
  return blocks;
}

export async function buildPlan({ events = [], terms = [], subjects = [], today, complete }) {
  const budgets = dailyBudgets(events, { today });

  let blocksByDate = null;
  try {
    const message = await complete({
      messages: [
        { role: "system", content: PLAN_SYSTEM_PROMPT },
        { role: "user", content: planRequest({ events, terms, subjects, budgets, today }) },
      ],
    });
    const parsed = extractJson(message?.content);
    const days = parsed?.days;
    blocksByDate = days && typeof days === "object" && !Array.isArray(days) ? days : null;
  } catch {
    blocksByDate = null;
  }

  return {
    generatedFor: today,
    days: budgets.map(({ date, budgetMinutes }) => ({
      date,
      budgetMinutes,
      blocks: fitBlocks(
        blocksByDate?.[date] ?? fallbackBlocks(date, events, budgetMinutes),
        budgetMinutes,
      ),
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/studyPlan.test.js`
Expected: PASS, 18 Tests

- [ ] **Step 5: Commit**

```bash
git add src/knowledge/studyPlan.js tests/studyPlan.test.js
git commit -m "feat(knowledge): fill the study plan with model content"
```

---

# Phase D — Oberfläche

## Task 9: React-Anbindung

Der Hook stößt den Lauf an, liefert die Daten und erneuert den Plan. Er ist die einzige Stelle, an der `requestCompletion` und `scanImagesOf` mit den reinen Modulen zusammenkommen.

**Files:**
- Create: `src/hooks/useKnowledge.js`
- Test: `tests/useKnowledge.test.jsx`

**Interfaces:**
- Consumes: `browserKnowledgeRepository` (Task 2), `runScan`/`scanImagesOf` (Task 5, 6), `buildPlan`/`isoDate` (Task 7, 8), `requestCompletion` aus `src/agent/agentClient.js`.
- Produces:
  - Default-Export `useKnowledge({ notes, subjects }) -> { events, openEvents, terms, plan, scanState, autoScan, isScanning, isPlanning, scanNow, setEventDone, setAutoScan, refreshPlan }`
  - `openEvents` sind die nicht abgehakten Termine der nächsten 14 Tage, nach `due` sortiert.

- [ ] **Step 1: Write the failing test**

`tests/useKnowledge.test.jsx`:

```jsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("../src/agent/agentClient.js", () => ({
  requestCompletion: vi.fn(async () => ({ content: '{"homework":[],"exams":[],"terms":[]}' })),
}));
vi.mock("../src/knowledge/documentScan.js", async (importOriginal) => ({
  ...(await importOriginal()),
  scanImagesOf: () => [{ id: "p1", src: "data:image/jpeg;base64,AAA" }],
}));

import useKnowledge from "../src/hooks/useKnowledge.js";
import { KNOWLEDGE_STORAGE_KEY } from "../src/knowledge/knowledgeRepository.js";

beforeEach(() => {
  globalThis.localStorage.clear();
});

const HOUR = 60 * 60 * 1000;

describe("useKnowledge", () => {
  it("liefert offene Termine sortiert und ohne abgehakte", async () => {
    const today = new Date();
    const iso = (offsetDays) => {
      const date = new Date(today);
      date.setDate(date.getDate() + offsetDays);
      return date.toISOString().slice(0, 10);
    };
    globalThis.localStorage.setItem(
      KNOWLEDGE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        events: [
          { id: "b", kind: "homework", title: "Später", subject: "Mathe", due: iso(5), done: false },
          { id: "a", kind: "homework", title: "Früher", subject: "Mathe", due: iso(1), done: false },
          { id: "c", kind: "homework", title: "Fertig", subject: "Mathe", due: iso(2), done: true },
          { id: "d", kind: "exam", title: "Weit weg", subject: "Mathe", due: iso(40), done: false },
        ],
        terms: [],
        scanState: { lastRunAt: Date.now(), lastError: null, notes: {} },
        plan: null,
        settings: { autoScan: false },
      }),
    );

    const { result } = renderHook(() => useKnowledge({ notes: [], subjects: [] }));
    expect(result.current.openEvents.map((event) => event.id)).toEqual(["a", "b"]);
  });

  it("scannt beim Einhängen nicht, wenn die Automatik aus ist", async () => {
    const { requestCompletion } = await import("../src/agent/agentClient.js");
    globalThis.localStorage.setItem(
      KNOWLEDGE_STORAGE_KEY,
      JSON.stringify({ version: 1, settings: { autoScan: false } }),
    );
    const notes = [{ id: "note-1", title: "A", subject: "Mathe", updatedAt: Date.now() - 5 * HOUR }];
    renderHook(() => useKnowledge({ notes, subjects: [] }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requestCompletion).not.toHaveBeenCalled();
  });

  it("scannt auf Knopfdruck auch bei ausgeschalteter Automatik", async () => {
    const { requestCompletion } = await import("../src/agent/agentClient.js");
    requestCompletion.mockClear();
    globalThis.localStorage.setItem(
      KNOWLEDGE_STORAGE_KEY,
      JSON.stringify({ version: 1, settings: { autoScan: false } }),
    );
    const notes = [{ id: "note-1", title: "A", subject: "Mathe", updatedAt: Date.now() - 5 * HOUR }];
    const { result } = renderHook(() => useKnowledge({ notes, subjects: [] }));

    await act(async () => {
      await result.current.scanNow();
    });
    expect(requestCompletion).toHaveBeenCalled();
    await waitFor(() => expect(result.current.isScanning).toBe(false));
  });

  it("hakt einen Termin ab und behält das über einen Neu-Render", async () => {
    globalThis.localStorage.setItem(
      KNOWLEDGE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        events: [
          { id: "a", kind: "homework", title: "X", subject: "Mathe", due: "2030-01-01", done: false },
        ],
        settings: { autoScan: false },
      }),
    );
    const { result } = renderHook(() => useKnowledge({ notes: [], subjects: [] }));
    act(() => {
      result.current.setEventDone("a", true);
    });
    await waitFor(() => expect(result.current.events[0].done).toBe(true));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/useKnowledge.test.jsx`
Expected: FAIL — `Failed to resolve import "../src/hooks/useKnowledge.js"`

- [ ] **Step 3: Write minimal implementation**

`src/hooks/useKnowledge.js`:

```js
import { useCallback, useEffect, useRef, useState } from "react";
import { requestCompletion } from "../agent/agentClient.js";
import { runScan, scanImagesOf } from "../knowledge/documentScan.js";
import { browserKnowledgeRepository } from "../knowledge/knowledgeRepository.js";
import { buildPlan, isoDate } from "../knowledge/studyPlan.js";

const UPCOMING_DAYS = 14;

function upcoming(events, today) {
  const limit = new Date(`${today}T00:00:00`);
  limit.setDate(limit.getDate() + UPCOMING_DAYS);
  const limitIso = isoDate(limit);
  return events
    .filter((event) => !event.done && event.due <= limitIso)
    .sort((a, b) => a.due.localeCompare(b.due));
}

/**
 * Bindet die reinen knowledge-Module an React. Der Scan läuft einmal beim
 * Einhängen der Bibliothek - ein Hintergrunddienst ist auf dem Tablet nicht
 * verfügbar, und die Slotgrenze in scanQueue verhindert, dass mehrmaliges
 * Öffnen mehrmals scannt.
 */
export default function useKnowledge({ notes = [], subjects = [], repository = browserKnowledgeRepository } = {}) {
  const [state, setState] = useState(() => repository.read());
  const [isScanning, setScanning] = useState(false);
  const [isPlanning, setPlanning] = useState(false);
  const busyRef = useRef(false);
  const notesRef = useRef(notes);
  const subjectsRef = useRef(subjects);
  notesRef.current = notes;
  subjectsRef.current = subjects;

  const scanNow = useCallback(
    async ({ force = true } = {}) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setScanning(true);
      const now = Date.now();
      try {
        await runScan({
          notes: notesRef.current,
          repository,
          renderPages: scanImagesOf,
          complete: requestCompletion,
          now,
          today: isoDate(now),
          force,
        });
      } finally {
        busyRef.current = false;
        setScanning(false);
        setState(repository.read());
      }
    },
    [repository],
  );

  const refreshPlan = useCallback(async () => {
    setPlanning(true);
    const today = isoDate(Date.now());
    const current = repository.read();
    try {
      const plan = await buildPlan({
        events: current.events,
        terms: current.terms,
        subjects: subjectsRef.current,
        today,
        complete: requestCompletion,
      });
      repository.savePlan(plan);
    } finally {
      setPlanning(false);
      setState(repository.read());
    }
  }, [repository]);

  const setEventDone = useCallback(
    (id, done) => {
      repository.setEventDone(id, done);
      setState(repository.read());
    },
    [repository],
  );

  const setAutoScan = useCallback(
    (enabled) => {
      repository.setAutoScan(enabled);
      setState(repository.read());
    },
    [repository],
  );

  // Nur einmal je Einhängen: force=false, damit Slotgrenze und Ruhezeit gelten.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!repository.read().settings.autoScan) return;
    scanNow({ force: false });
  }, [repository, scanNow]);

  return {
    events: state.events,
    openEvents: upcoming(state.events, isoDate(Date.now())),
    terms: state.terms,
    plan: state.plan,
    scanState: state.scanState,
    autoScan: state.settings.autoScan,
    isScanning,
    isPlanning,
    scanNow,
    refreshPlan,
    setEventDone,
    setAutoScan,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/useKnowledge.test.jsx`
Expected: PASS, 4 Tests

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useKnowledge.js tests/useKnowledge.test.jsx
git commit -m "feat(knowledge): wire scan and plan into React"
```

---

## Task 10: „Anstehend"-Karte in der Bibliothek

Ersetzt die Attrappe, die in `Library.jsx:3711` schon als `ponytail: placeholder` markiert ist.

**Files:**
- Create: `src/components/UpcomingCard.jsx`
- Modify: `src/components/Library.jsx:3702-3716` (Karteninhalt), Importblock ab Zeile 1, Hook-Aufruf im Rumpf von `Library`
- Modify: `src/styles/main.css` (anhängen)
- Test: `tests/upcomingCard.test.jsx`

**Interfaces:**
- Consumes: `useKnowledge` (Task 9).
- Produces: `UpcomingCard({ events, onToggle })` — Default-Export.

- [ ] **Step 1: Write the failing test**

`tests/upcomingCard.test.jsx`:

```jsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import UpcomingCard from "../src/components/UpcomingCard.jsx";

const events = [
  { id: "a", kind: "homework", title: "Aufgabe 4a-c", subject: "Mathe", due: "2026-09-08", done: false },
  { id: "b", kind: "exam", title: "Klausur Analysis", subject: "Mathe", due: "2026-09-19", done: false },
];

describe("UpcomingCard", () => {
  it("zeigt eine leere Meldung ohne Termine", () => {
    render(<UpcomingCard events={[]} onToggle={() => {}} />);
    expect(screen.getByText("Nichts Offenes gefunden.")).toBeInTheDocument();
  });

  it("listet Termine mit Fach und Datum", () => {
    render(<UpcomingCard events={events} onToggle={() => {}} />);
    expect(screen.getByText("Aufgabe 4a-c")).toBeInTheDocument();
    expect(screen.getByText("Klausur Analysis")).toBeInTheDocument();
    expect(screen.getAllByText(/Mathe/)).not.toHaveLength(0);
  });

  it("kennzeichnet Klausuren als solche", () => {
    render(<UpcomingCard events={events} onToggle={() => {}} />);
    expect(screen.getByTestId("upcoming-b")).toHaveAttribute("data-kind", "exam");
  });

  it("meldet einen Klick als Abhaken", () => {
    const onToggle = vi.fn();
    render(<UpcomingCard events={events} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId("upcoming-a"));
    expect(onToggle).toHaveBeenCalledWith("a", true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/upcomingCard.test.jsx`
Expected: FAIL — `Failed to resolve import "../src/components/UpcomingCard.jsx"`

- [ ] **Step 3: Write minimal implementation**

`src/components/UpcomingCard.jsx`:

```jsx
import React from "react";
import { GraduationCap, NotebookPen } from "lucide-react";

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function formatDue(due) {
  const date = new Date(`${due}T00:00:00`);
  if (Number.isNaN(date.getTime())) return due;
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()}.${date.getMonth() + 1}.`;
}

export default function UpcomingCard({ events, onToggle }) {
  if (!events.length) {
    return (
      <div
        className="agent-card"
        style={{ color: "rgba(255,255,255,.6)", font: "500 12.5px Manrope,sans-serif" }}
      >
        Nichts Offenes gefunden.
      </div>
    );
  }

  return (
    <>
      {events.map((event) => (
        <button
          key={event.id}
          type="button"
          className="agent-card upcoming-row"
          data-testid={`upcoming-${event.id}`}
          data-kind={event.kind}
          onClick={() => onToggle(event.id, true)}
          title="Als erledigt abhaken"
        >
          <span className="upcoming-icon">
            {event.kind === "exam" ? <GraduationCap size={13} /> : <NotebookPen size={13} />}
          </span>
          <span className="upcoming-text">
            <span className="upcoming-title">{event.title}</span>
            <span className="upcoming-meta">
              {[event.subject, formatDue(event.due)].filter(Boolean).join(" · ")}
            </span>
          </span>
        </button>
      ))}
    </>
  );
}
```

An `src/styles/main.css` anhängen:

```css
.upcoming-row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  text-align: left;
  border: none;
  cursor: pointer;
}
.upcoming-icon {
  display: flex;
  color: rgba(255, 255, 255, 0.55);
}
.upcoming-row[data-kind="exam"] .upcoming-icon {
  color: oklch(0.75 0.16 25);
}
.upcoming-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.upcoming-title {
  font: 600 12.5px/1.3 Manrope, sans-serif;
  color: #ffffff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.upcoming-meta {
  font: 600 9.5px ui-monospace, monospace;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/upcomingCard.test.jsx`
Expected: PASS, 4 Tests

- [ ] **Step 5: Karte in die Bibliothek einhängen**

In `src/components/Library.jsx` den Importblock ergänzen:

```jsx
import UpcomingCard from "./UpcomingCard.jsx";
import useKnowledge from "../hooks/useKnowledge.js";
```

Im Rumpf von `Library`, direkt nach `const createdCards = ...` (Zeile 2940, dort wird die Notizliste ohnehin gelesen), einsetzen:

```jsx
  const knowledgeNotes = browserNoteRepository.listNotes();
  const untisSubjects = [...new Set(untisLessons.map((lesson) => lesson.subject).filter(Boolean))];
  const knowledge = useKnowledge({ notes: knowledgeNotes, subjects: untisSubjects });
```

`Library` hat genau ein `return`, ganz am Ende des Rumpfs — die Stelle liegt davor, der Hook wird also unbedingt aufgerufen. Das ist die Regel, die hier zählt: kein Hook hinter einem `return` oder in einer Bedingung.

Den Karteninhalt in Zeile 3702–3716 ersetzen:

```jsx
        <div className="lib-glass agent-panel-card">
          <div className="agent-panel-head">
            <span style={{ font: "700 15px \"Bricolage Grotesque\",sans-serif", color: "#FFFFFF" }}>
              Anstehend
            </span>
            {knowledge.isScanning && <span className="agent-badge">SCAN LÄUFT</span>}
          </div>
          <div className="agent-panel-body">
            <UpcomingCard events={knowledge.openEvents} onToggle={knowledge.setEventDone} />
          </div>
        </div>
```

- [ ] **Step 6: Bestehende Bibliotheks-Tests gegen Netzzugriff absichern**

`tests/App.test.jsx` und `tests/LibraryImport.test.jsx` rendern die Bibliothek und lösen ab jetzt den Auswertungs-Hook mit aus. Mit leerer Notizliste ruft `runScan` das Modell zwar nicht auf, aber die Absicherung darf nicht davon abhängen, dass das so bleibt. In beiden Dateien vor den übrigen Importen ergänzen:

```jsx
vi.mock('../src/agent/agentClient.js', () => ({
  requestCompletion: vi.fn(async () => ({ content: '{"homework":[],"exams":[],"terms":[]}' })),
}));
```

Steht `vi` in der Datei noch nicht im `vitest`-Import, dort ergänzen.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/UpcomingCard.jsx src/components/Library.jsx src/styles/main.css tests/upcomingCard.test.jsx tests/App.test.jsx tests/LibraryImport.test.jsx
git commit -m "feat(library): show upcoming homework and exams"
```

---

## Task 11: Plan-Bildschirm

Lernplan und Glossar auf einem eigenen Bildschirm, erreichbar über die linke Symbolleiste der Bibliothek.

**Files:**
- Create: `src/components/PlanScreen.jsx`
- Modify: `src/App.jsx:236-262` (Bildschirmumschaltung)
- Modify: `src/components/Library.jsx:3154` (Knopf vor dem Einstellungen-Knopf)
- Modify: `src/styles/main.css` (anhängen)
- Test: `tests/planScreen.test.jsx`

**Interfaces:**
- Consumes: `useKnowledge` (Task 9).
- Produces:
  - `PlanScreen({ onBack })` — Default-Export
  - `Library` bekommt die zusätzliche Prop `onOpenPlan`
  - `App` kennt den Bildschirm `"plan"`

- [ ] **Step 1: Write the failing test**

`tests/planScreen.test.jsx`:

```jsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../src/agent/agentClient.js", () => ({
  requestCompletion: vi.fn(async () => ({ content: '{"days":{}}' })),
}));

import PlanScreen from "../src/components/PlanScreen.jsx";
import { KNOWLEDGE_STORAGE_KEY } from "../src/knowledge/knowledgeRepository.js";

beforeEach(() => {
  globalThis.localStorage.clear();
  globalThis.localStorage.setItem(
    KNOWLEDGE_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      events: [],
      terms: [
        { id: "t1", term: "Ableitung", definition: "Steigung einer Funktion", subject: "Mathe" },
        { id: "t2", term: "Katalysator", definition: "senkt die Aktivierungsenergie", subject: "Chemie" },
      ],
      scanState: { lastRunAt: Date.now(), lastError: null, notes: {} },
      plan: {
        generatedFor: "2026-09-07",
        days: [
          { date: "2026-09-07", budgetMinutes: 70, blocks: [{ subject: "Mathe", task: "Aufgabe 4", minutes: 70 }] },
          { date: "2026-09-09", budgetMinutes: 0, blocks: [] },
        ],
      },
      settings: { autoScan: false },
    }),
  );
});

describe("PlanScreen", () => {
  it("zeigt die Blöcke eines geplanten Tages", () => {
    render(<PlanScreen onBack={() => {}} />);
    expect(screen.getByText("Aufgabe 4")).toBeInTheDocument();
    expect(screen.getByText("70 min")).toBeInTheDocument();
  });

  it("erklärt den Mittwoch statt ihn leer zu lassen", () => {
    render(<PlanScreen onBack={() => {}} />);
    expect(screen.getByText("Freier Tag — Lernzeit in der Schule")).toBeInTheDocument();
  });

  it("listet die Glossarbegriffe", () => {
    render(<PlanScreen onBack={() => {}} />);
    expect(screen.getByText("Ableitung")).toBeInTheDocument();
    expect(screen.getByText("Katalysator")).toBeInTheDocument();
  });

  it("filtert das Glossar über die Suche", () => {
    render(<PlanScreen onBack={() => {}} />);
    fireEvent.change(screen.getByTestId("glossary-search"), { target: { value: "kata" } });
    expect(screen.getByText("Katalysator")).toBeInTheDocument();
    expect(screen.queryByText("Ableitung")).not.toBeInTheDocument();
  });

  it("meldet den Zurück-Knopf", () => {
    const onBack = vi.fn();
    render(<PlanScreen onBack={onBack} />);
    fireEvent.click(screen.getByTitle("Zurück"));
    expect(onBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/planScreen.test.jsx`
Expected: FAIL — `Failed to resolve import "../src/components/PlanScreen.jsx"`

- [ ] **Step 3: Write minimal implementation**

`src/components/PlanScreen.jsx`:

```jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import useKnowledge from "../hooks/useKnowledge.js";
import { isoDate } from "../knowledge/studyPlan.js";
import { browserNoteRepository } from "../storage/noteRepository.js";

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

function dayLabel(iso) {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()}.${date.getMonth() + 1}.`;
}

export default function PlanScreen({ onBack }) {
  const notes = useMemo(() => browserNoteRepository.listNotes(), []);
  const knowledge = useKnowledge({ notes, subjects: [] });
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");

  const { plan, refreshPlan, isPlanning, terms } = knowledge;

  // Ein Plan von gestern ist wertlos - beim Öffnen wird er einmal erneuert.
  // Der Ref und nicht das Plandatum ist die Abbruchbedingung: schlägt das
  // Speichern fehl (Speicher voll oder gesperrt), bleibt generatedFor alt,
  // und eine datumsgebundene Bedingung würde den Aufruf endlos wiederholen.
  const planRequestedRef = useRef(false);
  useEffect(() => {
    if (planRequestedRef.current) return;
    if (plan?.generatedFor === isoDate(Date.now())) return;
    planRequestedRef.current = true;
    refreshPlan();
  }, [plan?.generatedFor, refreshPlan]);

  const subjects = useMemo(
    () => [...new Set(terms.map((term) => term.subject).filter(Boolean))].sort(),
    [terms],
  );

  const visibleTerms = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return terms.filter((term) => {
      if (subjectFilter && term.subject !== subjectFilter) return false;
      if (!needle) return true;
      return (
        term.term.toLowerCase().includes(needle) ||
        term.definition.toLowerCase().includes(needle)
      );
    });
  }, [terms, query, subjectFilter]);

  return (
    <div className="plan-screen">
      <div className="plan-head">
        <button className="settings-back-btn" onClick={onBack} title="Zurück">
          <ArrowLeft size={16} />
        </button>
        <h1 className="plan-title">Plan</h1>
        <button
          className="plan-refresh"
          onClick={() => refreshPlan()}
          disabled={isPlanning}
          title="Lernplan neu berechnen"
          data-testid="plan-refresh"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="plan-columns">
        <section className="plan-column">
          <h2 className="plan-section-title">Lernplan</h2>
          {isPlanning && <div className="plan-hint">Plan wird berechnet…</div>}
          {!plan?.days?.length && !isPlanning && (
            <div className="plan-hint">Noch kein Plan. Über den Knopf oben berechnen.</div>
          )}
          {(plan?.days || []).map((day) => (
            <div className="plan-day" key={day.date} data-testid={`plan-day-${day.date}`}>
              <div className="plan-day-head">
                <span className="plan-day-name">{dayLabel(day.date)}</span>
                <span className="plan-day-budget">{day.budgetMinutes} min</span>
              </div>
              {day.budgetMinutes === 0 ? (
                <div className="plan-block plan-block-free">Freier Tag — Lernzeit in der Schule</div>
              ) : (
                day.blocks.map((block, index) => (
                  <div className="plan-block" key={`${day.date}-${index}`}>
                    <span className="plan-block-task">{block.task}</span>
                    <span className="plan-block-meta">
                      {[block.subject, `${block.minutes} min`].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                ))
              )}
            </div>
          ))}
        </section>

        <section className="plan-column">
          <h2 className="plan-section-title">Glossar</h2>
          <input
            type="text"
            className="settings-text-input"
            placeholder="Begriff suchen…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-testid="glossary-search"
          />
          <div className="plan-subject-filters">
            <button
              className={`plan-chip ${subjectFilter === "" ? "active" : ""}`}
              onClick={() => setSubjectFilter("")}
            >
              Alle
            </button>
            {subjects.map((subject) => (
              <button
                key={subject}
                className={`plan-chip ${subjectFilter === subject ? "active" : ""}`}
                onClick={() => setSubjectFilter(subject)}
              >
                {subject}
              </button>
            ))}
          </div>
          {visibleTerms.length === 0 && <div className="plan-hint">Keine Begriffe gefunden.</div>}
          {visibleTerms.map((term) => (
            <div className="plan-term" key={term.id}>
              <div className="plan-term-head">
                <span className="plan-term-name">{term.term}</span>
                {term.subject && <span className="plan-term-subject">{term.subject}</span>}
              </div>
              {term.definition && <div className="plan-term-body">{term.definition}</div>}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
```

An `src/styles/main.css` anhängen:

```css
.plan-screen {
  position: absolute;
  inset: 0;
  overflow: auto;
  padding: 20px 24px 40px;
  color: #ffffff;
}
.plan-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 22px;
}
.plan-title {
  margin: 0;
  font: 800 34px/1 "Bricolage Grotesque", sans-serif;
  letter-spacing: -0.03em;
}
.plan-refresh {
  margin-left: auto;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.plan-refresh:disabled {
  opacity: 0.45;
  cursor: default;
}
.plan-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
}
@media (max-width: 900px) {
  .plan-columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
.plan-section-title {
  margin: 0 0 12px;
  font: 700 19px/1 "Bricolage Grotesque", sans-serif;
  letter-spacing: -0.02em;
}
.plan-hint {
  font: 500 12.5px Manrope, sans-serif;
  color: rgba(255, 255, 255, 0.6);
  padding: 10px 0;
}
.plan-day {
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  padding: 12px 14px;
  margin-bottom: 10px;
}
.plan-day-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
.plan-day-name {
  font: 700 13.5px Manrope, sans-serif;
}
.plan-day-budget {
  font: 600 9.5px ui-monospace, monospace;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.55);
}
.plan-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.plan-block-free {
  font: 500 12px Manrope, sans-serif;
  color: rgba(255, 255, 255, 0.5);
}
.plan-block-task {
  font: 500 12.5px/1.35 Manrope, sans-serif;
}
.plan-block-meta {
  font: 600 9.5px ui-monospace, monospace;
  letter-spacing: 0.09em;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
}
.plan-subject-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0 14px;
}
.plan-chip {
  border: none;
  border-radius: 999px;
  padding: 5px 11px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  font: 600 11px Manrope, sans-serif;
  cursor: pointer;
}
.plan-chip.active {
  background: rgba(255, 255, 255, 0.24);
  color: #ffffff;
}
.plan-term {
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  padding: 11px 13px;
  margin-bottom: 8px;
}
.plan-term-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: baseline;
}
.plan-term-name {
  font: 700 13px Manrope, sans-serif;
}
.plan-term-subject {
  font: 600 9.5px ui-monospace, monospace;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
}
.plan-term-body {
  margin-top: 5px;
  font: 500 12px/1.4 Manrope, sans-serif;
  color: rgba(255, 255, 255, 0.75);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/planScreen.test.jsx`
Expected: PASS, 5 Tests

- [ ] **Step 5: Bildschirm in App und Bibliothek einhängen**

In `src/App.jsx` den Import ergänzen:

```jsx
import PlanScreen from "./components/PlanScreen";
```

In `App()` vor dem `library`-Zweig einsetzen:

```jsx
  if (screen === "plan") {
    return <PlanScreen onBack={() => setScreen("library")} />;
  }
```

und den `library`-Zweig um die Prop erweitern:

```jsx
      <Library
        onOpenNote={openNote}
        onOpenSettings={() => setScreen("settings")}
        onOpenPlan={() => setScreen("plan")}
      />
```

In `src/components/Library.jsx` die Signatur erweitern:

```jsx
export default function Library({
  onOpenNote,
  onOpenSettings,
  onOpenPlan,
  documentLibraryOptions,
}) {
```

`CalendarDays` in den `lucide-react`-Import aufnehmen und in der linken Symbolleiste direkt vor dem Einstellungen-Knopf (Zeile 3154) einfügen:

```jsx
        <button
          onClick={onOpenPlan}
          title="Lernplan & Glossar"
          data-testid="open-plan-btn"
          style={{
            width: 44,
            height: 44,
            borderRadius: 15,
            background: "transparent",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFFFFF",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          <CalendarDays size={19} />
        </button>
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/PlanScreen.jsx src/components/Library.jsx src/App.jsx src/styles/main.css tests/planScreen.test.jsx
git commit -m "feat(plan): add study plan and glossary screen"
```

---

## Task 12: Einstellungen

Schalter, Knopf und Statuszeile unter `KI & Netzwerk`.

**Files:**
- Modify: `src/components/Settings.jsx:747-765` (Abschnittsbeginn `network`), Importblock ab Zeile 1
- Test: `tests/settingsKnowledge.test.jsx`

**Interfaces:**
- Consumes: `useKnowledge` (Task 9).
- Produces: keine neuen Exporte.

- [ ] **Step 1: Write the failing test**

`tests/settingsKnowledge.test.jsx`:

```jsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../src/agent/agentClient.js", () => ({
  requestCompletion: vi.fn(async () => ({ content: '{"homework":[],"exams":[],"terms":[]}' })),
}));

import Settings from "../src/components/Settings.jsx";
import { KNOWLEDGE_STORAGE_KEY } from "../src/knowledge/knowledgeRepository.js";

beforeEach(() => {
  globalThis.localStorage.clear();
});

function openNetwork() {
  render(<Settings onBack={() => {}} />);
  fireEvent.click(screen.getByText("KI & Netzwerk"));
}

describe("Settings — Auswertung", () => {
  it("zeigt den Schalter für die automatische Auswertung", () => {
    openNetwork();
    expect(screen.getByTestId("auto-scan-switch")).toBeInTheDocument();
  });

  it("schaltet die Automatik um und speichert das", () => {
    openNetwork();
    fireEvent.click(screen.getByTestId("auto-scan-switch"));
    const stored = JSON.parse(globalThis.localStorage.getItem(KNOWLEDGE_STORAGE_KEY));
    expect(stored.settings.autoScan).toBe(false);
  });

  it("zeigt eine gespeicherte Fehlermeldung an", () => {
    globalThis.localStorage.setItem(
      KNOWLEDGE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        scanState: { lastRunAt: Date.now(), lastError: "Server nicht erreichbar.", notes: {} },
        settings: { autoScan: false },
      }),
    );
    openNetwork();
    expect(screen.getByText(/Server nicht erreichbar\./)).toBeInTheDocument();
  });

  it("meldet, wenn noch nie ausgewertet wurde", () => {
    openNetwork();
    expect(screen.getByText("Noch nicht ausgewertet.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/settingsKnowledge.test.jsx`
Expected: FAIL — `Unable to find an element by: [data-testid="auto-scan-switch"]`

- [ ] **Step 3: Write minimal implementation**

In `src/components/Settings.jsx` die erste Zeile ersetzen — `useMemo` fehlt dort bisher:

```jsx
import React, { useState, useRef, useEffect, useMemo } from "react";
```

und die Importe ergänzen:

```jsx
import useKnowledge from "../hooks/useKnowledge.js";
import { browserNoteRepository } from "../storage/noteRepository.js";
```

Im Rumpf von `Settings`, bei den übrigen Hooks und vor jedem `return`:

```jsx
  const knowledgeNotes = useMemo(() => browserNoteRepository.listNotes(), []);
  const knowledge = useKnowledge({ notes: knowledgeNotes, subjects: [] });
```

Im `network`-Zweig direkt nach der bestehenden `settings-group` mit „Notiz-Agent" (nach Zeile 763) einsetzen:

```jsx
            <div className="settings-section-caption" style={{ marginTop: 20 }}>
              AUSWERTUNG
            </div>
            <p className="settings-detail-copy" style={{ marginBottom: 12 }}>
              Fertige Notizen werden zweimal täglich gelesen. Gefundene Hausaufgaben und
              Klausuren landen im Kalender, Fachbegriffe im Glossar.
            </p>
            <div className="settings-group">
              <div className="settings-row">
                <div className="settings-row-main">
                  <div className="settings-row-title">Notizen automatisch auswerten</div>
                  <div className="settings-row-copy">
                    Nur Notizen, die seit zwei Stunden nicht mehr bearbeitet wurden
                  </div>
                </div>
                <button
                  type="button"
                  className={`settings-switch ${knowledge.autoScan ? "on" : ""}`}
                  data-testid="auto-scan-switch"
                  aria-pressed={knowledge.autoScan}
                  onClick={() => knowledge.setAutoScan(!knowledge.autoScan)}
                />
              </div>
              <div className="settings-control-row">
                <div>
                  <div className="settings-control-title">Jetzt auswerten</div>
                  <div className="settings-control-copy">
                    {knowledge.scanState.lastRunAt
                      ? `Zuletzt: ${new Date(knowledge.scanState.lastRunAt).toLocaleString("de-DE")}`
                      : "Noch nicht ausgewertet."}
                  </div>
                </div>
                <button
                  type="button"
                  className="settings-action-btn"
                  data-testid="scan-now-btn"
                  disabled={knowledge.isScanning}
                  onClick={() => knowledge.scanNow()}
                >
                  {knowledge.isScanning ? "Läuft…" : "Starten"}
                </button>
              </div>
              {knowledge.scanState.lastError && (
                <div
                  className="settings-control-row"
                  style={{ color: "rgba(255,69,58,.85)", font: "500 12px Manrope,sans-serif" }}
                >
                  {knowledge.scanState.lastError}
                </div>
              )}
            </div>
```

`.settings-action-btn` gibt es bereits (`src/styles/main.css:2047`, blauer Knopf) — nicht neu definieren, nur die fehlende Zustandsregel anhängen:

```css
.settings-action-btn:disabled {
  opacity: 0.45;
  transform: none;
  cursor: default;
}
```

`.settings-switch` (`src/styles/main.css:2064`) wird bisher nur auf `<div>` angewandt und setzt deshalb kein `border`. Als `<button>` bekäme das Element den Standardrahmen des Browsers — der globale Reset in Zeile 8 setzt nur `margin` und `padding` zurück. In der bestehenden Regel ergänzen:

```css
  border: none;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/settingsKnowledge.test.jsx`
Expected: PASS, 4 Tests

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — alle Tests, keine echte Netzanfrage.

- [ ] **Step 6: Commit**

```bash
git add src/components/Settings.jsx src/styles/main.css tests/settingsKnowledge.test.jsx
git commit -m "feat(settings): control automatic note evaluation"
```

---

## Abschluss: Prüfung am Gerät

Nicht automatisierbar, gehört aber zur Fertigstellung.

- [ ] **Step 1: Space erreichbar machen**

Der Space antwortet zum Zeitpunkt der Planung mit `503 – Your space is in error`. Vor jedem echten Test neu starten und prüfen:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://luca448-app-backend.hf.space/api/notes/chat/completions -X POST -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"OK"}]}'
```

Erwartet: `200`. Bei `503` den Space im Hugging-Face-Web neu starten.

- [ ] **Step 2: Echten Scan auslösen**

Eine Notiz mit handschriftlicher Hausaufgabe und einem Datum anlegen, `updatedAt` mindestens zwei Stunden zurückliegen lassen (oder in den Einstellungen „Jetzt auswerten" drücken, das übergeht die Ruhezeit). Prüfen, dass in den Netzwerkanfragen des Geräts eine Anfrage mit `image_url`-Teilen rausgeht und dass ein Termin in „Anstehend" erscheint.

- [ ] **Step 3: Ergebnis festhalten**

`docs/superpowers/verification/2026-09-04-knowledge-management-results.md` anlegen: Welche Notiz, was das Modell gefunden hat, was es übersehen oder erfunden hat. Diese Datei ist die Grundlage dafür, den Prompt in `SCAN_SYSTEM_PROMPT` nachzuschärfen.

```bash
git add docs/superpowers/verification/2026-09-04-knowledge-management-results.md
git commit -m "docs: record knowledge scan verification on device"
```
