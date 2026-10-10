import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import {
  LayoutGrid,
  Rows3,
  ArrowUpDown,
  Search,
  PenLine,
  Clock,
  Star,
  Tag,
  Sparkles,
  Globe,
  ScanText,
  Check,
  Settings,
  Download,
  ZoomIn,
  Code2,
  Quote,
  X,
  ArrowLeft,
  BookOpen,
  Layers,
  Sparkle,
  Plus,
  Mic,
  Square,
  SlidersHorizontal,
  Sparkles as SparklesIcon,
  FileUp,
  Trash2,
  CalendarDays,
  Pencil,
  Image as ImageIcon,
  FileText,
  AlertTriangle,
} from "lucide-react";
import Markdown from "./Markdown";
import IservBrowser from "./IservBrowser";
import { iservAvailable, pickLocalFiles } from "../documents/iservFiles";

const ISERV_BUTTON_SIZE = 52;
import useAgent from "../hooks/useAgent";
import { loadChatModel, saveChatModel } from "../agent/agentSettings";
import {
  ModelSelector,
  StepList,
  CopyButton,
  HistoryMenu,
  WritingPen,
  WritingGlobe,
  formatElapsed,
  formatTokens,
  useCountUp,
} from "./AiChatPanel";
import matheCard from "../assets/subjects/mathe-card.jpg";
import chemieCard from "../assets/subjects/chemie-card.jpg";
import kunstCard from "../assets/subjects/kunst-card.jpg";
import pgwCard from "../assets/subjects/pgw-card.jpg";
import philosophieCard from "../assets/subjects/philosophie-card.jpg";
import englischCard from "../assets/subjects/englisch-card.jpg";
import spanischCard from "../assets/subjects/spanisch-card.jpg";
import reededGlassBackground from "../assets/reeded-glass-background.png";
import useLiquidGlass from "../hooks/useLiquidGlass";
import useWidthTier from "../hooks/useWidthTier";
import useDocumentLibrary from "../hooks/useDocumentLibrary";
import { useBackHandler } from "../lib/backStack";
import useDocumentSource from "../hooks/useDocumentSource.js";
import { sourceThumbOf, withSourcePageSizes } from "./PagesPanel.jsx";
import useKnowledge from "../hooks/useKnowledge.js";
import { syncIserv } from "../knowledge/iservSync.js";
import { browserNoteRepository } from "../storage/noteRepository.js";
import { browserFolderRepository } from "../storage/folderRepository.js";
import { browserCardRepository } from "../knowledge/cardRepository.js";
import { hydrateImages, loadImages } from "../ink/imageStore.js";
import { browserInkRepository } from "../ink/inkRepository.js";
import { exportDocumentAsPdf, exportPageAsPng } from "../documents/exportDocument.js";
import {
  notePageStyleOf,
  previewTextOf,
  renderNotePagesOf,
  renderPagesFromDocument,
  renderNotePreviewDataUrl,
  subscribeToPreviewImages,
} from "../documents/notePreview.js";
import NewDocumentDialog from "./NewDocumentDialog.jsx";
import FolderDialog from "./FolderDialog.jsx";
import UpcomingCard from "./UpcomingCard.jsx";
import { loadUntisCredentials } from "../ink/untisSettings.js";
import { fetchUntisWeek, isLessonCancelled, loadArchivedWeek, loadUpdatedAt, untisDateNumber, untisMonday, UNTIS_MAX_WEEKS_BACK } from "../ink/untisArchive.js";

/* The agent input is a pill-sized control nested inside the agent panel, so it
   matches the Ask AI pill's geometry rather than the panel's. */
const SUBJECT_CARD_IMAGES = {
  mathe: matheCard,
  chemie: chemieCard,
  kunst: kunstCard,
  pgw: pgwCard,
  philosophie: philosophieCard,
  englisch: englischCard,
  spanisch: spanischCard,
};

const SUBJECTS = [
  { id: "mathe", name: "Mathe", count: 24, themeColor: "oklch(0.82 0.17 93)" },
  {
    id: "chemie",
    name: "Chemie",
    count: 17,
    themeColor: "oklch(0.68 0.19 304)",
  },
  { id: "kunst", name: "Kunst", count: 31, themeColor: "oklch(0.68 0.19 330)" },
  { id: "pgw", name: "PGW", count: 12, themeColor: "oklch(0.79 0.11 232)" },
  {
    id: "philosophie",
    name: "Philosophie",
    count: 9,
    themeColor: "oklch(0.78 0.02 260)",
  },
  {
    id: "englisch",
    name: "Englisch",
    count: 21,
    themeColor: "oklch(0.72 0.18 53)",
  },
  {
    id: "spanisch",
    name: "Spanisch",
    count: 14,
    themeColor: "oklch(0.62 0.22 27)",
  },
];

function dotForSubject(subjectName) {
  const match = SUBJECTS.find(
    (s) => s.name.toLowerCase() === String(subjectName || "").toLowerCase(),
  );
  return match?.themeColor || "#FFFFFF";
}

function matchesFolder(note, folder) {
  const subject = String(note?.subject || "").toLowerCase();
  return (
    !!subject &&
    (subject === folder.name.toLowerCase() || subject === folder.id.toLowerCase())
  );
}

function countInFolder(folder, notes) {
  return notes.filter((n) => matchesFolder(n, folder)).length;
}

// Newest two note previews in a folder, for the sheets behind its card.
function previewsInFolder(folder, notes) {
  return notes
    .filter((n) => matchesFolder(n, folder) && (n.thumbnail || n.preview))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 2)
    .map((n) => n.thumbnail || n.preview);
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function formatRelativeWhen(timestamp) {
  if (!Number.isFinite(timestamp)) return "";
  const diff = Date.now() - timestamp;
  if (diff < MINUTE) return "gerade eben";
  if (diff < HOUR) return `vor ${Math.round(diff / MINUTE)} Min.`;
  if (diff < DAY) return `vor ${Math.round(diff / HOUR)} Std.`;
  const days = Math.round(diff / DAY);
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days} Tagen`;
  return new Date(timestamp).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
  });
}

// Thematic decor per subject: accent color, decorative top-band pattern, wordmark + motto
const SUBJECT_THEMES = {
  mathe: {
    accent: "#F5C842",
    accentSoft: "rgba(245,200,66,.32)",
    mark: "ƒ(x)",
    motto: "ANALYSIS · VEKTOREN · STOCHASTIK",
    pattern:
      "linear-gradient(rgba(245,200,66,.36) 1px, transparent 1px), linear-gradient(90deg, rgba(245,200,66,.36) 1px, transparent 1px)",
    patternSize: "26px 26px, 26px 26px",
  },
  chemie: {
    accent: "#A970FF",
    accentSoft: "rgba(169,112,255,.32)",
    mark: "⌬",
    motto: "SYNTHESE · REDOX · TITRATION",
    pattern:
      "radial-gradient(circle at 50% 50%, rgba(169,112,255,.45) 1.6px, transparent 2px)",
    patternSize: "22px 22px",
  },
  kunst: {
    accent: "#F43F5E",
    accentSoft: "rgba(244,63,94,.32)",
    mark: "◐",
    motto: "PERSPEKTIVE · FARBLEHRE · KOMPOSITION",
    pattern:
      "repeating-linear-gradient(45deg, rgba(244,63,94,.32) 0 8px, transparent 8px 22px)",
    patternSize: "auto",
  },
  pgw: {
    accent: "#8AD4FF",
    accentSoft: "rgba(138,212,255,.32)",
    mark: "▤",
    motto: "POLITIK · GESELLSCHAFT · WIRTSCHAFT",
    pattern:
      "repeating-linear-gradient(90deg, rgba(138,212,255,.36) 0 3px, transparent 3px 16px)",
    patternSize: "auto",
  },
  philosophie: {
    accent: "#D8D8DE",
    accentSoft: "rgba(216,216,222,.26)",
    mark: "Φ",
    motto: "ETHIK · ERKENNTNIS · METAPHYSIK",
    pattern:
      "repeating-linear-gradient(0deg, rgba(216,216,222,.26) 0 1px, transparent 1px 30px)",
    patternSize: "auto",
  },
  englisch: {
    accent: "#FF8A2A",
    accentSoft: "rgba(255,138,42,.32)",
    mark: "Aa",
    motto: "LITERATURE · ESSAY · SHAKESPEARE",
    pattern:
      "repeating-linear-gradient(0deg, rgba(255,138,42,.32) 0 1px, transparent 1px 14px)",
    patternSize: "auto",
  },
  spanisch: {
    accent: "#E5484D",
    accentSoft: "rgba(229,72,77,.32)",
    mark: "¡Ñ!",
    motto: "VOCABULARIO · SUBJUNTIVO · CULTURA",
    pattern:
      "repeating-linear-gradient(-45deg, rgba(229,72,77,.30) 0 10px, transparent 10px 26px)",
    patternSize: "auto",
  },
};
const DEFAULT_THEME = {
  accent: "#FFFFFF",
  accentSoft: "rgba(255,255,255,.16)",
  mark: "",
  motto: "",
  pattern: "none",
  patternSize: "auto",
};

// Real notes come from browserNoteRepository (created from scratch) and
// documentLibrary.importedNotes (imported PDFs/images) - mapped to this same
// card shape further down, in place of what used to be a hardcoded mock list.

// A folder as a stack of sheets: two of its notes and its picture peek out
// above a frosted glass front, which blurs the picture sitting behind it.
function FolderCard({ name, count, image, color = "#8AD4FF", previews = [], testId, onOpen }) {
  const picture = image
    ? `url("${image}") center / cover`
    : `linear-gradient(155deg, ${color}, #0B0C10 80%)`;
  return (
    <button type="button" className="lib-folder" data-testid={testId} onClick={onOpen}>
      {[previews[1], previews[0]].map((src, index) => (
        <span
          key={index}
          className={`lib-folder-sheet lib-folder-sheet-${index}${src ? "" : " is-empty"}`}
          style={{ background: src ? `#fff url("${src}") top / cover` : color }}
        />
      ))}
      <span
        className="lib-folder-sheet lib-folder-sheet-image"
        style={{ background: picture }}
      />
      <span className="lib-folder-front">
        {/* The tablet WebView ignores backdrop-filter, so the glass blurs its
            own copy of the picture, laid exactly over the sheet behind it. */}
        <span className="lib-folder-frost" style={{ background: picture }} aria-hidden="true" />
        <span className="lib-folder-name">{name}</span>
        <span className="lib-folder-count">
          {count} {count === 1 ? "Notiz" : "Notizen"}
        </span>
      </span>
    </button>
  );
}

// A textbook on the folder's shelf: the PDF's first page as the cover, a
// darker spine strip down the left edge and a long soft shadow.
function BookTile({ book, onOpen, onLongPress }) {
  const press = useLongPress(() => onLongPress?.(book), onOpen);
  return (
    <button type="button" className="lib-book" data-testid={`book-tile-${book.id}`} {...press}>
      <span className="lib-book-cover">
        {book.thumbnail ? (
          <img src={book.thumbnail} alt="" draggable={false} />
        ) : (
          <BookOpen size={28} color="#FFFFFF" />
        )}
        <span className="lib-book-spine" aria-hidden="true" />
      </span>
      <span className="lib-book-title">{book.title}</span>
    </button>
  );
}

