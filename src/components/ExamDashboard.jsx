import React, { useMemo, useState } from "react";
import { BookOpen, Check, ChevronDown, Layers, RotateCw, Sparkles, X } from "lucide-react";
import {
  LEVEL_LABELS,
  answerQuestion,
  cycleLevel,
  dueCards,
  hasStudy,
  rateCard,
  readiness,
  setLevel,
  studyCounts,
} from "../knowledge/examStudy.js";

// Das Dashboard einer Klausur (event.study) im Kalender: Bereitschaft, Themen,
// Karten, Quiz, Formelblatt. compact zeigt an den Lerntagen nur "Heute üben".
// Der Zustand liegt in event.study, onChange(id, fn) schreibt ihn.
const WISH_MAX = 200;

function Readiness({ study, due }) {
  const percent = readiness(study);
  return (
    <div className="cal-dash-ready">
      <div
        className="cal-dash-bar"
        role="progressbar"
        aria-label="Bereitschaft"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? 0}
      >
        <span style={{ width: `${percent ?? 0}%` }} />
      </div>
      <p className="cal-hint" data-testid="dash-ready">
        {percent === null ? "Noch nichts bewertet" : `${percent} % bereit`}
        {due > 0 ? ` · ${due} ${due === 1 ? "Karte" : "Karten"} fällig` : ""}
      </p>
    </div>
  );
}

