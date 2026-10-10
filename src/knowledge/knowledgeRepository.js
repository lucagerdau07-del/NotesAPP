export const KNOWLEDGE_STORAGE_KEY = "notes.knowledge.v1";
// Fenster-Event, wenn jemand außerhalb von useKnowledge schreibt (der Agent
// über add_task / set_task_done), damit die Oberfläche neu liest.
export const KNOWLEDGE_CHANGED = "notes:knowledge-changed";

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

function normalizeKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .trim();
}

// IServ-Termine sind über die Zahl ihrer Aufgaben-URL eindeutig (…/exercise/show/<id>): ändert sich Titel,
// Frist oder die Schreibweise der Domain, wird derselbe Termin aktualisiert statt ein zweiter angelegt.
const iservTaskId = (value) => /\/exercise\/show\/(\d+)/.exec(String(value))?.[1] ?? String(value);

const eventKey = (event) =>
  event.iservId
    ? `iserv|${iservTaskId(event.iservId)}`
    : `${event.kind}|${normalizeKey(event.subject)}|${event.due}|${normalizeKey(event.title)}`;

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
      // Schreibfehler bleiben absichtlich still: die App soll weiterlaufen.
    }
  };

  const update = (change) => {
    const state = read();
    const next = change(state);
    write(next);
    return next;
  };

  const mergeList = (existing, incoming, keyOf, build, { skip = () => false, onKnown = () => null } = {}) => {
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
          // Was der Nutzer zur Klausur angegeben hat, überlebt jeden IServ-Abgleich.
          ...(previous.topic ? { topic: previous.topic } : {}),
          ...(previous.prep ? { prep: previous.prep } : {}),
          ...(previous.need ? { need: previous.need } : {}),
          ...(previous.study ? { study: previous.study } : {}),
          ...onKnown(candidate, previous),
        });
      } else if (!skip(candidate)) {
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
          ...(raw.time ? { time: raw.time } : {}),
          sourceNoteId,
          ...(raw.iservId
            ? {
                iservId: raw.iservId,
                url: raw.url,
                description: raw.description,
                attachments: raw.attachments,
                iservClosed: raw.iservClosed === true,
              }
            : {}),
          done: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        }), {
          // Was IServ schon als erledigt oder abgelaufen führt, kommt nicht neu in den Kalender.
          skip: (event) => event.iservClosed === true,
          // Wechselt eine bekannte Aufgabe auf geschlossen, ist sie abgehakt. Danach gilt wieder die App.
          onKnown: (event, previous) => (event.iservClosed && !previous.iservClosed ? { done: true } : null),
        });
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

    // Selbst angelegte Einträge aus dem Kalender. Kein Merge: zwei gleichnamige
    // Termine am selben Tag sind hier gewollt, nicht doppelt gefunden.
    addEvent({ kind = "appointment", title, subject = "", due, time = "", description = "" }) {
      const timestamp = now();
      const event = {
        id: nextId("event"),
        kind,
        title: String(title).trim(),
        subject: String(subject).trim(),
        due,
        ...(time ? { time } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        sourceNoteId: "manual",
        done: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      update((state) => ({ ...state, events: [...state.events, event] }));
      return event;
    },

    removeEvent(id) {
      update((state) => ({ ...state, events: state.events.filter((event) => event.id !== id) }));
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

    // Thema der Klausur und der dazu erstellte Lernplan (examPrep.js). Ohne prep
    // bleibt ein vorhandener Plan stehen, nur das Thema wird gemerkt.
    setExamPrep(id, { topic, prep }) {
      const timestamp = now();
      update((state) => ({
        ...state,
        events: state.events.map((event) =>
          event.id === id
            ? {
                ...event,
                topic: String(topic ?? "").trim(),
                ...(prep ? { prep } : {}),
                updatedAt: timestamp,
              }
            : event,
        ),
      }));
    },

    // Geschätzter Vorbereitungsbedarf einer Klausur (examNeed.js).
    setExamNeed(id, need) {
      update((state) => ({
        ...state,
        events: state.events.map((event) => (event.id === id ? { ...event, need } : event)),
      }));
    },

    // Das Klausur-Dashboard (examStudy.js). updateStudy bekommt das vorhandene
    // Dashboard (oder null) und liefert das neue; null lässt es unverändert.
    setExamStudy(id, study) {
      update((state) => ({
        ...state,
        events: state.events.map((event) => (event.id === id ? { ...event, study } : event)),
      }));
    },

    updateStudy(id, change) {
      update((state) => ({
        ...state,
        events: state.events.map((event) => {
          if (event.id !== id) return event;
          const next = change(event.study || null);
          return next ? { ...event, study: next } : event;
        }),
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