function ThematicSubjectHeader({ subject, onClearFilter, onNewNote }) {
  if (subject.id === "mathe") {
    return (
      <div
        className="lib-thematic-banner"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.22 0.065 258) 0%, #0A090F 100%)",
        }}
        data-testid="thematic-banner-mathe"
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  font: "700 10.5px ui-monospace,monospace",
                  letterSpacing: ".12em",
                  color: "#90c4ff",
                  textTransform: "uppercase",
                }}
              >
                FACHÜBERSICHT · MATHEMATIK
              </span>
              <button
                className="lib-filter-pill"
                onClick={onClearFilter}
                title="Alle Fächer anzeigen"
              >
                <X size={12} /> Alle Fächer
              </button>
            </div>
            <h1
              style={{
                margin: "4px 0 0",
                font: '800 36px/1 "Bricolage Grotesque",sans-serif',
                color: "#FFFFFF",
                letterSpacing: "-0.025em",
              }}
            >
              Mathematik & Analysis
            </h1>
            <p
              style={{
                margin: "6px 0 0",
                color: "#FFFFFF",
                font: "400 13px Manrope,sans-serif",
              }}
            >
              Differential- und Integralrechnung, Vektorräume, Stochastik &
              Klausurvorbereitung
            </p>
          </div>
          <button
            onClick={onNewNote}
            className="lib-filter-pill"
            style={{
              background: "#0a84ff",
              border: "none",
              color: "#FFFFFF",
              padding: "8px 18px",
              fontWeight: 700,
            }}
          >
            <PenLine size={14} /> Neue Mathe-Notiz
          </button>
        </div>

        {/* Thematic Floating Formula Badges */}
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}
        >
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 10,
              background: "rgba(10,132,255,0.22)",
              border: "1px solid rgba(10,132,255,0.4)",
              color: "#FFFFFF",
              font: "600 11px ui-monospace,monospace",
            }}
          >
            f'(x) = lim (f(x+h)-f(x))/h
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#FFFFFF",
              font: "600 11px ui-monospace,monospace",
            }}
          >
            ∫ f(x)dx = F(b) - F(a)
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#FFFFFF",
              font: "600 11px ui-monospace,monospace",
            }}
          >
            a ⊥ b ⇔ a·b = 0
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 10,
              background: "rgba(255,200,100,0.2)",
              border: "1px solid rgba(255,200,100,0.35)",
              color: "#FFFFFF",
              font: "600 11px ui-monospace,monospace",
            }}
          >
            Klausur: 14. September
          </span>
        </div>
      </div>
    );
  }

  if (subject.id === "chemie") {
    return (
      <div
        className="lib-thematic-banner"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.22 0.05 160) 0%, #080D0A 100%)",
        }}
        data-testid="thematic-banner-chemie"
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  font: "700 10.5px ui-monospace,monospace",
                  letterSpacing: ".12em",
                  color: "#86efac",
                  textTransform: "uppercase",
                }}
              >
                FACHÜBERSICHT · CHEMIE
              </span>
              <button
                className="lib-filter-pill"
                onClick={onClearFilter}
                title="Alle Fächer anzeigen"
              >
                <X size={12} /> Alle Fächer
              </button>
            </div>
            <h1
              style={{
                margin: "4px 0 0",
                font: '800 36px/1 "Bricolage Grotesque",sans-serif',
                color: "#FFFFFF",
                letterSpacing: "-0.025em",
              }}
            >
              Chemie & Laborprotokolle
            </h1>
            <p
              style={{
                margin: "6px 0 0",
                color: "#FFFFFF",
                font: "400 13px Manrope,sans-serif",
              }}
            >
              Organische Synthese, Redox-Gleichgewichte, Säure-Base-Titrationen
              & Energetik
            </p>
          </div>
          <button
            onClick={onNewNote}
            className="lib-filter-pill"
            style={{
              background: "#30d158",
              border: "none",
              color: "#08140B",
              padding: "8px 18px",
              fontWeight: 700,
            }}
          >
            <PenLine size={14} /> Neue Chemie-Notiz
          </button>
        </div>

        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}
        >
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 10,
              background: "rgba(48,209,88,0.22)",
              border: "1px solid rgba(48,209,88,0.4)",
              color: "#FFFFFF",
              font: "600 11px ui-monospace,monospace",
            }}
          >
            pH = -lg[H3O+] = 7.0 (Äquivalenzpunkt)
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#FFFFFF",
              font: "600 11px ui-monospace,monospace",
            }}
          >
            Zn → Zn²⁺ + 2e⁻ (ΔE° = 1.10V)
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#FFFFFF",
              font: "600 11px ui-monospace,monospace",
            }}
          >
            R-COOH + R'-OH ⇌ Ester + H2O
          </span>
        </div>
      </div>
    );
  }

  if (subject.id === "kunst") {
    return (
      <div
        className="lib-thematic-banner"
        style={{
          background: "linear-gradient(135deg, #261421 0%, #0E0B12 100%)",
        }}
        data-testid="thematic-banner-kunst"
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  font: "700 10.5px ui-monospace,monospace",
                  letterSpacing: ".12em",
                  color: "#ff94d2",
                  textTransform: "uppercase",
                }}
              >
                FACHÜBERSICHT · BILDENDE KUNST
              </span>
              <button
                className="lib-filter-pill"
                onClick={onClearFilter}
                title="Alle Fächer anzeigen"
              >
                <X size={12} /> Alle Fächer
              </button>
            </div>
            <h1
              style={{
                margin: "4px 0 0",
                font: '800 36px/1 "Bricolage Grotesque",sans-serif',
                color: "#FFFFFF",
                letterSpacing: "-0.025em",
              }}
            >
              Kunst, Zeichnung & Design
            </h1>
            <p
              style={{
                margin: "6px 0 0",
                color: "#FFFFFF",
                font: "400 13px Manrope,sans-serif",
              }}
            >
              Zweipunktperspektive, Farbtheorie nach Itten, Renaissance-Studien
              & Vektorkunst
            </p>
          </div>
          <button
            onClick={onNewNote}
            className="lib-filter-pill"
            style={{
              background: "linear-gradient(140deg, #ff4081, #d500f9)",
              border: "none",
              color: "#FFFFFF",
              padding: "8px 18px",
              fontWeight: 700,
            }}
          >
            <PenLine size={14} /> Neue Kunst-Skizze
          </button>
        </div>

        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}
        >
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 10,
              background: "rgba(255,64,129,0.22)",
              border: "1px solid rgba(255,64,129,0.4)",
              color: "#FFFFFF",
              font: "600 11px ui-monospace,monospace",
            }}
          >
            Goldener Schnitt: Φ ≈ 1.618
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#FFFFFF",
              font: "600 11px ui-monospace,monospace",
            }}
          >
            Itten-Farbkreis & Komplementärkontrast
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#FFFFFF",
              font: "600 11px ui-monospace,monospace",
            }}
          >
            Fluchtpunkt & Horizontlinie
          </span>
        </div>
      </div>
    );
  }

  if (subject.id === "pgw") {
    return (
      <div
        className="lib-thematic-banner"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.22 0.05 320) 0%, #0E0A14 100%)",
        }}
        data-testid="thematic-banner-pgw"
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  font: "700 10.5px ui-monospace,monospace",
                  letterSpacing: ".12em",
                  color: "#d8b4fe",
                  textTransform: "uppercase",
                }}
              >
                FACHÜBERSICHT · PGW
              </span>
              <button
                className="lib-filter-pill"
                onClick={onClearFilter}
                title="Alle Fächer anzeigen"
              >
                <X size={12} /> Alle Fächer
              </button>
            </div>
            <h1
              style={{
                margin: "4px 0 0",
                font: '800 36px/1 "Bricolage Grotesque",sans-serif',
                color: "#FFFFFF",
                letterSpacing: "-0.025em",
              }}
            >
              Politik, Gesellschaft, Wirtschaft
            </h1>
            <p
              style={{
                margin: "6px 0 0",
                color: "#FFFFFF",
                font: "400 13px Manrope,sans-serif",
              }}
            >
              Wahlsysteme, Verfassungsrecht, Internationale Konflikte &
              Wirtschaftsordnung
            </p>
          </div>
          <button
            onClick={onNewNote}
            className="lib-filter-pill"
            style={{
              background: "#a855f7",
              border: "none",
              color: "#FFFFFF",
              padding: "8px 18px",
              fontWeight: 700,
            }}
          >
            <PenLine size={14} /> Neue PGW-Notiz
          </button>
        </div>

        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}
        >
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 10,
              background: "rgba(168,85,247,0.22)",
              border: "1px solid rgba(168,85,247,0.4)",
              color: "#FFFFFF",
              font: "600 11px ui-monospace,monospace",
            }}
          >
            Grundgesetz Art. 1-20 (Ewigkeitsklausel)
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#FFFFFF",
              font: "600 11px ui-monospace,monospace",
            }}
          >
            Bundestag & Bundesrat (Gewaltenteilung)
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#FFFFFF",
              font: "600 11px ui-monospace,monospace",
            }}
          >
            Soziale Marktwirtschaft
          </span>
        </div>
      </div>
    );
  }

  if (subject.id === "philosophie") {
    return (
      <div
        className="lib-thematic-banner"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.22 0.035 78) 0%, #0E0C09 100%)",
        }}
        data-testid="thematic-banner-philosophie"
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  font: "700 10.5px ui-monospace,monospace",
                  letterSpacing: ".12em",
                  color: "#fde047",
                  textTransform: "uppercase",
                }}
              >
                FACHÜBERSICHT · PHILOSOPHIE
              </span>
              <button
                className="lib-filter-pill"
                onClick={onClearFilter}
                title="Alle Fächer anzeigen"
              >
                <X size={12} /> Alle Fächer
              </button>
            </div>
            <h1
              style={{
                margin: "4px 0 0",
                font: 'italic 40px/1 "Instrument Serif",serif',
                color: "#FFFFFF",
              }}
            >
              Philosophie & Erkenntnistheorie
            </h1>
            <p
              style={{
                margin: "6px 0 0",
                color: "#FFFFFF",
                font: "400 13px Manrope,sans-serif",
              }}
            >
              Ethik, Anthropologie, Existenzialismus und antike
              Staatsphilosophie
            </p>
          </div>
          <button
            onClick={onNewNote}
            className="lib-filter-pill"
            style={{
              background: "#eab308",
              border: "none",
              color: "#0E0C09",
              padding: "8px 18px",
              fontWeight: 700,
            }}
          >
            <PenLine size={14} /> Neue Philosophie-Notiz
          </button>
        </div>

        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}
        >
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 10,
              background: "rgba(250,204,21,0.22)",
              border: "1px solid rgba(250,204,21,0.4)",
              color: "#FFFFFF",
              font: 'italic 12px "Instrument Serif",serif',
            }}
          >
            „Sapere aude! Habe Mut, dich deines eigenen Verstandes zu bedienen."
            — Kant
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#FFFFFF",
              font: 'italic 12px "Instrument Serif",serif',
            }}
          >
            „Die Existenz geht der Essenz voraus." — Sartre
          </span>
        </div>
      </div>
    );
  }

  if (subject.id === "englisch") {
    return (
      <div
        className="lib-thematic-banner"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.22 0.05 26) 0%, #0E090B 100%)",
        }}
        data-testid="thematic-banner-englisch"
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  font: "700 10.5px ui-monospace,monospace",
                  letterSpacing: ".12em",
                  color: "#fda4af",
                  textTransform: "uppercase",
                }}
              >
                SUBJECT OVERVIEW · ENGLISH
              </span>
              <button
                className="lib-filter-pill"
                onClick={onClearFilter}
                title="Alle Fächer anzeigen"
              >
                <X size={12} /> All Subjects
              </button>
            </div>
            <h1
              style={{
                margin: "4px 0 0",
                font: '800 36px/1 "Bricolage Grotesque",sans-serif',
                color: "#FFFFFF",
                letterSpacing: "-0.025em",
              }}
            >
              English Language & Literature
            </h1>
            <p
              style={{
                margin: "6px 0 0",
                color: "#FFFFFF",
                font: "400 13px Manrope,sans-serif",
              }}
            >
              Literary analysis, stylistic devices, Shakespearean drama & essay
              composition
            </p>
          </div>
          <button
            onClick={onNewNote}
            className="lib-filter-pill"
            style={{
              background: "#f43f5e",
              border: "none",
              color: "#FFFFFF",
              padding: "8px 18px",
              fontWeight: 700,
            }}
          >
            <PenLine size={14} /> New English Note
          </button>
        </div>

        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}
        >
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 10,
              background: "rgba(244,63,94,0.22)",
              border: "1px solid rgba(244,63,94,0.4)",
              color: "#FFFFFF",
              font: "600 11px ui-monospace,monospace",
            }}
          >
            Macbeth: "Fair is foul, and foul is fair"
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "#FFFFFF",
              font: "600 11px ui-monospace,monospace",
            }}
          >
            Connectors: Furthermore, In consequence, Conversely
          </span>
        </div>
      </div>
    );
  }

  // SPANISCH
  return (
    <div
      className="lib-thematic-banner"
      style={{
        background:
          "linear-gradient(135deg, oklch(0.22 0.05 56) 0%, #0F0A07 100%)",
      }}
      data-testid="thematic-banner-spanisch"
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 4,
            }}
          >
            <span
              style={{
                font: "700 10.5px ui-monospace,monospace",
                letterSpacing: ".12em",
                color: "#fdba74",
                textTransform: "uppercase",
              }}
            >
              RESUMEN DE LA ASIGNATURA · ESPAÑOL
            </span>
            <button
              className="lib-filter-pill"
              onClick={onClearFilter}
              title="Alle Fächer anzeigen"
            >
              <X size={12} /> Todas las materias
            </button>
          </div>
          <h1
            style={{
              margin: "4px 0 0",
              font: '800 36px/1 "Bricolage Grotesque",sans-serif',
              color: "#FFFFFF",
              letterSpacing: "-0.025em",
            }}
          >
            Lengua y Literatura Española
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              color: "#FFFFFF",
              font: "400 13px Manrope,sans-serif",
            }}
          >
            Gramática avanzada, el subjuntivo, vocabulario temático y literatura
            clásica
          </p>
        </div>
        <button
          onClick={onNewNote}
          className="lib-filter-pill"
          style={{
            background: "#f97316",
            border: "none",
            color: "#0F0A07",
            padding: "8px 18px",
            fontWeight: 700,
          }}
        >
          <PenLine size={14} /> Nueva Nota
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <span
          style={{
            padding: "4px 10px",
            borderRadius: 10,
            background: "rgba(249,115,22,0.22)",
            border: "1px solid rgba(249,115,22,0.4)",
            color: "#FFFFFF",
            font: "600 11px ui-monospace,monospace",
          }}
        >
          Subjuntivo: Deseos, Dudas, Emociones (WEIRDO)
        </span>
        <span
          style={{
            padding: "4px 10px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "#FFFFFF",
            font: "600 11px ui-monospace,monospace",
          }}
        >
          Don Quijote de la Mancha — Cervantes
        </span>
      </div>
    </div>
  );
}

const LONG_PRESS_MS = 500;