function Topics({ study, onLevel }) {
  if (study.topics.length === 0) return null;
  return (
    <ul className="cal-dash-topics" aria-label="Themen">
      {study.topics.map((topic) => (
        <li key={topic.id}>
          <button
            type="button"
            className={`cal-dash-topic level-${topic.level ?? "none"}`}
            onClick={() => onLevel(topic.id, cycleLevel(topic.level))}
            aria-label={`${topic.title}: ${topic.level == null ? "nicht eingestuft" : LEVEL_LABELS[topic.level]}`}
          >
            <span className="cal-dash-topic-title">{topic.title}</span>
            <span className="cal-dash-topic-level">{topic.level == null ? "?" : LEVEL_LABELS[topic.level]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CardDrill({ due, onRate }) {
  const [flipped, setFlipped] = useState(false);
  const card = due[0];
  if (!card) return <p className="cal-hint">Heute nichts fällig.</p>;
  const rate = (known) => {
    setFlipped(false);
    onRate(card.id, known);
  };
  return (
    <div className="cal-dash-card" data-testid="dash-card">
      <button
        type="button"
        className="cal-dash-face"
        onClick={() => setFlipped((value) => !value)}
        aria-label={flipped ? "Vorderseite zeigen" : "Rückseite zeigen"}
      >
        <span className="cal-dash-face-label">{flipped ? "Antwort" : "Frage"}</span>
        <span className="cal-dash-face-text">{flipped ? card.back : card.front}</span>
        {!flipped && <RotateCw size={14} aria-hidden="true" className="cal-dash-flip" />}
      </button>
      {flipped && (
        <div className="cal-actions">
          <button type="button" className="cal-button" onClick={() => rate(false)}>
            <X size={15} aria-hidden="true" /> Nicht gewusst
          </button>
          <button type="button" className="cal-button is-primary" onClick={() => rate(true)}>
            <Check size={15} aria-hidden="true" /> Gewusst
          </button>
        </div>
      )}
    </div>
  );
}

function QuizDrill({ study, onAnswer }) {
  const [seen, setSeen] = useState([]);
  const [picked, setPicked] = useState(null);
  const order = useMemo(
    () => [...study.quiz].sort((a, b) => a.tries - b.tries),
    // Neu sortieren nur, wenn sich die Fragen ändern, nicht bei jeder Antwort.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [study.quiz.length],
  );
  if (order.length === 0) return null;
  const entry = order.find((item) => !seen.includes(item.id)) || order[0];
  const live = study.quiz.find((item) => item.id === entry.id) || entry;

  const choose = (index) => {
    if (picked) return;
    setPicked({ id: entry.id, choice: index });
    onAnswer(entry.id, index);
  };
  const next = () => {
    setPicked(null);
    setSeen((current) => (current.length + 1 >= order.length ? [] : [...current, entry.id]));
  };

  return (
    <div className="cal-dash-quiz" data-testid="dash-quiz">
      <p className="cal-dash-q">{live.q}</p>
      <ul className="cal-dash-opts">
        {live.opts.map((option, index) => {
          const state = !picked
            ? ""
            : index === live.right
              ? " is-right"
              : index === picked.choice
                ? " is-wrong"
                : "";
          return (
            <li key={index}>
              <button type="button" className={`cal-dash-opt${state}`} onClick={() => choose(index)} disabled={Boolean(picked)}>
                {option}
              </button>
            </li>
          );
        })}
      </ul>
      {picked && (
        <>
          <p className="cal-hint" role="status">
            {picked.choice === live.right ? "Richtig." : "Nicht ganz."}
            {live.why ? ` ${live.why}` : ""}
          </p>
          <div className="cal-actions">
            <button type="button" className="cal-button is-primary" onClick={next}>
              Weiter
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Sheet({ sheet }) {
  if (sheet.length === 0) return null;
  return (
    <ul className="cal-group cal-dash-sheet" aria-label="Formelblatt">
      {sheet.map((entry) => (
        <li key={entry.title}>
          <span className="cal-dash-sheet-title">{entry.title}</span>
          <span>{entry.text}</span>
        </li>
      ))}
    </ul>
  );
}

function BuildControls({ study, building, onBuild }) {
  const [wish, setWish] = useState("");
  const [error, setError] = useState("");
  const run = async () => {
    setError("");
    const result = await onBuild(wish, hasStudy(study) ? "add" : "replace");
    if (result?.error) setError(result.error);
    else setWish("");
  };
  return (
    <>
      <label className="cal-group cal-field">
        <span className="cal-sr">Wunsch für das Dashboard</span>
        <input
          type="text"
          value={wish}
          maxLength={WISH_MAX}
          disabled={building}
          onChange={(change) => setWish(change.target.value)}
          placeholder="Wunsch, optional: z. B. mehr Karten zur Kettenregel"
        />
      </label>
      <div className="cal-actions">
        <button type="button" className="cal-button is-primary" onClick={run} disabled={building}>
          <Sparkles size={15} aria-hidden="true" />
          {building ? "Dashboard wird erstellt …" : hasStudy(study) ? "Dashboard ergänzen" : "Dashboard erstellen"}
        </button>
      </div>
      {error && (
        <p className="cal-hint" role="status">
          {error}
        </p>
      )}
    </>
  );
}

export default function ExamDashboard({ event, today, building = false, onBuild, onChange, compact = false }) {
  const study = hasStudy(event.study) ? event.study : null;
  const [sheetOpen, setSheetOpen] = useState(false);
  const due = useMemo(() => dueCards(study, today), [study, today]);

  const change = (fn) => onChange(event.id, (current) => (current ? fn(current) : current));
  const counts = studyCounts(study);

  // Lerntag: nur üben, wenn es ein Dashboard gibt.
  if (compact) {
    if (!study || (due.length === 0 && study.quiz.length === 0)) return null;
    return (
      <section className="cal-detail-section" aria-label="Heute üben">
        <h3 className="cal-detail-label">Heute üben</h3>
        <div className="cal-group cal-dash">
          <CardDrill due={due} onRate={(id, known) => change((s) => rateCard(s, id, known))} />
          <QuizDrill study={study} onAnswer={(id, choice) => change((s) => answerQuestion(s, id, choice).study)} />
        </div>
      </section>
    );
  }

  return (
    <section className="cal-detail-section" aria-label="Dashboard">
      <h3 className="cal-detail-label">Dashboard</h3>
      {study ? (
        <div className="cal-group cal-dash">
          <Readiness study={study} due={due.length} />
          <Topics study={study} onLevel={(id, level) => change((s) => setLevel(s, id, level))} />
          {study.cards.length > 0 && (
            <>
              <h4 className="cal-dash-h">
                <Layers size={14} aria-hidden="true" /> Karten ({counts.cards})
              </h4>
              <CardDrill due={due} onRate={(id, known) => change((s) => rateCard(s, id, known))} />
            </>
          )}
          {study.quiz.length > 0 && (
            <>
              <h4 className="cal-dash-h">
                <BookOpen size={14} aria-hidden="true" /> Quiz ({counts.quiz})
              </h4>
              <QuizDrill study={study} onAnswer={(id, choice) => change((s) => answerQuestion(s, id, choice).study)} />
            </>
          )}
          {study.sheet.length > 0 && (
            <>
              <button
                type="button"
                className="cal-dash-h cal-dash-toggle"
                aria-expanded={sheetOpen}
                onClick={() => setSheetOpen((open) => !open)}
              >
                <ChevronDown size={14} aria-hidden="true" className={sheetOpen ? "is-open" : ""} /> Formelblatt ({counts.sheet})
              </button>
              {sheetOpen && <Sheet sheet={study.sheet} />}
            </>
          )}
        </div>
      ) : (
        <p className="cal-hint">Noch kein Dashboard. Der Assistent baut es aus deinen Notizen und Quellen.</p>
      )}
      <BuildControls
        study={study}
        building={building}
        onBuild={(wish, mode) => onBuild(event.id, wish, mode)}
      />
    </section>
  );
}
