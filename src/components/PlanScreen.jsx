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
    void refreshPlan();
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
    <main className="plan-screen" data-testid="plan-screen">
      <header className="plan-head">
        <button
          type="button"
          className="settings-back-btn"
          onClick={onBack}
          title="Zurück"
          aria-label="Zurück zur Bibliothek"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <h1 className="plan-title">Plan</h1>
        <button
          type="button"
          className="plan-refresh"
          onClick={() => void refreshPlan()}
          disabled={isPlanning}
          title="Lernplan neu berechnen"
          aria-label="Lernplan neu berechnen"
          data-testid="plan-refresh"
        >
          <RefreshCw size={15} aria-hidden="true" />
        </button>
      </header>

      <div className="plan-columns">
        <section className="plan-column" aria-labelledby="plan-learning-title">
          <h2 className="plan-section-title" id="plan-learning-title">Lernplan</h2>
          {isPlanning && <div className="plan-hint" role="status">Plan wird berechnet…</div>}
          {!plan?.days?.length && !isPlanning && (
            <div className="plan-hint">Noch kein Plan. Über den Knopf oben berechnen.</div>
          )}
          {(plan?.days || []).map((day) => (
            <article className="plan-day" key={day.date} data-testid={`plan-day-${day.date}`}>
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
            </article>
          ))}
        </section>

        <section className="plan-column" aria-labelledby="plan-glossary-title">
          <h2 className="plan-section-title" id="plan-glossary-title">Glossar</h2>
          <input
            type="search"
            className="settings-text-input"
            placeholder="Begriff suchen…"
            aria-label="Glossar durchsuchen"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-testid="glossary-search"
          />
          <div className="plan-subject-filters" aria-label="Glossar nach Fach filtern">
            <button
              type="button"
              className={`plan-chip ${subjectFilter === "" ? "active" : ""}`}
              aria-pressed={subjectFilter === ""}
              onClick={() => setSubjectFilter("")}
            >
              Alle
            </button>
            {subjects.map((subject) => (
              <button
                type="button"
                key={subject}
                className={`plan-chip ${subjectFilter === subject ? "active" : ""}`}
                aria-pressed={subjectFilter === subject}
                onClick={() => setSubjectFilter(subject)}
              >
                {subject}
              </button>
            ))}
          </div>
          {visibleTerms.length === 0 && <div className="plan-hint">Keine Begriffe gefunden.</div>}
          {visibleTerms.map((term) => (
            <article className="plan-term" key={term.id}>
              <div className="plan-term-head">
                <span className="plan-term-name">{term.term}</span>
                {term.subject && <span className="plan-term-subject">{term.subject}</span>}
              </div>
              {term.definition && <div className="plan-term-body">{term.definition}</div>}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
