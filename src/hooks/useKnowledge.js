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
    .filter((event) => !event.done && event.due >= today && event.due <= limitIso)
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
