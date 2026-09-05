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
      // Schreibfehler bleiben absichtlich still: die App soll weiterlaufen.
    }
  };

  const update = (change) => {
    const state = read();
    const next = change(state);
    write(next);
    return next;
  };

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