// Fires onLongPress instead of onClick when the pointer is held down past
// the delay; a normal tap still fires onClick as usual.
function useLongPress(onLongPress, onClick, delay = LONG_PRESS_MS) {
  const timerRef = useRef(null);
  const firedRef = useRef(false);
  return {
    onPointerDown: () => {
      firedRef.current = false;
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        onLongPress();
      }, delay);
    },
    onPointerUp: () => clearTimeout(timerRef.current),
    onPointerLeave: () => clearTimeout(timerRef.current),
    onClick: (event) => {
      if (firedRef.current) {
        firedRef.current = false;
        return;
      }
      onClick?.(event);
    },
  };
}

// Opened by a long-press on a card (see useLongPress) into the same slot the
// Stundenplan/agent panels occupy. Imported documents keep their metadata in
// documentRepository.js, not here, so they get a read-only view.
const SWIPE_THRESHOLD_PX = 50;

// Drag-to-swipe between a note's pages, phone-gallery style: live-tracks the
// finger/pointer while held, snaps to the next/previous page past the
// threshold, and springs back otherwise.
function usePageSwipe(pageCount, pageIndex, setPageIndex) {
  const [dragX, setDragX] = useState(0);
  const startXRef = useRef(null);

  return {
    dragX,
    handlers: {
      onPointerDown: (event) => {
        startXRef.current = event.clientX;
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event) => {
        if (startXRef.current === null) return;
        setDragX(event.clientX - startXRef.current);
      },
      onPointerUp: () => {
        if (startXRef.current === null) return;
        if (dragX <= -SWIPE_THRESHOLD_PX && pageIndex < pageCount - 1)
          setPageIndex(pageIndex + 1);
        else if (dragX >= SWIPE_THRESHOLD_PX && pageIndex > 0) setPageIndex(pageIndex - 1);
        startXRef.current = null;
        setDragX(0);
      },
      onPointerCancel: () => {
        startXRef.current = null;
        setDragX(0);
      },
    },
  };
}

