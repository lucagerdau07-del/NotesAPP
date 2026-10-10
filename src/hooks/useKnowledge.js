import { useCallback, useEffect, useRef, useState } from "react";
import { requestCompletion } from "../agent/agentClient.js";
import { runScan, scanImagesOf } from "../knowledge/documentScan.js";
import { browserCommentRepository } from "../knowledge/commentRepository.js";
import { browserKnowledgeRepository, KNOWLEDGE_CHANGED } from "../knowledge/knowledgeRepository.js";
import { buildExamPrep, examMemory, loadExamMaterial } from "../knowledge/examPrep.js";
import { estimateExamNeeds, needsEstimate } from "../knowledge/examNeed.js";
import { browserMemoryRepository } from "../knowledge/memoryRepository.js";
import { runExamDashboard } from "../agent/tools.js";
import { activeNeed, buildPlan, isoDate } from "../knowledge/studyPlan.js";

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
  const [planningExamId, setPlanningExamId] = useState(null);
  const [dashboardExamId, setDashboardExamId] = useState(null);
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
    let current = repository.read();
    try {
      // Jede Klausur ohne gültige Schätzung bekommt ihren Bedarf und Inhalt
      // geschätzt, bevor der Plan ihre Lernblöcke vergibt. Scheitert das, plant
      // der Standardbedarf, und der nächste Plan versucht es wieder.
      const pending = current.events.filter((event) => needsEstimate(event, today));
      if (pending.length > 0) {
        try {
          const materials = Object.fromEntries(
            await Promise.all(pending.map(async (event) => [event.id, await loadExamMaterial({ event, topic: event.topic })])),
          );
          const estimates = await estimateExamNeeds({
            exams: pending,
            terms: current.terms,
            memory: examMemory(browserMemoryRepository.list()),
            materials,
            today,
            complete: requestCompletion,
          });
          for (const { id, need } of estimates) repository.setExamNeed(id, need);
          current = repository.read();
        } catch {
          // Ohne Schätzung gilt der Standardbedarf.
        }
      }
      const plan = await buildPlan({
        events: current.events,
        terms: current.terms,
        subjects: subjectsRef.current,
        today,
        complete: requestCompletion,
        previous: current.plan,
      });
      repository.savePlan(plan);
    } finally {
      setPlanning(false);
      setState(repository.read());
    }
  }, [repository, pullIserv]);

  // Der Lernplan einer Klausur aus ihrem Thema, den eigenen Notizen und dem, was
  // sich der Agent über den Nutzer gemerkt hat. Läuft nur auf Knopfdruck. Gibt
  // {ok} oder {error} zurück; das Thema bleibt auch bei einem Fehler gespeichert.
  const planExam = useCallback(
    async (id, topic) => {
      const { events: all, terms: knownTerms } = repository.read();
      const event = all.find((entry) => entry.id === id);
      if (!event || event.kind !== "exam") return { error: "Klausur nicht gefunden." };
      setPlanningExamId(id);
      try {
        const prep = await buildExamPrep({
          event,
          events: all,
          terms: knownTerms,
          topic,
          material: await loadExamMaterial({ event, topic }),
          memory: examMemory(browserMemoryRepository.list()),
          need: activeNeed(event),
          today: isoDate(Date.now()),
          complete: requestCompletion,
        });
        repository.setExamPrep(id, { topic: prep.topic, prep });
        return { ok: true };
      } catch (error) {
        repository.setExamPrep(id, { topic });
        return { error: error?.message || "Der Lernplan konnte nicht erstellt werden." };
      } finally {
        setPlanningExamId(null);
        setState(repository.read());
      }
    },
    [repository],
  );

  // Das Dashboard einer Klausur vom Subagenten bauen oder ergänzen lassen. Läuft
  // nur auf Knopfdruck. Gibt {ok} oder {error} zurück, ein vorhandenes
  // Dashboard bleibt bei einem Fehler unberührt.
  const buildDashboard = useCallback(
    async (id, wish = "", mode = "add") => {
      setDashboardExamId(id);
      try {
        await runExamDashboard({ id, wish, mode, repository });
        return { ok: true };
      } catch (error) {
        return { error: error?.message || "Das Dashboard konnte nicht erstellt werden." };
      } finally {
        setDashboardExamId(null);
        setState(repository.read());
      }
    },
    [repository],
  );

  // Bedienung des Dashboards: change bekommt das alte study und liefert das neue.
  const updateStudy = useCallback(
    (id, change) => {
      repository.updateStudy(id, change);
      setState(repository.read());
    },
    [repository],
  );

  const setEventDone = useCallback(
    (id, done) => {
      repository.setEventDone(id, done);
      setState(repository.read());
    },
    [repository],
  );

  // Einen Lernblock abhaken (clear = wieder öffnen): Die Minuten verteilen sich
  // auf die Aufgaben des Blocks, der Plan rechnet danach mit dem Rest.
  const setWorkDone = useCallback(
    (eventIds, date, minutes, clear = false) => {
      const share = minutes / Math.max(1, eventIds.length);
      for (const id of eventIds) repository.setEventWork(id, date, clear ? 0 : Math.max(1, share));
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

  // Der Agent trägt Aufgaben am Hook vorbei ein (add_task, set_task_done).
  useEffect(() => {
    const reread = () => setState(repository.read());
    globalThis.addEventListener?.(KNOWLEDGE_CHANGED, reread);
    return () => globalThis.removeEventListener?.(KNOWLEDGE_CHANGED, reread);
  }, [repository]);

  // Nur einmal je Einhängen.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // Neue oder geänderte Aufgaben machen den Plan über planInputsKey veraltet.
    if (syncIservRef.current) void pullIserv();
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
    planningExamId,
    dashboardExamId,
    iservState,
    scanNow,
    refreshPlan,
    planExam,
    buildDashboard,
    updateStudy,
    setEventDone,
    setWorkDone,
    addEvent,
    removeEvent,
    setAutoScan,
  };
}
