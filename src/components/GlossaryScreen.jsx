import React, { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import useKnowledge from "../hooks/useKnowledge.js";

export default function GlossaryScreen({ onBack }) {
  const { terms } = useKnowledge();
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");

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
    <main className="plan-screen" data-testid="glossary-screen">
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
        <h1 className="plan-title">Glossar</h1>
      </header>

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
      <div className="glossary-grid">
        {visibleTerms.map((term) => (
          <article className="plan-term" key={term.id}>
            <div className="plan-term-head">
              <span className="plan-term-name">{term.term}</span>
              {term.subject && <span className="plan-term-subject">{term.subject}</span>}
            </div>
            {term.definition && <div className="plan-term-body">{term.definition}</div>}
          </article>
        ))}
      </div>
    </main>
  );
}