function NoteDetailPanel({ note, onClose, onOpen }) {
  const editable = note?.kind !== "imported";
  const [title, setTitle] = useState(note?.title || "");
  const [subject, setSubject] = useState(note?.subject || "");
  const [pageIndex, setPageIndex] = useState(0);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportMenuRef = useRef(null);

  useEffect(() => {
    if (!isExportMenuOpen) return undefined;
    const handleDown = (event) => {
      if (!exportMenuRef.current?.contains(event.target)) setIsExportMenuOpen(false);
    };
    document.addEventListener("pointerdown", handleDown);
    return () => document.removeEventListener("pointerdown", handleDown);
  }, [isExportMenuOpen]);

  const [previewVersion, setPreviewVersion] = useState(0);
  useEffect(
    () => subscribeToPreviewImages(() => setPreviewVersion((v) => v + 1)),
    [],
  );
  // previewVersion isn't read by renderNotePagesOf - it's a dependency purely
  // to force this memo to recompute once a page's image finishes decoding
  // (see notePreview.js's async image cache).
  // An imported note's ink sits on the PDF/image page itself: draw the ink
  // over that page (sized like the file) instead of on a blank sheet.
  const importedPages = !editable && note?.pages?.length ? note.pages : null;
  const pages = useMemo(() => {
    if (!note) return [];
    if (!importedPages) return renderNotePagesOf(note.id);
    const inkDoc = browserInkRepository.loadHistory(note.id)?.present || {
      pages: importedPages.map((page) => ({ id: page.id })),
      strokes: [],
    };
    return renderPagesFromDocument(withSourcePageSizes(inkDoc, importedPages));
  }, [note?.id, previewVersion]);
  const { sourceHandle } = useDocumentSource({ note: importedPages ? note : undefined });
  const [sourceSrcs, setSourceSrcs] = useState({});
  useEffect(() => {
    setSourceSrcs({});
    if (!sourceHandle || !importedPages) return undefined;
    let cancelled = false;
    importedPages.forEach((page) =>
      sourceThumbOf(sourceHandle, note.source.type, page.index).then((src) => {
        if (!cancelled) setSourceSrcs((current) => ({ ...current, [page.id]: src }));
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [sourceHandle]);
  const { dragX, handlers: swipeHandlers } = usePageSwipe(pages.length, pageIndex, setPageIndex);

  useEffect(() => {
    setTitle(note?.title || "");
    setSubject(note?.subject || "");
    setPageIndex(0);
  }, [note?.id]);

  if (!note) return null;

  const save = (changes) => {
    if (editable) browserNoteRepository.saveNote({ id: note.id, title, subject, ...changes });
  };

  const handleDelete = () => {
    if (!globalThis.confirm(`"${note.title}" wirklich löschen?`)) return;
    browserNoteRepository.removeNote(note.id);
    onClose();
  };

  const handleExport = async (kind) => {
    setIsExportMenuOpen(false);
    let inkDoc = browserInkRepository.loadHistory(note.id)?.present;
    if (!inkDoc) return;
    setIsExporting(true);
    try {
      await loadImages(inkDoc);
      inkDoc = hydrateImages(inkDoc);
      if (kind === "pdf") {
        await exportDocumentAsPdf(inkDoc, note.title);
      } else {
        const pageId = pages[pageIndex]?.id || inkDoc.pages[0]?.id;
        await exportPageAsPng(inkDoc, pageId, note.title);
      }
    } catch (error) {
      globalThis.alert?.(`Export fehlgeschlagen: ${error.message || error}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="lib-glass agent-panel-card" data-testid="note-detail-panel">
      <div className="agent-panel-head">
        <span style={{ font: '700 15px "Bricolage Grotesque",sans-serif', color: "#FFFFFF" }}>
          Notiz-Details
        </span>
        <button
          className="agent-close"
          onClick={onClose}
          title="Schließen"
          data-testid="note-detail-close-btn"
        >
          <X size={14} strokeWidth={2.4} />
        </button>
      </div>
      <div className="agent-panel-body">
        {pages.length > 0 && (
          <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div
              {...(pages.length > 1 ? swipeHandlers : {})}
              data-testid="note-detail-pages"
              style={{
                flex: "1 1 0",
                minHeight: 0,
                alignSelf: "center",
                maxWidth: "100%",
                borderRadius: 18,
                overflow: "hidden",
                aspectRatio: pages[0].aspectRatio || 0.71,
                background: pages[0].background,
                touchAction: "pan-y",
                cursor: pages.length > 1 ? "grab" : "default",
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: "100%",
                  height: "100%",
                  transform: `translateX(calc(${-pageIndex * 100}% + ${dragX}px))`,
                  transition: dragX === 0 ? "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)" : "none",
                }}
              >
                {pages.map((p) => (
                  <div key={p.id} style={{ flex: "0 0 100%", height: "100%", position: "relative" }}>
                    {sourceSrcs[p.id] && (
                      <img
                        src={sourceSrcs[p.id]}
                        alt=""
                        draggable={false}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
                      />
                    )}
                    {p.src && (
                      <img
                        src={p.src}
                        alt=""
                        draggable={false}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
            {pages.length > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 8, flex: "none" }}>
                {pages.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setPageIndex(i)}
                    title={`Seite ${i + 1}`}
                    style={{
                      width: 6,
                      height: 6,
                      padding: 0,
                      borderRadius: "50%",
                      border: "none",
                      background: i === pageIndex ? "#FFFFFF" : "rgba(255,255,255,.3)",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>Titel</div>
          {editable ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => save({ title })}
              data-testid="note-detail-title-input"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,.15)",
                background: "rgba(255,255,255,.06)",
                color: "#FFFFFF",
                font: "500 13px sans-serif",
              }}
            />
          ) : (
            <div style={{ color: "#FFFFFF", font: "600 14px sans-serif" }}>{note.title}</div>
          )}
        </div>

        {editable && (
          <div>
            <div style={{ fontSize: 11, opacity: 0.6, margin: "10px 0 6px" }}>Fach</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SUBJECTS.map((s) => (
                <button
                  key={s.id}
                  data-testid={`note-detail-subject-${s.id}`}
                  onClick={() => {
                    setSubject(s.name);
                    save({ subject: s.name });
                  }}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 999,
                    fontSize: 12,
                    border: subject === s.name ? "2px solid #3E7BD8" : "1px solid rgba(255,255,255,.15)",
                    background: subject === s.name ? "rgba(62,123,216,.15)" : "transparent",
                    color: "#FFFFFF",
                    cursor: "pointer",
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 4, display: "flex", gap: 8 }}>
          <button
            onClick={() => onOpen(editable ? { ...note, title, subject } : note)}
            data-testid="note-detail-open-btn"
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 10,
              border: "none",
              background: "#FFFFFF",
              color: "#08080A",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Öffnen
          </button>
          <div style={{ position: "relative" }} ref={exportMenuRef}>
            <button
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              title="Exportieren"
              disabled={isExporting}
              data-testid="note-detail-export-btn"
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,.15)",
                background: isExportMenuOpen ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.06)",
                color: "#FFFFFF",
                cursor: "pointer",
              }}
            >
              <Download size={16} />
            </button>
            {isExportMenuOpen && (
              <div className="export-menu" style={{ bottom: "calc(100% + 8px)", top: "auto" }}>
                <button onClick={() => handleExport("png")}>
                  <ImageIcon size={15} /> Seite als PNG
                </button>
                <button onClick={() => handleExport("pdf")}>
                  <FileText size={15} /> Dokument als PDF
                </button>
              </div>
            )}
          </div>
          {editable && (
            <button
              onClick={handleDelete}
              title="Notiz löschen"
              data-testid="note-detail-delete-btn"
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,69,58,.4)",
                background: "rgba(255,69,58,.12)",
                color: "#FF6B60",
                cursor: "pointer",
              }}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RecentCard({ n, onOpen, onLongPress }) {
  const pressHandlers = useLongPress(() => onLongPress?.(n), onOpen);
  return (
    <div
      {...pressHandlers}
      className="lib-card"
      style={{
        cursor: "pointer",
        background: n.agent
          ? "linear-gradient(165deg, rgba(75, 30, 85, 0.65), rgba(14, 13, 19, 0.85) 60%)"
          : undefined,
      }}
    >
      {/* 1. Code Card */}
      {n.type === "code" && (
        <div style={{ padding: "14px 16px 12px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              marginBottom: 8,
            }}
          >
            <Code2 size={13} color="#4FA66B" />
            <span
              style={{
                font: "700 11px ui-monospace,monospace",
                color: "#FFFFFF",
              }}
            >
              {n.repo}
            </span>
          </div>
          <div
            style={{
              font: "400 12px/1.4 Manrope,sans-serif",
              color: "#FFFFFF",
              marginBottom: 10,
            }}
          >
            {n.body}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              font: "600 10px ui-monospace,monospace",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                color: "#4FA66B",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#4FA66B",
                }}
              />{" "}
              {n.lang}
            </span>
            <span style={{ color: "#FFFFFF" }}>★ {n.stars}</span>
          </div>
        </div>
      )}

      {/* 2. Banner Art Exhibition Card */}
      {n.type === "banner" && (
        <div>
          <div
            style={{
              height: 130,
              background:
                "linear-gradient(135deg,#5e2a2b 0%,#2c1e28 50%,#182830 100%)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(circle at 75% 30%, rgba(255,200,120,.35), transparent 50%)",
              }}
            />
            <div
              style={{ position: "absolute", left: 16, bottom: 14, right: 16 }}
            >
              <span
                style={{
                  font: '400 italic 20px/1 "Instrument Serif",serif',
                  color: "#FFFFFF",
                }}
              >
                The Renaissance
              </span>
              <div
                style={{
                  font: "700 10px ui-monospace,monospace",
                  letterSpacing: ".12em",
                  color: "#FFFFFF",
                }}
              >
                EDITION
              </div>
            </div>
          </div>
          <div
            style={{
              padding: "9px 14px",
              background: "rgba(0,0,0,.45)",
              font: "600 10px ui-monospace,monospace",
              color: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>🛍️</span> {n.tag}
          </div>
        </div>
      )}

      {/* 3. Quote Card */}
      {n.type === "quote" && (
        <div
          style={{
            padding: "16px 18px 14px",
            background: "rgba(18, 17, 24, 0.55)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 8,
            }}
          >
            <Quote size={12} color="#D4A937" />
            <span
              style={{
                font: "700 11px ui-monospace,monospace",
                color: "#D4A937",
              }}
            >
              {n.platform}
            </span>
          </div>
          <div
            style={{
              font: "400 13px/1.55 Manrope,sans-serif",
              color: "#FFFFFF",
            }}
          >
            {n.body}
          </div>
        </div>
      )}

      {/* 4. Inspect Image Photo Card with Center Action Buttons */}
      {n.type === "inspect" && (
        <div>
          <div
            style={{
              height: 136,
              background:
                "repeating-linear-gradient(45deg,rgba(31,28,36,0.7) 0 10px,rgba(23,21,28,0.7) 10px 20px)",
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ display: "flex", gap: 10 }}>
              <div className="lib-inspect-action-btn" title="Download">
                <Download size={14} />
              </div>
              <div className="lib-inspect-action-btn" title="Zoom & Vorschau">
                <ZoomIn size={14} />
              </div>
            </div>
            <span
              style={{
                position: "absolute",
                left: 12,
                bottom: 10,
                font: "600 9.5px ui-monospace,monospace",
                color: "#FFFFFF",
              }}
            >
              Tafelbild · 2400×1600
            </span>
          </div>
          <div style={{ padding: "12px 16px 10px" }}>
            <div
              style={{
                font: '700 14px "Bricolage Grotesque",sans-serif',
                color: "#FFFFFF",
              }}
            >
              {n.title}
            </div>
            <div
              style={{
                marginTop: 4,
                font: "400 11px/1.4 Manrope,sans-serif",
                color: "#FFFFFF",
              }}
            >
              {n.body}
            </div>
          </div>
        </div>
      )}

      {/* 5. Editorial Typography Card */}
      {n.type === "editorial" && (
        <div
          style={{
            padding: "16px 18px 15px",
            background: "rgba(19, 18, 24, 0.55)",
          }}
        >
          <div
            style={{
              font: '800 18px/1.15 "Bricolage Grotesque",sans-serif',
              letterSpacing: "-.02em",
              color: "#FFFFFF",
              marginBottom: 8,
            }}
          >
            {n.title}
          </div>
          <div
            style={{
              font: "400 11.5px/1.55 Manrope,sans-serif",
              color: "#FFFFFF",
              marginBottom: 10,
            }}
          >
            {n.body}
          </div>
          <div
            style={{
              font: '700 12px "Bricolage Grotesque",sans-serif',
              color: "#FFFFFF",
              marginBottom: 4,
            }}
          >
            {n.subtitle}
          </div>
          <div
            style={{
              font: "400 11.5px/1.55 Manrope,sans-serif",
              color: "#FFFFFF",
              marginBottom: 10,
            }}
          >
            {n.body2}
          </div>
          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,.12)",
              paddingTop: 8,
              font: "600 9.5px ui-monospace,monospace",
              color: "#FFFFFF",
            }}
          >
            📰 {n.source}
          </div>
        </div>
      )}

      {/* 6. Gallery 4-Grid Photo Card */}
      {n.type === "gallery" && (
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 2,
              height: 110,
              background: "rgba(8,8,10,0.6)",
              padding: 2,
            }}
          >
            <div style={{ background: "#25232c" }} />
            <div style={{ background: "#1c1a22" }} />
            <div style={{ background: "#15141b" }} />
            <div style={{ background: "#2b2834" }} />
          </div>
          <div
            style={{
              padding: "11px 16px",
              font: '700 14px "Bricolage Grotesque",sans-serif',
              color: "#FFFFFF",
            }}
          >
            {n.title}
          </div>
        </div>
      )}

      {/* 7. Figma Card */}
      {n.type === "figma" && (
        <div
          style={{
            padding: "16px 18px 14px",
            background: "rgba(18, 16, 23, 0.55)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <span
              style={{
                font: '800 20px/1 "Bricolage Grotesque",sans-serif',
                color: "#FFFFFF",
              }}
            >
              Figma
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#F24E1E",
                }}
              />
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#A259FF",
                }}
              />
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#1ABCFE",
                }}
              />
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#0ACF83",
                }}
              />
            </div>
          </div>
          <div
            style={{
              height: 44,
              borderRadius: 10,
              background: "rgba(0,0,0,.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FFFFFF",
              font: "italic 12px sans-serif",
            }}
          >
            Vector Canvas · Presets
          </div>
        </div>
      )}

      {/* 8. Vehicle Overview Card */}
      {n.type === "vehicle" && (
        <div>
          <div
            style={{
              height: 110,
              background: "linear-gradient(135deg,#242b23,#101410)",
              position: "relative",
              display: "flex",
              alignItems: "flex-end",
              padding: 14,
            }}
          >
            <span
              style={{
                font: '800 16px/1 "Bricolage Grotesque",sans-serif',
                color: "#FFFFFF",
                letterSpacing: ".05em",
              }}
            >
              {n.title}
            </span>
          </div>
          <div
            style={{
              padding: "9px 14px",
              background: "rgba(0,0,0,.45)",
              font: "600 10px ui-monospace,monospace",
              color: "#FFFFFF",
            }}
          >
            🚗 {n.tag}
          </div>
        </div>
      )}

      {/* 9. Agent Card */}
      {n.type === "agent" && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "12px 15px 0",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 8px",
                borderRadius: 999,
                background: "oklch(0.6 0.07 320/.25)",
                font: "600 9.5px ui-monospace,monospace",
                letterSpacing: ".05em",
                color: "#FFFFFF",
              }}
            >
              <Sparkles size={11} />
              AGENT
            </span>
            <span
              style={{
                font: "600 10px ui-monospace,monospace",
                color: "#FFFFFF",
              }}
            >
              {n.sources} Quellen
            </span>
          </div>
          <div style={{ padding: "9px 16px 15px" }}>
            <div
              style={{
                font: '700 17px/1.22 "Bricolage Grotesque",sans-serif',
                letterSpacing: "-.025em",
                color: "#FFFFFF",
              }}
            >
              {n.title}
            </div>
            <div
              style={{
                marginTop: 8,
                font: "400 11.5px/1.6 Manrope,sans-serif",
                color: "#FFFFFF",
              }}
            >
              {n.body}
            </div>
          </div>
        </div>
      )}

      {/* 10. Math Handwriting Card */}
      {/* Real note: a 1:1 render of the page's own top-left corner, not a
          description of it - see notePreview.js. */}
      {n.type === "canvas-preview" && (
        <div>
          <div
            style={{
              height: 150,
              position: "relative",
              overflow: "hidden",
              ...n.pageStyle,
            }}
          >
            {n.preview && (
              <img
                src={n.preview}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "top left",
                }}
              />
            )}
          </div>
          <div style={{ padding: "12px 16px 10px" }}>
            <div
              style={{
                font: '700 15px "Bricolage Grotesque",sans-serif',
                color: "#FFFFFF",
              }}
            >
              {n.title}
            </div>
            {!n.preview && (
              <div
                style={{
                  marginTop: 4,
                  font: "400 12px/1.4 Manrope,sans-serif",
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                {n.pageKind === "whiteboard" ? "Whiteboard" : "Leere Notiz"}
              </div>
            )}
          </div>
        </div>
      )}

      {n.type === "math" && (
        <div
          style={{
            padding: "15px 17px",
            backgroundImage:
              "linear-gradient(to bottom,transparent calc(100% - 1px),rgba(255,255,255,.08) calc(100% - 1px))",
            backgroundSize: "100% 22px",
          }}
        >
          <div
            style={{
              font: "600 20px/1.15 Caveat,cursive",
              color: "#FFFFFF",
              borderBottom: `1.5px solid ${n.dot}b0`,
              display: "inline-block",
            }}
          >
            {n.title}
          </div>
          <div
            style={{
              marginTop: 9,
              font: "400 16px/22px Caveat,cursive",
              color: "#FFFFFF",
            }}
          >
            {n.body}
          </div>
          {n.tag && (
            <div
              style={{
                marginTop: 4,
                display: "inline-block",
                padding: "1px 5px",
                background: "oklch(0.7 0.09 92/.25)",
                font: "400 16px/22px Caveat,cursive",
                color: "#FFFFFF",
              }}
            >
              {n.tag}
            </div>
          )}
        </div>
      )}

      {/* 11. Serif Dialogue Card */}
      {n.type === "serif" && (
        <div style={{ padding: "18px 20px 16px" }}>
          <div
            style={{
              font: '400 italic 26px/1.15 "Instrument Serif",serif',
              color: "#FFFFFF",
            }}
          >
            {n.title}
          </div>
          <div
            style={{
              marginTop: 11,
              font: "400 16px/22px Caveat,cursive",
              color: "#FFFFFF",
            }}
          >
            {n.body}
          </div>
          <div
            style={{
              marginTop: 13,
              height: 1,
              background: "rgba(255,255,255,.15)",
            }}
          />
          <div
            style={{
              marginTop: 9,
              font: "400 16px/22px Caveat,cursive",
              color: "#FFFFFF",
            }}
          >
            {n.question}
          </div>
        </div>
      )}

      {/* 12. Imported Document Card */}
      {n.type === "imported-document" && n.thumbnail && (
        <div style={{ height: 150, overflow: "hidden", background: "#fff" }}>
          <img
            src={n.thumbnail}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top left",
            }}
          />
        </div>
      )}
      {n.type === "imported-document" && (
        <div style={{ padding: "16px 18px 14px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 8,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 8px",
                borderRadius: 999,
                background: "rgba(138,212,255,0.2)",
                font: "600 9.5px ui-monospace,monospace",
                letterSpacing: ".05em",
                color: "#8AD4FF",
              }}
            >
              <FileUp size={11} />
              {n.source?.type === "pdf" ? "PDF" : "BILD"}
            </span>
          </div>
          <div
            style={{
              font: '700 17px/1.25 "Bricolage Grotesque",sans-serif',
              letterSpacing: "-.02em",
              color: "#FFFFFF",
            }}
          >
            {n.title}
          </div>
          <div
            style={{
              marginTop: 8,
              font: "500 12px/1.5 Manrope,sans-serif",
              color: "rgba(255,255,255,0.7)",
            }}
          >
            {n.body}
          </div>
        </div>
      )}

      {/* Card Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 15px",
          borderTop: "1px solid rgba(255,255,255,.08)",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: n.dot,
          }}
        />
        <span style={{ font: "600 12px Manrope,sans-serif", color: "#FFFFFF" }}>
          {n.subject}
        </span>
        <span
          style={{
            marginLeft: "auto",
            font: "600 10px ui-monospace,monospace",
            color: "#FFFFFF",
          }}
        >
          {n.when}
        </span>
      </div>
    </div>
  );
}

function RecentListRow({ n, onOpen, onLongPress }) {
  const pressHandlers = useLongPress(() => onLongPress?.(n), onOpen);
  return (
    <div
      {...pressHandlers}
      className="lib-list-row"
      data-testid={`list-row-${n.id}`}
    >
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: n.dot,
          flexShrink: 0,
        }}
      />
      <div className="lib-list-title">{n.title}</div>
      <div className="lib-list-body">
        {n.body || n.tag || n.repo || n.source || ""}
      </div>
      <span className="lib-list-subject">{n.subject}</span>
      <span
        style={{
          font: "600 10px ui-monospace,monospace",
          color: "#FFFFFF",
          flexShrink: 0,
        }}
      >
        {n.when}
      </span>
    </div>
  );
}

// Calendar-chip look: tinted fill, 1px border and light text of one hue.
const UNTIS_COLORS = {
  yellow: { text: "#fff0b4", border: "rgba(245,195,40,.9)", bg: "rgba(235,175,20,.38)" },
  purple: { text: "#d8cbff", border: "rgba(160,130,255,.85)", bg: "rgba(120,90,255,.38)" },
  orange: { text: "#ffd0ae", border: "rgba(255,140,70,.85)", bg: "rgba(250,110,40,.36)" },
  red: { text: "#ffcdc8", border: "rgba(240,70,60,.9)", bg: "rgba(225,50,45,.38)" },
  blue: { text: "#d0e0ff", border: "rgba(50,100,255,.9)", bg: "rgba(30,70,230,.42)" },
  lightblue: { text: "#d8f4ff", border: "rgba(90,200,255,.9)", bg: "rgba(60,180,250,.34)" },
  black: { text: "rgba(255,255,255,.92)", border: "rgba(255,255,255,.3)", bg: "rgba(8,8,12,.55)" },
};
// Fixed colour per subject, matched on the short code and long name together.
// Order matters: "Seminar Profil Chemie" must hit seminar before chemie.
const UNTIS_SUBJECT_COLORS = [
  [/lernzeit|seminar|philosoph|kunst/i, "black"],
  [/mathe/i, "yellow"],
  [/chemie/i, "purple"],
  [/englisch/i, "orange"],
  [/spanisch|deutsch/i, "red"],
  [/pgw|politik/i, "blue"],
  [/wirtschaft/i, "lightblue"],
];
// Subjects without an assigned colour (Sport, Tutorium, ...) hash into hues nobody owns.
const UNTIS_FALLBACK_PALETTE = [
  { text: "#b4f0c8", border: "rgba(80,210,130,.8)", bg: "rgba(40,180,100,.34)" },
  { text: "#b4eef2", border: "rgba(70,200,210,.8)", bg: "rgba(30,170,190,.33)" },
  { text: "#ffc4de", border: "rgba(245,100,170,.85)", bg: "rgba(235,60,150,.36)" },
];
// Entfall: dashed outline on a dim fill, so it never reads as a red subject.
const UNTIS_CANCELLED = { text: "#ffc2bc", border: "rgba(255,90,79,.95)", bg: "rgba(255,70,60,.12)" };
const UNTIS_IRREGULAR = { text: "#ffe2a8", border: "rgba(240,180,50,.9)", bg: "rgba(235,160,30,.4)" };
const UNTIS_WEEKDAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const UNTIS_MONTHS_SHORT = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];

function untisSubjectColor(subject) {
  const text = `${subject?.name || ""} ${subject?.longname || ""}`;
  const hit = UNTIS_SUBJECT_COLORS.find(([pattern]) => pattern.test(text));
  if (hit) return UNTIS_COLORS[hit[1]];
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return UNTIS_FALLBACK_PALETTE[hash % UNTIS_FALLBACK_PALETTE.length];
}

function untisISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function untisDateKey(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function untisMinutes(hhmm) {
  return Math.floor(hhmm / 100) * 60 + (hhmm % 100);
}

// Real WebUntis-style grid: time axis on the left, Mo–Fr columns, lessons
// positioned by minute so overlapping courses (Kurse) can sit side by side.
// Times of the school day, used to draw an empty grid for weeks without data.
const UNTIS_DEFAULT_STARTS = [800, 920, 1050, 1220, 1340, 1500];
const UNTIS_DEFAULT_END = 1620;

function UntisWeekGrid({ lessons, monday, note }) {
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
  const todayKey = untisDateKey(new Date());

  const lessonsByDay = days.map((d) => {
    const key = untisDateKey(d);
    return lessons.filter((l) => String(l.date) === key).sort((a, b) => a.startTime - b.startTime);
  });
  const allLessons = lessonsByDay.flat();

  const startTimes = allLessons.length
    ? [...new Set(allLessons.map((l) => l.startTime))].sort((a, b) => a - b)
    : UNTIS_DEFAULT_STARTS;
  const minStart = allLessons.length ? Math.min(...allLessons.map((l) => untisMinutes(l.startTime))) : untisMinutes(UNTIS_DEFAULT_STARTS[0]);
  const maxEnd = allLessons.length ? Math.max(...allLessons.map((l) => untisMinutes(l.endTime))) : untisMinutes(UNTIS_DEFAULT_END);
  const total = maxEnd - minStart;
  // Only lesson starts, and never two labels closer than 20 min: end times just
  // repeated the next start a few pixels lower and made the axis unreadable.
  const axisTimes = [];
  for (const t of startTimes) {
    const last = axisTimes[axisTimes.length - 1];
    if (last === undefined || untisMinutes(t) - untisMinutes(last) >= 20) axisTimes.push(t);
  }
  if (!note && allLessons.length === 0) note = "Diese Woche keine Stunden.";

  // No subject = an event (Klausur, Kompakttag ...). It gets the full column
  // width under the lessons, labelled with its text, instead of a slot beside them.
  const isEvent = (l) => !l.su?.[0]?.name && !l.su?.[0]?.longname;

  // Untis lists Lernzeit once per room (9-14 parallel entries a day). Same
  // subject in the same slot becomes one group, drawn as a single block.
  const groupParallel = (dayLessons) => {
    const groups = new Map();
    for (const lesson of dayLessons) {
      const key = `${lesson.su?.[0]?.name}|${lesson.startTime}|${lesson.endTime}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(lesson);
    }
    return [...groups.values()];
  };

  // Cluster mutually overlapping groups per day so parallel courses split the column width.
  const clusteredByDay = lessonsByDay.map((dayLessons) => {
    const clusters = [];
    let current = [];
    let currentEnd = -Infinity;
    for (const group of groupParallel(dayLessons.filter((l) => !isEvent(l)))) {
      const start = untisMinutes(group[0].startTime);
      if (current.length && start >= currentEnd) {
        clusters.push(current);
        current = [];
        currentEnd = -Infinity;
      }
      current.push(group);
      currentEnd = Math.max(currentEnd, untisMinutes(group[0].endTime));
    }
    if (current.length) clusters.push(current);
    return [...dayLessons.filter(isEvent).map((l) => [[l]]), ...clusters];
  });

  return (
    <div className="untis-grid">
      {note && (
        <div style={{ color: "rgba(255,255,255,.6)", font: "500 12px Manrope,sans-serif", padding: "8px 10px" }}>{note}</div>
      )}
      <div className="untis-grid-head">
        <div />
        {days.map((d) => (
          <div
            key={untisDateKey(d)}
            className={`untis-day-head ${untisDateKey(d) === todayKey ? "is-today" : ""}`}
          >
            <span>{UNTIS_WEEKDAYS_SHORT[d.getDay()]}</span>
            <span>{d.getDate()}</span>
          </div>
        ))}
      </div>
      <div className="untis-grid-body">
        {/* Behind the columns: one hairline per axis label, so the same time
            lines up across all five days. */}
        <div className="untis-gridlines" aria-hidden="true">
          {axisTimes.map((t) => (
            <span key={t} style={{ top: `${((untisMinutes(t) - minStart) / total) * 100}%` }} />
          ))}
        </div>
        <div className="untis-time-axis">
          {axisTimes.map((t) => {
            const top = `${((untisMinutes(t) - minStart) / total) * 100}%`;
            const label = String(t).padStart(4, "0");
            return (
              <div key={t} className="untis-time-mark" style={{ top }}>
                {label.slice(0, 2)}:{label.slice(2)}
              </div>
            );
          })}
        </div>
        {clusteredByDay.map((clusters, dayIndex) => (
          <div key={dayIndex} className={`untis-day-col ${untisDateKey(days[dayIndex]) === todayKey ? "is-today" : ""}`}>
            {clusters.map((cluster) =>
              cluster.map((group, slotIndex) => {
                // Struck-out copies (a room that falls away) do not count; the
                // block is Entfall only when every copy is.
                const live = group.filter((l) => !isLessonCancelled(l));
                const lesson = live[0] || group[0];
                const start = untisMinutes(lesson.startTime);
                const end = untisMinutes(lesson.endTime);
                const top = `${((start - minStart) / total) * 100}%`;
                const height = `calc(${((end - start) / total) * 100}% - 2px)`;
                const width = 100 / cluster.length;
                const left = slotIndex * width;
                // Parallel courses only get half a column, where a long name is
                // all ellipsis anyway — fall back to WebUntis' short code there.
                const subject =
                  (cluster.length > 1
                    ? lesson.su?.[0]?.name || lesson.su?.[0]?.longname
                    : lesson.su?.[0]?.longname || lesson.su?.[0]?.name) ||
                  lesson.lstext ||
                  lesson.substText ||
                  "—";
                const roomOf = (l) => l.ro?.[0]?.name || "";
                const room = live.length > 1 ? `${live.length} Räume` : roomOf(lesson);
                const cancelled = live.length === 0;
                const irregular = lesson.code === "irregular";
                const color = cancelled
                  ? UNTIS_CANCELLED
                  : irregular
                  ? UNTIS_IRREGULAR
                  : untisSubjectColor(lesson.su?.[0]);
                return (
                  <div
                    key={lesson.id}
                    className={`untis-lesson ${cancelled ? "is-cancelled" : ""} ${isEvent(lesson) ? "is-event" : ""}`}
                    style={{
                      top,
                      height,
                      left: `calc(${left}% + 2px)`,
                      width: `calc(${width}% - 4px)`,
                      color: color.text,
                      borderColor: color.border,
                      // Soft colour bloom in the top-left corner over the tint: reads as blurred glass.
                      background: `radial-gradient(130% 100% at 15% 0%, ${color.border}, transparent 72%), ${color.bg}`,
                    }}
                    title={`${subject}${room ? " · " + (live.length > 1 ? live.map(roomOf).join(", ") : room) : ""}${cancelled ? " · Entfall" : ""}`}
                  >
                    <span className="untis-lesson-subject">{subject}</span>
                    {cancelled ? (
                      <span className="untis-lesson-entfall">Entfall</span>
                    ) : (
                      room && <span className="untis-lesson-room">{room}</span>
                    )}
                  </div>
                );
              }),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Library({
  onOpenNote,
  onOpenSettings,
  onOpenCalendar,
  onOpenGlossary,
  documentLibraryOptions,
}) {
  const documentLibrary = useDocumentLibrary(documentLibraryOptions);
  const fileInputRef = useRef(null);
  const bookInputRef = useRef(null);
  const dragDepthRef = useRef(0);
  const [isFileDragActive, setIsFileDragActive] = useState(false);

  // One document per file, so a stack of scanned book pages lands as separate
  // sources in the open folder. Only a single file is opened right away.
  const runImport = async (files, { book = false } = {}) => {
    const list = Array.from(files || []);
    let note = null;
    for (const file of list) {
      note = await documentLibrary.importFiles([file], selectedSubject?.name || "", { book });
    }
    if (list.length === 1 && note && !book) onOpenNote?.(note);
  };

  // Textbooks: PDF only, shown on the open folder's shelf instead of the grid.
  const importBook = () =>
    iservAvailable
      ? pickLocalFiles().then(
          (files) => runImport(files, { book: true }),
          (error) => console.error("Datei-Auswahl fehlgeschlagen", error),
        )
      : bookInputRef.current?.click();

  const [iservOpen, setIservOpen] = useState(false);

  const [selectedSubject, setSelectedSubject] = useState(null); // null = all subjects
  const [viewMode, setViewMode] = useState("masonry"); // 'masonry' | 'list'
  const [sortBy, setSortBy] = useState("recent"); // 'recent' | 'title' | 'subject'
  const [searchQuery, setSearchQuery] = useState("");
  const [isMicActive, setIsMicActive] = useState(false);
  const [isNewDocDialogOpen, setIsNewDocDialogOpen] = useState(false);
  const [sortToast, setSortToast] = useState(null);
  const [agentOpen, setAgentOpen] = useState(false);
  // Below the "lg" tier the Anstehend/Stundenplan column has no room beside
  // the cards; the clock button in the rail slides it over them instead.
  const [overviewPeek, setOverviewPeek] = useState(false);
  const [detailNote, setDetailNote] = useState(null);
  const [folderDialog, setFolderDialog] = useState(null); // null | { mode: "create", parentId } | { mode: "rename", folder }
  const toastTimeoutRef = useRef(null);
  const liquidGlassRootRef = useRef(null);
  const tier = useWidthTier(liquidGlassRootRef);
  const overviewDocked = tier === "lg";
  const agentScrollRef = useRef(null);
  const agentDropRef = useRef(null);
  const pillDragRef = useRef(null);

  // Pulling the Ask-AI pill down grows the agent panel out of it live, like
  // pulling a drop into the full window — tracked 1:1 with the finger via
  // a CSS var (--drop) written straight to the DOM, no re-render per frame.
  // Pointer capture keeps the gesture even once the panel's growth carries
  // the pointer over other elements; without it a fast drag loses the
  // pointerup/move to whatever now sits under the finger.
  const DROP_COMMIT_PX = 120;

  const onPillPointerDown = (event) => {
    if (agentOpen) return;
    // Capture is best-effort — a rejected pointerId must not stop the drag
    // itself from being tracked below.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // no active pointer with this id yet — track it via move/up anyway.
    }
    pillDragRef.current = event.clientY;
    if (agentDropRef.current) agentDropRef.current.style.transition = "none";
  };
  const onPillPointerMove = (event) => {
    if (agentOpen || pillDragRef.current == null) return;
    const dy = Math.max(0, event.clientY - pillDragRef.current);
    agentDropRef.current?.style.setProperty(
      "--drop",
      String(Math.min(1, dy / DROP_COMMIT_PX)),
    );
  };
  const onPillPointerUp = (event) => {
    if (agentOpen || pillDragRef.current == null) return;
    const dy = Math.max(0, event.clientY - pillDragRef.current);
    pillDragRef.current = null;
    if (agentDropRef.current) {
      agentDropRef.current.style.transition = "";
      agentDropRef.current.style.removeProperty("--drop");
    }
    if (dy > DROP_COMMIT_PX * 0.4) setAgentOpen(true);
  };

  const [agentModel, setAgentModel] = useState(() => loadChatModel());
  const agent = useAgent({
    documentId: "library",
    noteTitle: selectedSubject?.name,
    subject: selectedSubject?.name,
    model: agentModel,
    library: true,
  });
  const agentDisplayedTokens = useCountUp(agent.tokens);

  useEffect(() => {
    const node = agentScrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [agent.messages, agent.steps, agent.isRunning]);

  // Card previews with an image/fill object draw blank on the first pass
  // (the src decodes async - see notePreview.js) - this re-renders once any
  // of those decodes finish, so the thumbnail picks it up from cache.
  const [, setPreviewVersion] = useState(0);
  useEffect(
    () => subscribeToPreviewImages(() => setPreviewVersion((v) => v + 1)),
    [],
  );

  const [untisMissing, setUntisMissing] = useState(false);
  const [untisCreds, setUntisCreds] = useState(null);
  const [untisWeekOffset, setUntisWeekOffset] = useState(0);
  // Every loaded week, keyed by its Monday: lessons, or null when Untis refused
  // it and nothing is archived. Loaded once up front, so swiping is instant.
  const [untisWeeks, setUntisWeeks] = useState({});
  const untisInflight = useRef(new Set());

  function loadUntisWeek(creds, offset) {
    const monday = untisMonday(offset);
    const key = untisDateNumber(monday);
    if (untisInflight.current.has(key)) return;
    untisInflight.current.add(key);
    fetchUntisWeek(creds, monday)
      .catch(() => loadArchivedWeek(monday))
      .then((lessons) => setUntisWeeks((w) => ({ ...w, [key]: lessons || null })));
  }

  useEffect(() => {
    let cancelled = false;
    loadUntisCredentials().then((creds) => {
      if (cancelled) return;
      if (!creds?.school || !creds?.server || !creds?.username || !creds?.password) {
        setUntisMissing(true);
        return;
      }
      setUntisCreds(creds);
      // Current week first, then last week (Untis locks it soon - archive it
      // while it is still served) and the weeks Untis lets us see ahead.
      for (const offset of [0, -1, 1, 2, 3, 4]) loadUntisWeek(creds, offset);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Anything not covered by the initial load (older weeks) is fetched once on demand.
  useEffect(() => {
    if (!untisCreds) return;
    const monday = untisMonday(untisWeekOffset);
    if (untisWeeks[untisDateNumber(monday)] === undefined && !loadArchivedWeek(monday)) {
      loadUntisWeek(untisCreds, untisWeekOffset);
    }
  }, [untisCreds, untisWeekOffset, untisWeeks]);

  // undefined = still loading, null = Untis refused and nothing archived.
  const loadedWeek = untisWeeks[untisDateNumber(untisMonday(untisWeekOffset))];
  const untisWeekLessons =
    loadedWeek !== undefined
      ? loadedWeek
      : (untisWeekOffset < 0 && loadArchivedWeek(untisMonday(untisWeekOffset))) || undefined;
  const untisLessons = untisWeekLessons || [];
  const untisStatus = untisMissing
    ? "missing"
    : untisWeekLessons
    ? "ready"
    : untisWeekLessons === null
    ? "error"
    : "loading";
  const untisError =
    untisWeekOffset < 0
      ? "Für diese Woche ist nichts gespeichert. Gespeichert wird ab jetzt."
      : untisWeekOffset > 0
      ? "Untis gibt diese Woche noch nicht frei."
      : "Stundenplan konnte nicht geladen werden.";

  // Horizontal swipe on the week grid steps through weeks (back up to ~6 months).
  const stepUntisWeek = (delta) => setUntisWeekOffset((o) => Math.max(-UNTIS_MAX_WEEKS_BACK, o + delta));
  const untisSwipeRef = useRef(null);
  const untisSwipe = {
    onPointerDown: (e) => {
      untisSwipeRef.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e) => {
      const start = untisSwipeRef.current;
      untisSwipeRef.current = null;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      stepUntisWeek(dx < 0 ? 1 : -1);
    },
    onPointerCancel: () => {
      untisSwipeRef.current = null;
    },
  };

  useLiquidGlass(liquidGlassRootRef, selectedSubject?.id || "all");

  const newNoteRef = useRef(null);
  const [newNoteWidth, setNewNoteWidth] = useState(0);
  const fileOpenRef = useRef(null);
  const [fileOpenWidth, setFileOpenWidth] = useState(0);

  const showToast = (msg) => {
    setSortToast(msg);
    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setSortToast(null), 1600);
  };

  const askAgent = (text) => {
    const q = text.trim();
    if (!q) return;
    setAgentOpen(true);
    setSearchQuery("");
    agent.send(q);
  };

  const handleOpenFolder = (folder) => setSelectedSubject(folder);

  // Android back: close the topmost overlay, else step up one folder level.
  const goUpFolder = () =>
    setSelectedSubject(
      browserFolderRepository.listFolders().find((f) => f.id === selectedSubject.parentId) || null,
    );
  useBackHandler(selectedSubject !== null, goUpFolder);
  useBackHandler(Boolean(detailNote), () => setDetailNote(null));
  useBackHandler(agentOpen && !detailNote, () => setAgentOpen(false));
  useBackHandler(overviewPeek && !overviewDocked && !agentOpen && !detailNote, () => setOverviewPeek(false));
  useBackHandler(isNewDocDialogOpen, () => setIsNewDocDialogOpen(false));
  useBackHandler(iservOpen, () => setIservOpen(false));
  useBackHandler(folderDialog !== null, () => setFolderDialog(null));

  const handleCreateFolder = ({ name, color, icon, image, description }, parentId) => {
    const created = browserFolderRepository.createFolder({ name, color, icon, image, parentId });
    if (description) browserCardRepository.setManual(created.id, description);
    setFolderDialog(null);
  };

  const handleRenameFolder = (folder, { name, color, icon, image, description }) => {
    const updated = browserFolderRepository.renameFolder(folder.id, { name, color, icon, image });
    browserCardRepository.setManual(folder.id, description);
    // Notes are matched to a folder by subject name (see matchesFolder), so a
    // rename must carry existing notes along or they'd silently fall out of
    // the folder.
    if (name && name !== folder.name) {
      knowledgeNotes
        .filter((n) => matchesFolder(n, folder))
        .forEach((n) => browserNoteRepository.saveNote({ id: n.id, subject: name }));
    }
    setSelectedSubject(updated);
    setFolderDialog(null);
  };

  const handleDeleteFolder = (folder) => {
    const count = countInFolder(folder, knowledgeNotes);
    const message =
      count > 0
        ? `Ordner "${folder.name}" und ${count} ${count === 1 ? "Notiz" : "Notizen"} werden endgültig gelöscht. Fortfahren?`
        : `Ordner "${folder.name}" wirklich löschen?`;
    if (!globalThis.confirm(message)) return;
    knowledgeNotes
      .filter((n) => matchesFolder(n, folder))
      .forEach((n) => browserNoteRepository.removeNote(n.id));
    browserCardRepository.remove(browserFolderRepository.removeFolder(folder.id));
    setSelectedSubject(null);
  };

  const cycleSort = () => {
    if (sortBy === "recent") {
      setSortBy("title");
      showToast("Sortierung: Titel (A–Z)");
    } else if (sortBy === "title") {
      setSortBy("subject");
      showToast("Sortierung: Nach Fach");
    } else {
      setSortBy("recent");
      showToast("Sortierung: Zuletzt bearbeitet");
    }
  };

  const importedCards = (documentLibrary.importedNotes || []).map((note) => ({
    ...note,
    type: "imported-document",
    dot: "#8AD4FF",
    when: "importiert",
    body: `${note.pages?.length || 1} ${(note.pages?.length || 1) === 1 ? "Seite" : "Seiten"} · ${note.source?.type === "pdf" ? "PDF" : "Bild"}`,
  }));
  const knowledgeNotes = browserNoteRepository.listNotes();
  const folders = browserFolderRepository.listFolders();
  const rootFolders = folders.filter((f) => !f.parentId);
  const subFolders = selectedSubject
    ? folders.filter((f) => f.parentId === selectedSubject.id)
    : [];
  const createdCards = knowledgeNotes.map((note) => ({
    ...note,
    type: "canvas-preview",
    dot: dotForSubject(note.subject),
    when: formatRelativeWhen(note.updatedAt),
    preview: renderNotePreviewDataUrl(note.id),
    pageStyle: notePageStyleOf(note.id),
    body:
      previewTextOf(note.id) ||
      (note.pageKind === "whiteboard" ? "Whiteboard" : "Notiz"),
  }));
  const untisSubjects = [...new Set(untisLessons.map((lesson) => lesson.subject).filter(Boolean))];
  const sourceNoteTitles = {
    ...Object.fromEntries(
      knowledgeNotes
        .filter((note) => note.id && note.title)
        .map((note) => [note.id, note.title]),
    ),
    iserv: "IServ",
  };
  const knowledge = useKnowledge({ notes: knowledgeNotes, subjects: untisSubjects, syncIserv });
  // Textbooks live on their folder shelf, not in the note grid or counts.
  const allNotes = [...importedCards.filter((n) => !n.book), ...createdCards];
  const folderBooks = selectedSubject
    ? importedCards.filter((n) => n.book && matchesFolder(n, selectedSubject))
    : [];

  // Filter notes by selected subject and search query
  const filteredNotes = allNotes.filter((n) => {
    const matchesSubject = !selectedSubject || matchesFolder(n, selectedSubject);
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (n.title && n.title.toLowerCase().includes(q)) ||
      (n.body && n.body.toLowerCase().includes(q)) ||
      (n.tag && n.tag.toLowerCase().includes(q)) ||
      (n.subject && n.subject.toLowerCase().includes(q));
    return matchesSubject && matchesSearch;
  });

  const sortedRecent = [...filteredNotes].sort((a, b) => {
    if (sortBy === "title") return (a.title || "").localeCompare(b.title || "");
    if (sortBy === "subject")
      return (a.subject || "").localeCompare(b.subject || "");
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  // Dynamic Background Gradient depending on selected subject - Deep almost-black tones with reeded glass
  const bgGradient =
    selectedSubject?.id === "mathe"
      ? "radial-gradient(820px 480px at 15% -4%,oklch(0.35 0.08 258/.45),transparent 68%),radial-gradient(640px 480px at 90% 12%,oklch(0.28 0.06 240/.3),transparent 65%)"
      : selectedSubject?.id === "chemie"
        ? "radial-gradient(820px 480px at 15% -4%,oklch(0.35 0.07 160/.45),transparent 68%),radial-gradient(640px 480px at 90% 12%,oklch(0.28 0.05 180/.3),transparent 65%)"
        : selectedSubject?.id === "kunst"
          ? "radial-gradient(820px 480px at 15% -4%,oklch(0.35 0.085 330/.45),transparent 68%),radial-gradient(640px 480px at 90% 12%,oklch(0.28 0.07 280/.3),transparent 65%)"
          : selectedSubject?.id === "pgw"
            ? "radial-gradient(820px 480px at 15% -4%,oklch(0.32 0.075 320/.45),transparent 68%),radial-gradient(640px 480px at 90% 12%,oklch(0.28 0.06 300/.3),transparent 65%)"
            : selectedSubject?.id === "philosophie"
              ? "radial-gradient(820px 480px at 15% -4%,oklch(0.32 0.05 78/.4),transparent 68%),radial-gradient(640px 480px at 90% 12%,oklch(0.26 0.04 60/.3),transparent 65%)"
              : selectedSubject?.id === "englisch"
                ? "radial-gradient(820px 480px at 15% -4%,oklch(0.32 0.07 26/.45),transparent 68%),radial-gradient(640px 480px at 90% 12%,oklch(0.26 0.05 10/.3),transparent 65%)"
                : selectedSubject?.id === "spanisch"
                  ? "radial-gradient(820px 480px at 15% -4%,oklch(0.33 0.08 55/.45),transparent 68%),radial-gradient(640px 480px at 90% 12%,oklch(0.26 0.06 40/.3),transparent 65%)"
                  : "radial-gradient(720px 420px at 10% -6%,oklch(0.32 0.055 260/.35),transparent 66%),radial-gradient(620px 460px at 94% 6%,oklch(0.3 0.045 200/.25),transparent 64%)";

  const theme =
    (selectedSubject && SUBJECT_THEMES[selectedSubject.id]) || DEFAULT_THEME;

  // "Neue {Fach}-Notiz" is wider than "Neue Notiz" — measure it so the
  // view/sort pill (right-anchored, same as this button) doesn't overlap it.
  useLayoutEffect(() => {
    if (newNoteRef.current) setNewNoteWidth(newNoteRef.current.offsetWidth);
    if (fileOpenRef.current) setFileOpenWidth(fileOpenRef.current.offsetWidth);
    const observer = new ResizeObserver(() => {
      if (newNoteRef.current) setNewNoteWidth(newNoteRef.current.offsetWidth);
      if (fileOpenRef.current) setFileOpenWidth(fileOpenRef.current.offsetWidth);
    });
    [newNoteRef.current, fileOpenRef.current].forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [selectedSubject]);

  return (
    <div
      ref={liquidGlassRootRef}
      className="lib-root"
      data-tier={tier}
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "transparent",
        fontFamily: "Manrope,sans-serif",
        color: "#FFFFFF",
        "--subj-accent": theme.accent,
        "--subj-accent-soft": theme.accentSoft,
      }}
      data-subject={selectedSubject?.id || "all"}
      data-testid="liquid-glass-root"
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepthRef.current += 1;
        setIsFileDragActive(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepthRef.current -= 1;
        if (dragDepthRef.current <= 0) {
          dragDepthRef.current = 0;
          setIsFileDragActive(false);
        }
      }}
      onDrop={async (e) => {
        e.preventDefault();
        dragDepthRef.current = 0;
        setIsFileDragActive(false);
        if (e.dataTransfer?.files?.length) {
          await runImport(e.dataTransfer.files);
        }
      }}
    >
      <img className="liquid-glass-scene-image" src={reededGlassBackground} alt="" />
      <div className="liquid-glass-scene" aria-hidden="true" />

      {/* 2. Dynamic Thematic Ambient Lighting overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: bgGradient,
          opacity: 0.55,
          mixBlendMode: "soft-light",
          transition: "background 0.4s ease",
          pointerEvents: "none",
        }}
      />

      {/* sidebar rail */}
      <div
        className="lib-glass liquid-control liquid-control-navigation"
        data-liquid-glass-control="navigation"
        data-config={JSON.stringify({ cornerRadius: 30, zRadius: 24 })}
        style={{
          position: "absolute",
          left: 20,
          top: 20,
          bottom: 20,
          width: 72,
          borderRadius: 30,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "16px 0",
          gap: 6,
          zIndex: 20,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            background: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#08080A",
            font: '800 15px "Bricolage Grotesque",sans-serif',
            marginBottom: 10,
          }}
        >
          N
        </div>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 15,
            background: "rgba(255,255,255,.22)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFFFFF",
            boxShadow: "inset 0 1px 1px rgba(255,255,255,0.4)",
          }}
        >
          <LayoutGrid size={19} />
        </div>
        <button
          type="button"
          className="lib-overview-btn"
          data-active={!overviewDocked && overviewPeek}
          onClick={() => setOverviewPeek((open) => !open)}
          title="Anstehend & Stundenplan"
          aria-label="Anstehend und Stundenplan"
          style={{
            width: 44,
            height: 44,
            borderRadius: 15,
            border: "none",
            background: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFFFFF",
            cursor: "pointer",
          }}
        >
          <Clock size={19} />
        </button>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 15,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFFFFF",
            cursor: "pointer",
          }}
        >
          <Star size={19} />
        </div>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 15,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFFFFF",
            cursor: "pointer",
          }}
        >
          <Tag size={19} />
        </div>
        <button
          type="button"
          onClick={onOpenCalendar}
          className="lib-plan-btn"
          title="Kalender"
          aria-label="Kalender öffnen"
          data-testid="open-calendar-btn"
          style={{
            marginTop: "auto",
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
            transition: "background-color 0.15s, color 0.15s",
          }}
        >
          <CalendarDays size={19} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onOpenGlossary}
          className="lib-plan-btn"
          title="Glossar"
          aria-label="Glossar öffnen"
          data-testid="open-glossary-btn"
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
            transition: "background-color 0.15s, color 0.15s",
          }}
        >
          <BookOpen size={19} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
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
          className="lib-settings-btn"
          title="Einstellungen"
          aria-label="Einstellungen öffnen"
          data-testid="settings-nav-btn"
        >
          <Settings size={20} aria-hidden="true" />
        </button>
      </div>

      {/* Liquid Glass Search & AI Capsule + Standalone Circle Button (Exact Image 1 Style) */}
      {/* Main Liquid Glass Pill */}
      {/* Same field the chat uses to prompt — it just relocates to the bottom
          of the chat column once the panel is open, same element throughout. */}
      <div
        className="liquid-glass-pill liquid-control liquid-control-search"
        data-liquid-glass-control="search"
        data-config={JSON.stringify({ cornerRadius: 26, zRadius: 24 })}
        data-agent-open={agentOpen}
        style={{
          position: "absolute",
          left: "var(--lib-left)",
          top: agentOpen ? "auto" : "calc(20px + env(safe-area-inset-top, 0px))",
          bottom: agentOpen ? 20 : "auto",
          zIndex: 30,
          height: 52,
          width: 440,
          // never run under the right-hand button cluster (view-sort pill ≈140px wide)
          maxWidth: agentOpen ? undefined : `calc(100% - var(--lib-left) - ${24 + newNoteWidth + 14 + fileOpenWidth + 14 + ISERV_BUTTON_SIZE + 14 + 140 + 14}px)`,
          padding: "0 20px 0 16px",
          gap: 12,
          cursor: "text",
          touchAction: "none",
          transition:
            "top 0.42s cubic-bezier(0.16, 1, 0.3, 1), bottom 0.42s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onPointerDown={onPillPointerDown}
        onPointerMove={onPillPointerMove}
        onPointerUp={onPillPointerUp}
        onPointerCancel={onPillPointerUp}
      >
        <button
          onClick={() => setIsNewDocDialogOpen(true)}
          style={{
            background: "none",
            border: "none",
            color: "#FFFFFF",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
          title="Neue Notiz erstellen"
        >
          <Plus size={20} strokeWidth={2.4} />
        </button>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") askAgent(searchQuery);
          }}
          placeholder={
            agentOpen
              ? selectedSubject
                ? `Auftrag für ${selectedSubject.name}…`
                : "Auftrag an den Agenten…"
              : selectedSubject
                ? `Ask AI zu ${selectedSubject.name}…`
                : "Ask AI"
          }
          data-testid="ask-ai-input"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#FFFFFF",
            font: "500 15px/1 Manrope, -apple-system, sans-serif",
            letterSpacing: "-0.01em",
            caretColor: theme.accent,
          }}
        />

        {agent.isRunning && (
          <button
            onClick={agent.stop}
            data-testid="agent-stop-btn"
            title="Agent stoppen"
            style={{
              background: "none",
              border: "none",
              color: "#FFFFFF",
              padding: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Square size={16} strokeWidth={2.4} fill="currentColor" />
          </button>
        )}

        {/* Microphone Icon */}
        <button
          onClick={() => {
            const nextState = !isMicActive;
            setIsMicActive(nextState);
            showToast(
              nextState
                ? "Sprachassistent aktiv — Sprich jetzt…"
                : "Spracheingabe beendet",
            );
          }}
          style={{
            background: "none",
            border: "none",
            color: isMicActive ? "#30d158" : "#FFFFFF",
            padding: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          title="Spracheingabe"
        >
          <Mic size={18} strokeWidth={2} />
        </button>
      </div>

      {/* view toggle + new note (right aligned) */}
      <div
        className="liquid-glass-pill liquid-control liquid-control-view-sort"
        data-liquid-glass-control="view-sort"
        data-config={JSON.stringify({ cornerRadius: 26, zRadius: 24 })}
        style={{
          position: "absolute",
          right: 24 + newNoteWidth + 14 + fileOpenWidth + 14 + ISERV_BUTTON_SIZE + 14,
          top: 20,
          zIndex: 15,
          height: 52,
          padding: "0 6px",
          gap: 2,
        }}
      >
        <button
          className={`lib-view-btn ${viewMode === "masonry" ? "active" : ""}`}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            background:
              viewMode === "masonry" ? "rgba(255,255,255,.24)" : "transparent",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFFFFF",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onClick={() => setViewMode("masonry")}
          title="Masonry-Rasteransicht"
          data-testid="view-masonry-btn"
        >
          <LayoutGrid size={17} />
        </button>
        <button
          className={`lib-view-btn ${viewMode === "list" ? "active" : ""}`}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            background:
              viewMode === "list" ? "rgba(255,255,255,.24)" : "transparent",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFFFFF",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onClick={() => setViewMode("list")}
          title="Listenansicht"
          data-testid="view-list-btn"
        >
          <Rows3 size={17} />
        </button>
        <button
          className="lib-view-btn"
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            background: "transparent",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFFFFF",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onClick={cycleSort}
          title="Sortieren"
          data-testid="view-sort-btn"
        >
          <ArrowUpDown size={17} />
        </button>
      </div>

      <div
        ref={newNoteRef}
        onClick={() => setIsNewDocDialogOpen(true)}
        className="liquid-glass-pill lib-newnote"
        title={selectedSubject ? `Neue ${selectedSubject.name}-Notiz` : "Neue Notiz"}
        style={{
          position: "absolute",
          right: 24,
          top: 20,
          zIndex: 15,
          height: 52,
          padding: "0 22px 0 18px",
          gap: 10,
          background: selectedSubject ? theme.accent : "#FFFFFF",
          color: "#08080A",
          cursor: "pointer",
          border: "none",
          boxShadow: selectedSubject
            ? `0 18px 44px -12px ${theme.accentSoft}, 0 0 0 1px ${theme.accentSoft}`
            : "0 20px 48px -12px rgba(0,0,0,0.95)",
          transition: "background 0.35s ease, box-shadow 0.35s ease",
        }}
        data-testid="new-note-btn"
      >
        <PenLine size={17} />
        <span
          className="lib-btn-label"
          style={{
            font: '700 13px "Bricolage Grotesque",sans-serif',
            whiteSpace: "nowrap",
          }}
        >
          {selectedSubject
            ? `Neue ${selectedSubject.name}-Notiz`
            : "Neue Notiz"}
        </span>
      </div>

      {/* File Open / Import Button */}
      <button
        ref={fileOpenRef}
        type="button"
        className="liquid-glass-pill lib-file-open"
        onClick={() =>
          iservAvailable
            ? pickLocalFiles().then(runImport, (error) => console.error("Datei-Auswahl fehlgeschlagen", error))
            : fileInputRef.current?.click()
        }
        disabled={documentLibrary.isImporting}
        aria-label={
          documentLibrary.isImporting ? "Datei wird importiert" : "Datei öffnen"
        }
        style={{
          position: "absolute",
          right: 24 + newNoteWidth + 14,
          top: 20,
          zIndex: 15,
          height: 52,
          padding: "0 18px",
          gap: 8,
          display: "inline-flex",
          alignItems: "center",
          cursor: documentLibrary.isImporting ? "not-allowed" : "pointer",
        }}
      >
        <FileUp size={17} />
        <span
          className="lib-btn-label"
          style={{
            font: '700 13px "Bricolage Grotesque",sans-serif',
            whiteSpace: "nowrap",
          }}
        >
          {documentLibrary.isImporting ? "Wird importiert…" : "Datei öffnen"}
        </span>
      </button>
      {/* IServ: eigener Browser im gemerkten IServ-Ordner (Gruppen). */}
      <button
        type="button"
        className="liquid-glass-pill lib-file-open lib-iserv"
        onClick={() => setIservOpen(true)}
        disabled={documentLibrary.isImporting}
        aria-label="Aus IServ öffnen"
        style={{
          position: "absolute",
          right: 24 + newNoteWidth + 14 + fileOpenWidth + 14,
          top: 20,
          zIndex: 15,
          width: ISERV_BUTTON_SIZE,
          height: ISERV_BUTTON_SIZE,
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden", // the round edge cuts the logo's bar
        }}
      >
        <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
          <circle cx="15" cy="38" r="4" fill="#fff" />
          <circle cx="26" cy="38" r="4" fill="#fff" />
          <rect x="34" y="34" width="22" height="8" rx="4" fill="#fff" />
        </svg>
      </button>
      {iservOpen && iservAvailable && (
        <IservBrowser
          onImport={runImport}
          onClose={() => setIservOpen(false)}
        />
      )}
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        aria-label="Datei öffnen"
        data-testid="file-import-input"
        multiple
        accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
        onChange={async (event) => {
          await runImport(event.target.files);
          event.target.value = "";
        }}
      />

      <input
        ref={bookInputRef}
        className="visually-hidden"
        type="file"
        aria-label="Schulbuch importieren"
        data-testid="book-import-input"
        multiple
        accept="application/pdf,.pdf"
        onChange={async (event) => {
          await runImport(event.target.files, { book: true });
          event.target.value = "";
        }}
      />

      {/* Sort Toast */}
      {sortToast && (
        <div
          className="liquid-glass-pill"
          style={{
            position: "fixed",
            top: 84,
            right: 24,
            padding: "8px 18px",
            color: "#FFFFFF",
            font: "600 12px Manrope,sans-serif",
            display: "flex",
            alignItems: "center",
            gap: 8,
            zIndex: 1000,
          }}
          data-testid="sort-toast"
        >
          <ArrowUpDown size={14} color={theme.accent} />
          <span>{sortToast}</span>
        </div>
      )}

      {/* File Drop Overlay */}
      {isFileDragActive && (
        <div
          className="library-file-drop-overlay"
          data-testid="library-drop-overlay"
        >
          <div className="library-file-drop-content">
            <FileUp size={40} />
            <span
              style={{ font: '700 20px "Bricolage Grotesque", sans-serif' }}
            >
              Datei hier ablegen
            </span>
          </div>
        </div>
      )}

      {/* Import Error Alert */}
      {documentLibrary.error && (
        <div
          role="alert"
          className="library-import-alert"
          style={{
            position: "fixed",
            top: 84,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "10px 20px",
            background: "rgba(255, 69, 58, 0.95)",
            backdropFilter: "blur(20px)",
            borderRadius: 16,
            color: "#FFFFFF",
            font: "600 13px Manrope, sans-serif",
            display: "flex",
            alignItems: "center",
            gap: 12,
            zIndex: 9999,
            boxShadow: "0 12px 32px rgba(0,0,0,0.8)",
          }}
        >
          <span>{documentLibrary.error.message || "Fehler beim Import"}</span>
          <button
            type="button"
            onClick={documentLibrary.clearError}
            style={{
              background: "none",
              border: "none",
              color: "#FFFFFF",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              padding: 0,
            }}
            title="Schließen"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* main content */}
      <div
        className="lib-scroll"
        style={{
          position: "absolute",
          left: "var(--lib-content-left)",
          top: "var(--lib-top)",
          right: 0,
          bottom: 20,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "10px 14px 24px 10px",
          transition: "left 0.42s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {!selectedSubject && (
          <>
            {/* Header: Library Title */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 15,
                margin: "0 0 18px",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  font: '800 46px/.92 "Bricolage Grotesque",sans-serif',
                  letterSpacing: "-.035em",
                  color: "#FFFFFF",
                }}
              >
                Bibliothek
              </h2>
              <span
                style={{
                  font: "600 10.5px ui-monospace,monospace",
                  letterSpacing: ".11em",
                  color: "#FFFFFF",
                  paddingBottom: 8,
                }}
              >
                {rootFolders.length} ORDNER ·{" "}
                {rootFolders.reduce((a, f) => a + countInFolder(f, allNotes), 0)} NOTIZEN
              </span>
              <button
                type="button"
                className="lib-add-folder"
                onClick={() => setFolderDialog({ mode: "create", parentId: null })}
                aria-label="Neuer Ordner"
                title="Neuer Ordner"
              >
                <Plus size={18} />
              </button>
            </div>

            {/* Folders horizontal selector row */}
            <div
              className="lib-tile-row"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 18,
                margin: "0 0 28px",
                padding: "6px 4px 6px 0",
              }}
            >
              {rootFolders.map((folder) => (
                <FolderCard
                  key={folder.id}
                  name={folder.name}
                  count={countInFolder(folder, allNotes)}
                  image={SUBJECT_CARD_IMAGES[folder.id] || folder.image}
                  color={SUBJECTS.find((x) => x.id === folder.id)?.themeColor || folder.color}
                  previews={previewsInFolder(folder, allNotes)}
                  testId={SUBJECT_THEMES[folder.id] ? `subject-tile-${folder.id}` : `folder-tile-${folder.id}`}
                  onOpen={() => handleOpenFolder(folder)}
                />
              ))}
            </div>
          </>
        )}

        {selectedSubject && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              margin: "0 0 18px",
            }}
          >
            <button
              onClick={goUpFolder}
              title="Zurück"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(255,255,255,.06)",
                color: "#FFFFFF",
                cursor: "pointer",
              }}
            >
              <ArrowLeft size={18} />
            </button>
            <h2
              style={{
                margin: 0,
                font: '800 34px/.92 "Bricolage Grotesque",sans-serif',
                letterSpacing: "-.035em",
                color: "#FFFFFF",
              }}
            >
              {selectedSubject.name}
            </h2>
            <button
              onClick={() => setFolderDialog({ mode: "rename", folder: selectedSubject })}
              title="Ordner umbenennen"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                height: 34,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,.15)",
                background: "transparent",
                color: "#FFFFFF",
                cursor: "pointer",
              }}
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={() => handleDeleteFolder(selectedSubject)}
              title="Ordner löschen"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                height: 34,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,.15)",
                background: "transparent",
                color: "#FF6B6B",
                cursor: "pointer",
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}

        {selectedSubject && (
          <div
            className="lib-tile-row"
            style={{
              display: "flex",
              flexWrap: "nowrap",
              overflowX: "auto",
              gap: 18,
              margin: "0 0 20px",
              padding: "6px 4px 6px 0",
              zoom: 0.7,
            }}
          >
            {subFolders.map((folder) => (
              <FolderCard
                key={folder.id}
                name={folder.name}
                count={countInFolder(folder, allNotes)}
                image={folder.image}
                color={folder.color}
                previews={previewsInFolder(folder, allNotes)}
                testId={`folder-tile-${folder.id}`}
                onOpen={() => handleOpenFolder(folder)}
              />
            ))}
            <button
              type="button"
              className="lib-add-folder"
              style={{ flex: "none", alignSelf: "center", width: 64, height: 64 }}
              onClick={() => setFolderDialog({ mode: "create", parentId: selectedSubject.id })}
              aria-label="Neuer Ordner"
              title="Neuer Ordner"
            >
              <Plus size={36} />
            </button>
          </div>
        )}

        {selectedSubject && (
          <>
            <h3 className="lib-shelf-title">
              Bücher
              <span>
                {folderBooks.length} {folderBooks.length === 1 ? "BUCH" : "BÜCHER"}
              </span>
            </h3>
            <div className="lib-shelf" data-testid="book-shelf">
              <button
                type="button"
                className="lib-add-folder"
                data-testid="book-tile-add"
                onClick={importBook}
                disabled={documentLibrary.isImporting}
                aria-label="Buch hinzufügen"
                title={documentLibrary.isImporting ? "Wird importiert…" : "Buch hinzufügen"}
                style={{ flex: "none", alignSelf: "center", width: 45, height: 45, margin: 0 }}
              >
                <Plus size={25} />
              </button>
              {folderBooks.map((book) => (
                <BookTile
                  key={book.id}
                  book={book}
                  onOpen={() => onOpenNote?.(book)}
                  onLongPress={setDetailNote}
                />
              ))}
            </div>
          </>
        )}

        {/* Section title & count */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 11,
            margin: "0 0 14px",
          }}
        >
          <h3
            style={{
              margin: 0,
              font: '700 21px/1 "Bricolage Grotesque",sans-serif',
              letterSpacing: "-.025em",
              color: "#FFFFFF",
            }}
          >
            {selectedSubject
              ? `${selectedSubject.name} Notizen`
              : "Zuletzt bearbeitet"}
          </h3>
          <span
            style={{
              font: "600 9.5px ui-monospace,monospace",
              letterSpacing: ".11em",
              color: "#FFFFFF",
            }}
          >
            {sortedRecent.length}{" "}
            {sortedRecent.length === 1 ? "NOTIZ" : "NOTIZEN"}{" "}
            {selectedSubject
              ? `IN ${selectedSubject.name.toUpperCase()}`
              : "DIESE WOCHE"}
            {viewMode !== "masonry" && " · LISTENANSICHT"}
          </span>
        </div>

        {/* Dynamic View: Masonry vs List */}
        {viewMode === "masonry" ? (
          <div className="lib-masonry-grid" data-testid="masonry-grid">
            {sortedRecent.map((n) => (
              <RecentCard
                key={n.id}
                n={n}
                onOpen={() => onOpenNote?.(n)}
                onLongPress={setDetailNote}
              />
            ))}
          </div>
        ) : (
          <div className="lib-list-view" data-testid="list-view">
            {sortedRecent.map((n) => (
              <RecentListRow
                key={n.id}
                n={n}
                onOpen={() => onOpenNote?.(n)}
                onLongPress={setDetailNote}
              />
            ))}
          </div>
        )}
      </div>

      {/* left overview: shown in the space the agent panel occupies once it's collapsed */}
      <div
        className="agent-panel"
        data-open={!agentOpen && !detailNote && (overviewDocked || overviewPeek)}
        data-testid="left-overview-panel"
        style={{
          top: "calc(var(--lib-top) + env(safe-area-inset-top, 0px))",
          bottom: 20,
        }}
      >
        <div className="lib-glass agent-panel-card agent-panel-card-bare">
          <div className="agent-panel-head">
            <span style={{ font: "700 15px \"Bricolage Grotesque\",sans-serif", color: "#FFFFFF" }}>
              Anstehend
            </span>
            {knowledge.isScanning && <span className="agent-badge">SCAN LÄUFT</span>}
          </div>
          <div className="agent-panel-body">
            <UpcomingCard
              events={knowledge.openEvents.slice(0, 2)}
              sourceNoteTitles={sourceNoteTitles}
              onToggle={knowledge.setEventDone}
            />
          </div>
        </div>
        <div className="lib-glass agent-panel-card untis-card" style={{ flex: "0 0 68%" }}>
          <div className="agent-panel-head untis-head">
            <div className="untis-date-badge" aria-hidden="true">
              <span>{UNTIS_MONTHS_SHORT[new Date().getMonth()].replace(".", "")}</span>
              <b>{new Date().getDate()}</b>
            </div>
            <div className="untis-head-title">
              <span>Stundenplan</span>
              <small>
                {(() => {
                  const monday = untisMonday(untisWeekOffset);
                  const friday = new Date(monday);
                  friday.setDate(friday.getDate() + 4);
                  const range = `${monday.getDate()}. ${UNTIS_MONTHS_SHORT[monday.getMonth()]} – ${friday.getDate()}. ${UNTIS_MONTHS_SHORT[friday.getMonth()]}`;
                  const at = untisStatus === "ready" && loadUpdatedAt(monday);
                  if (!at) return `KW ${untisISOWeek(monday)} · ${range}`;
                  const d = new Date(at);
                  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
                  const sameDay = d.toDateString() === new Date().toDateString();
                  return `KW ${untisISOWeek(monday)} · ${range} · Stand ${sameDay ? time : `${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}, ${time}`}`;
                })()}
              </small>
            </div>
            <div className="untis-nav">
              <button type="button" aria-label="Vorherige Woche" onClick={() => stepUntisWeek(-1)}>
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3.5 5.5 8l4.5 4.5" /></svg>
              </button>
              <button type="button" onClick={() => setUntisWeekOffset(0)}>Heute</button>
              <button type="button" aria-label="Nächste Woche" onClick={() => stepUntisWeek(1)}>
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
              </button>
            </div>
          </div>
          <div className="agent-panel-body" style={{ touchAction: "pan-y" }} {...untisSwipe}>
            {untisStatus === "missing" && (
              <div className="agent-card" style={{ color: "rgba(255,255,255,.6)", font: "500 12.5px Manrope,sans-serif" }}>
                WebUntis-Zugangsdaten fehlen. In den Einstellungen unter „KI & Netzwerk“ eintragen.
              </div>
            )}
            {untisStatus === "loading" && (
              <div className="agent-card" style={{ color: "rgba(255,255,255,.6)", font: "500 12.5px Manrope,sans-serif" }}>
                Stundenplan wird geladen…
              </div>
            )}
            {untisStatus === "error" && (
              <UntisWeekGrid lessons={[]} monday={untisMonday(untisWeekOffset)} note={untisError} />
            )}
            {untisStatus === "ready" && (
              <UntisWeekGrid lessons={untisLessons} monday={untisMonday(untisWeekOffset)} />
            )}
          </div>
        </div>
      </div>

      {/* agent panel */}
      <div
        ref={agentDropRef}
        className="agent-panel agent-panel-drop"
        data-open={agentOpen && !detailNote}
        data-testid="agent-panel"
        style={{
          top: "calc(20px + env(safe-area-inset-top, 0px))",
        }}
      >
        <div className="lib-glass agent-panel-card">
          <div className="agent-panel-head">
            <ModelSelector
              variant="agent-model-select"
              selectedModel={agentModel}
              onSelectModel={(id) => {
                setAgentModel(id);
                saveChatModel(id);
              }}
            />
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
              <HistoryMenu
                sessions={agent.sessions}
                activeId={agent.activeId}
                onSelect={agent.selectSession}
                onStartNew={agent.startNew}
                onDelete={agent.deleteSession}
                onRename={agent.renameSession}
              />
              {agent.messages.length > 0 && (
                <button
                  className="agent-close"
                  onClick={agent.clear}
                  title="Unterhaltung löschen"
                >
                  <Trash2 size={13} />
                </button>
              )}
              <button
                className="agent-close"
                onClick={() => setAgentOpen(false)}
                title="Agent schließen"
                data-testid="agent-close-btn"
              >
                <X size={14} strokeWidth={2.4} />
              </button>
            </div>
          </div>

          <div className="agent-panel-body rail-chat-messages" ref={agentScrollRef}>
            {agent.messages.length === 0 && !agent.isRunning && (
              <div className="rail-chat-empty-wrap">
                <p className="rail-chat-empty">
                  Frag den Agenten etwas — oder gib ihm einen Auftrag.
                </p>
              </div>
            )}

            {agent.messages.map((message, index) => (
              <React.Fragment key={index}>
                {message.role === "assistant" && message.steps?.length > 0 && (
                  <StepList steps={message.steps} elapsedMs={message.elapsedMs} onOpenExam={onOpenCalendar} />
                )}
                <div className={`rail-chat-msg ${message.role}`}>
                  {message.role === "assistant" ? (
                    <>
                      <Markdown text={message.content} />
                      <CopyButton text={message.content} />
                    </>
                  ) : (
                    <>
                      {message.content}
                      <CopyButton text={message.content} />
                    </>
                  )}
                </div>
              </React.Fragment>
            ))}

            {agent.isRunning && agent.steps.length > 0 && <StepList steps={agent.steps} onOpenExam={onOpenCalendar} />}

            {agent.isRunning && (() => {
              const researching = agent.steps.some(
                (step) => step.state === "running" && step.name === "search_web",
              );
              return (
                <div className="rail-chat-status" aria-label="Der Assistent arbeitet">
                  {researching ? <WritingGlobe /> : <WritingPen />}
                  <span className="rail-chat-status-shimmer">{researching ? "Recherchiert…" : "Arbeitet…"}</span>
                  <span className="rail-chat-status-meta">
                    {formatElapsed(agent.elapsedMs)} · {formatTokens(agentDisplayedTokens)} Tokens
                  </span>
                  <button
                    type="button"
                    className="agent-close"
                    onClick={agent.stop}
                    title="Abbrechen"
                    data-testid="agent-cancel-btn"
                  >
                    <Square size={12} fill="currentColor" />
                  </button>
                </div>
              );
            })()}

            {agent.error && (
              <div className="rail-chat-error">
                <AlertTriangle size={13} />
                <span>{agent.error}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* opened by a long-press on a card - same slot as the panels above */}
      <div
        className="agent-panel"
        data-open={Boolean(detailNote)}
        data-testid="note-detail-overlay"
        style={{
          top: "calc(var(--lib-top) + env(safe-area-inset-top, 0px))",
          bottom: 20,
        }}
      >
        <NoteDetailPanel
          note={detailNote}
          onClose={() => setDetailNote(null)}
          onOpen={(note) => {
            setDetailNote(null);
            onOpenNote?.(note);
          }}
        />
      </div>

      <NewDocumentDialog
        open={isNewDocDialogOpen}
        subject={selectedSubject ? selectedSubject.name : ""}
        onCreate={(payload) => {
          setIsNewDocDialogOpen(false);
          onOpenNote?.(payload);
        }}
        onClose={() => setIsNewDocDialogOpen(false)}
      />

      {folderDialog && (
        <FolderDialog
          mode={folderDialog.mode}
          initial={folderDialog.mode === "create" ? null : folderDialog.folder}
          manualCard={
            folderDialog.mode === "create" ? "" : browserCardRepository.get(folderDialog.folder.id)?.manual || ""
          }
          autoCard={
            folderDialog.mode === "create" ? "" : browserCardRepository.get(folderDialog.folder.id)?.auto?.text || ""
          }
          onSubmit={(values) =>
            folderDialog.mode === "create"
              ? handleCreateFolder(values, folderDialog.parentId)
              : handleRenameFolder(folderDialog.folder, values)
          }
          onClose={() => setFolderDialog(null)}
        />
      )}
    </div>
  );
}
