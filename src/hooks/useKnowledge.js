import { useCallback, useEffect, useRef, useState } from "react";
import { requestCompletion } from "../agent/agentClient.js";
import { runScan, scanImagesOf } from "../knowledge/documentScan.js";
import { browserCommentRepository } from "../knowledge/commentRepository.js";
import { browserKnowledgeRepository } from "../knowledge/knowledgeRepository.js";
import { buildPlan, isoDate } from "../knowledge/studyPlan.js";

const UPCOMING_DAYS = 14;

function upcoming(events, today) {
  const limit = new Date(`${today}T00:00:00`);
  limit.setDate(limit.getDate() + UPCOMING_DAYS);
  const limitIso = isoDate(limit);
  return events
    .filter((event) => !event.done && event.due >= today && event.due <= limitIso)
    .sort((a, b) => a.due.localeCompare(b.due));
}

/**
 * Bindet die reinen knowledge-Module an React. Ausgewertet werden Kommentare,
 * einmal beim Einhängen der Bibliothek - ein Hintergrunddienst ist
 * auf dem Tablet nicht verfügbar, und ein Kommentar gilt nach der Auswertung
 * als erledigt, mehrmaliges Öffnen wertet also nichts doppelt aus.
 */
export default function useKnowledge({
  notes = [],
  subjects = [],
  repository = browserKnowledgeRepository,
  commentRepository = browserCommentRepository,
  syncIserv = null,
} = {}) {
  const [state, setState] = useState(() => repository.read());
  const [isScanning, setScanning] = useState(false);
  const [isPlanning, setPlanning] = useState(false);
  const [iservState, setIservState] = useState("off");
  const busyRef = useRef(false);
  const notesRef = useRef(notes);
  const subjectsRef = useRef(subjects);
  const syncIservRef = useRef(syncIserv);
  notesRef.current = notes;
  subjectsRef.current = subjects;
  syncIservRef.current = syncIserv;

  const scanNow = useCallback(
    async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      setScanning(true);
      const now = Date.now();
      try {
        await runScan({
          notes: notesRef.current,
          repository,
          commentRepository,
          renderPages: scanImagesOf,
          complete: requestCompletion,
          now,
          today: isoDate(now),
        });
      } finally {
        busyRef.current = false;
        setScanning(false);
        setState(repository.read());
      }
    },
    [repository, commentRepository],
  );

  // Holt die IServ-Termine. Wirft nie: ein Netzwerkfehler darf Scan und Plan nicht aufhalten.
  // ponytail: kein Timeout, ergänzen, falls der Pull auf dem Tablet je hängt.
  const pullIserv = useCallback(async () => {
    const sync = syncIservRef.current;
    if (!sync) return 0;
    try {
      const added = await sync({ repository });
      setIservState(added === null ? "off" : "ok");
      return added || 0;
    } catch {
      setIservState("error");
      return 0;
    } finally {
      setState(repository.read());
    }
  }, [repository]);

  const refreshPlan = useCallback(async () => {
    setPlanning(true);
    // Nur awaiten, wenn es etwas zu holen gibt: ohne syncIserv läuft buildPlan synchron an.
    if (syncIservRef.current) await pullIserv();
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
  }, [repository, pullIserv]);

  const setEventDone = useCallback(
    (id, done) => {
      repository.setEventDone(id, done);
      setState(repository.read());
    },
    [repository],
  );

  const addEvent = useCallback(
    (input) => {
      const event = repository.addEvent(input);
      setState(repository.read());
      return event;
    },
    [repository],
  );

  const removeEvent = useCallback(
    (id) => {
      repository.removeEvent(id);
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

  // Nur einmal je Einhängen.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (syncIservRef.current) {
      // Ein Plan von vor dem Pull kennt die neuen Aufgaben nicht. Er ist abgeleitet
      // und wird verworfen, der Plan-Bildschirm baut ihn beim Öffnen neu.
      void pullIserv().then((added) => {
        if (added > 0) {
          repository.savePlan(null);
          setState(repository.read());
        }
      });
    }
    if (!repository.read().settings.autoScan) return;
    scanNow();
  }, [repository, scanNow, pullIserv]);

  return {
    events: state.events,
    openEvents: upcoming(state.events, isoDate(Date.now())),
    terms: state.terms,
    plan: state.plan,
    scanState: state.scanState,
    autoScan: state.settings.autoScan,
    isScanning,
    isPlanning,
    iservState,
    scanNow,
    refreshPlan,
    setEventDone,
    addEvent,
    removeEvent,
    setAutoScan,
  };
}
