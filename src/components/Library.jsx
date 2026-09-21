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
import useAgent from "../hooks/useAgent";
import {
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
import useLiquidGlass from "../hooks/useLiquidGlass";
import useDocumentLibrary from "../hooks/useDocumentLibrary";
import useKnowledge from "../hooks/useKnowledge.js";
import { browserNoteRepository } from "../storage/noteRepository.js";
import { browserFolderRepository } from "../storage/folderRepository.js";
import { browserInkRepository } from "../ink/inkRepository.js";
import { exportDocumentAsPdf, exportPageAsPng } from "../documents/exportDocument.js";
import { FOLDER_ICONS } from "./folderIcons.js";
import {
  notePageStyleOf,
  previewTextOf,
  renderNotePagesOf,
  renderNotePreviewDataUrl,
  subscribeToPreviewImages,
} from "../documents/notePreview.js";
import NewDocumentDialog from "./NewDocumentDialog.jsx";
import FolderDialog from "./FolderDialog.jsx";
import UpcomingCard from "./UpcomingCard.jsx";
import { loadUntisCredentials } from "../ink/untisSettings.js";
import { fetchUntisWeek, loadArchivedWeek, loadUpdatedAt, untisDateNumber, untisMonday, UNTIS_MAX_WEEKS_BACK } from "../ink/untisArchive.js";

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

function TileWrap({
  onOpen,
  w,
  h,
  bg,
  className = "",
  testId,
  subject,
  children,
}) {
  const cardImage = subject ? SUBJECT_CARD_IMAGES[subject.id] : null;
  const titleFont =
    subject?.id === "philosophie"
      ? 'italic 600 27px/1 "Instrument Serif",serif'
      : '800 24px/1 "Bricolage Grotesque",sans-serif';

  return (
    <div
      onClick={onOpen}
      className={`lib-tile ${className}`}
      data-testid={testId}
      style={{
        position: "relative",
        flex: "none",
        width: w,
        height: h,
        background: cardImage
          ? `linear-gradient(180deg, rgba(4,5,8,.04) 28%, rgba(4,5,8,.88) 100%), url(${cardImage}) center / cover no-repeat`
          : bg,
        cursor: "pointer",
      }}
    >
      {cardImage ? (
        <>
          <div className="subject-card-sheen" aria-hidden="true" />
          <div className="subject-card-copy">
            <div
              style={{
                font: titleFont,
                letterSpacing:
                  subject.id === "philosophie" ? "-.01em" : "-.035em",
              }}
            >
              {subject.name}
            </div>
            <div className="subject-card-count">{subject.count} Notizen</div>
          </div>
        </>
      ) : (
        children
      )}
    </div>
  );
}

function SubjectTile({ s, isSelected, isOtherSelected, onToggle }) {
  const tileClass = isSelected
    ? "active"
    : isOtherSelected
      ? "lib-tile-inactive"
      : "";
  const testId = `subject-tile-${s.id}`;

  if (s.id === "mathe") {
    return (
      <TileWrap
        onOpen={onToggle}
        w={220}
        h={148}
        bg="linear-gradient(155deg, oklch(0.32 0.12 258), #090B14 75%)"
        className={tileClass}
        testId={testId}
        subject={s}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.14) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.14) 1px,transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 34,
            height: 58,
            background:
              "linear-gradient(72deg,transparent 12%,oklch(0.75 0.16 250/.85) 12%,oklch(0.75 0.16 250/.85) 13.4%,transparent 13.4%)",
            transform: "skewY(-16deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 18,
            top: 14,
            font: 'italic 20px "Instrument Serif",serif',
            color: "#FFFFFF",
          }}
        >
          f(x)
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 44,
            height: 1,
            background: "rgba(255,255,255,.35)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 20,
            bottom: 22,
            width: 1,
            height: 16,
            background: "rgba(255,255,255,.35)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 18,
            bottom: 24,
            font: "600 9.5px ui-monospace,monospace",
            letterSpacing: ".1em",
            color: "#FFFFFF",
          }}
        >
          {s.count} NOTIZEN
        </div>
        <div
          style={{
            position: "absolute",
            left: 18,
            bottom: 44,
            font: '800 40px/.9 "Bricolage Grotesque",sans-serif',
            letterSpacing: "-.04em",
            color: "#FFFFFF",
          }}
        >
          Mathe
        </div>
      </TileWrap>
    );
  }

  if (s.id === "chemie") {
    return (
      <TileWrap
        onOpen={onToggle}
        w={150}
        h={164}
        bg="linear-gradient(155deg, oklch(0.32 0.12 158), #06120A 75%)"
        className={tileClass}
        testId={testId}
        subject={s}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(rgba(255,255,255,.16) 1.3px,transparent 1.4px)",
            backgroundSize: "15px 15px",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -16,
            top: 22,
            width: 76,
            height: 76,
            borderRadius: "50%",
            border: "2px solid oklch(0.76 0.15 158/.8)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 8,
            top: 74,
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: "1.5px solid oklch(0.76 0.15 158/.55)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 34,
            background: "rgba(0,30,12,.45)",
            borderRight: "1px solid rgba(255,255,255,.16)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 14,
            width: 34,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              writingMode: "vertical-rl",
              font: '700 13px "Bricolage Grotesque",sans-serif',
              letterSpacing: ".22em",
              color: "#FFFFFF",
            }}
          >
            CHEMIE
          </span>
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: 14,
            width: 34,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              writingMode: "vertical-rl",
              font: "600 9px ui-monospace,monospace",
              letterSpacing: ".14em",
              color: "#FFFFFF",
            }}
          >
            {s.count}
          </span>
        </div>
      </TileWrap>
    );
  }

  if (s.id === "kunst") {
    return (
      <TileWrap
        onOpen={onToggle}
        w={140}
        h={148}
        bg="linear-gradient(155deg, oklch(0.30 0.12 330), #120912 75%)"
        className={tileClass}
        testId={testId}
        subject={s}
      >
        <div
          style={{
            position: "absolute",
            left: -14,
            top: -10,
            width: 160,
            height: 30,
            background: "oklch(0.66 0.20 38)",
            transform: "rotate(-11deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -14,
            top: 20,
            width: 160,
            height: 24,
            background: "oklch(0.78 0.18 85)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -14,
            top: 44,
            width: 160,
            height: 26,
            background: "oklch(0.60 0.17 215)",
            transform: "rotate(-11deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -14,
            top: 70,
            width: 160,
            height: 20,
            background: "oklch(0.52 0.18 320)",
            transform: "rotate(-11deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -10,
            right: -10,
            bottom: 26,
            height: 30,
            background: "#FFFFFF",
            transform: "rotate(-7deg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              font: '700 15px "Bricolage Grotesque",sans-serif',
              letterSpacing: "-.01em",
              color: "#08080A",
            }}
          >
            Kunst
          </span>
          <span
            style={{
              font: "700 8.5px ui-monospace,monospace",
              color: "rgba(0,0,0,.6)",
            }}
          >
            {s.count}
          </span>
        </div>
      </TileWrap>
    );
  }

  if (s.id === "pgw") {
    return (
      <TileWrap
        onOpen={onToggle}
        w={150}
        h={132}
        bg="linear-gradient(155deg, oklch(0.30 0.12 315), #0F0916 75%)"
        className={tileClass}
        testId={testId}
        subject={s}
      >
        <div
          style={{
            position: "absolute",
            left: 16,
            bottom: 38,
            display: "flex",
            alignItems: "flex-end",
            gap: 6,
            height: 58,
          }}
        >
          <div
            style={{
              width: 11,
              height: 22,
              background: "oklch(0.65 0.18 315/.65)",
            }}
          />
          <div
            style={{
              width: 11,
              height: 40,
              background: "oklch(0.72 0.20 315/.85)",
            }}
          />
          <div
            style={{
              width: 11,
              height: 30,
              background: "oklch(0.65 0.18 315/.6)",
            }}
          />
          <div style={{ width: 11, height: 56, background: "#FFFFFF" }} />
          <div
            style={{
              width: 11,
              height: 18,
              background: "oklch(0.65 0.18 315/.5)",
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            left: 75,
            bottom: 100,
            font: "600 9px ui-monospace,monospace",
            color: "#FFFFFF",
          }}
        >
          {s.count}
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 36,
            height: 1,
            background: "rgba(255,255,255,.35)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 16,
            bottom: 11,
            font: '800 22px/1 "Bricolage Grotesque",sans-serif',
            letterSpacing: ".1em",
            color: "#FFFFFF",
          }}
        >
          PGW
        </div>
      </TileWrap>
    );
  }

  if (s.id === "philosophie") {
    return (
      <TileWrap
        onOpen={onToggle}
        w={190}
        h={156}
        bg="linear-gradient(155deg, oklch(0.32 0.09 78), #140F08 75%)"
        className={tileClass}
        testId={testId}
        subject={s}
      >
        <div
          style={{
            position: "absolute",
            right: -8,
            top: -14,
            font: 'italic 110px/1 "Instrument Serif",serif',
            color: "oklch(0.78 0.12 78/.22)",
          }}
        >
          Φ
        </div>
        <div
          style={{
            position: "absolute",
            left: 18,
            top: 18,
            right: 16,
            font: 'italic 31px/1.02 "Instrument Serif",serif',
            color: "#FFFFFF",
          }}
        >
          Philo­sophie
        </div>
        <div
          style={{
            position: "absolute",
            left: 18,
            top: 96,
            width: 40,
            height: 1,
            background: "oklch(0.78 0.14 78/.6)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 18,
            top: 108,
            right: 16,
            font: "400 11px/1.45 Manrope,sans-serif",
            color: "#FFFFFF",
          }}
        >
          Sartre, Platon, Kant · {s.count} Notizen
        </div>
      </TileWrap>
    );
  }

  if (s.id === "englisch") {
    return (
      <TileWrap
        onOpen={onToggle}
        w={136}
        h={144}
        bg="linear-gradient(155deg, oklch(0.30 0.13 26), #14090C 75%)"
        className={tileClass}
        testId={testId}
        subject={s}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(to bottom,transparent calc(100% - 1px),rgba(255,255,255,.18) calc(100% - 1px))",
            backgroundSize: "100% 24px",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 22,
            top: 0,
            bottom: 0,
            width: 1,
            background: "oklch(0.72 0.18 26/.75)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 10,
            top: 4,
            font: '400 54px/1 "Instrument Serif",serif',
            color: "oklch(0.75 0.14 26/.25)",
          }}
        >
          Aa
        </div>
        <div
          style={{
            position: "absolute",
            left: 28,
            top: 56,
            font: "600 34px/1 Caveat,cursive",
            color: "#FFFFFF",
          }}
        >
          Englisch
        </div>
        <div
          style={{
            position: "absolute",
            left: 6,
            top: 60,
            font: "600 8.5px ui-monospace,monospace",
            color: "#FFFFFF",
          }}
        >
          {s.count}
        </div>
      </TileWrap>
    );
  }

  // spanisch
  return (
    <TileWrap
      onOpen={onToggle}
      w={150}
      h={132}
      bg="linear-gradient(155deg, oklch(0.32 0.14 56), #140B05 75%)"
      className={tileClass}
      testId={testId}
      subject={s}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "repeating-linear-gradient(118deg,transparent 0 12px,oklch(0.65 0.16 52/.6) 12px 22px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 24,
          height: 34,
          background: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          gap: 7,
        }}
      >
        <span
          style={{
            font: '700 15px "Bricolage Grotesque",sans-serif',
            color: "#08080A",
          }}
        >
          Spanisch
        </span>
        <span
          style={{
            marginLeft: "auto",
            font: "700 8.5px ui-monospace,monospace",
            color: "rgba(0,0,0,.6)",
          }}
        >
          {s.count}
        </span>
      </div>
    </TileWrap>
  );
}

function GenericFolderTile({ folder, count, onOpen }) {
  const Icon = FOLDER_ICONS[folder.icon] || FOLDER_ICONS.book;
  const color = folder.color || "#8AD4FF";
  return (
    <TileWrap
      onOpen={onOpen}
      w={150}
      h={148}
      bg={`linear-gradient(155deg, ${color}33, #0B0C10 75%)`}
      testId={`folder-tile-${folder.id}`}
    >
      <div style={{ position: "absolute", left: 18, top: 16, color }}>
        <Icon size={22} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 18,
          right: 14,
          bottom: 44,
          font: '800 20px "Bricolage Grotesque",sans-serif',
          color: "#FFFFFF",
        }}
      >
        {folder.name}
      </div>
      <div
        style={{
          position: "absolute",
          left: 18,
          bottom: 22,
          font: "600 9.5px ui-monospace,monospace",
          letterSpacing: ".1em",
          color: "#FFFFFF",
          opacity: 0.7,
        }}
      >
        {count} {count === 1 ? "NOTIZ" : "NOTIZEN"}
      </div>
    </TileWrap>
  );
}

function AddFolderTile({ onOpen }) {
  return (
    <TileWrap onOpen={onOpen} w={150} h={148} bg="rgba(255,255,255,.04)" testId="folder-tile-add">
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <Plus size={22} color="#FFFFFF" />
        <span style={{ font: "600 11px ui-monospace,monospace", color: "#FFFFFF", opacity: 0.7 }}>
          NEUER ORDNER
        </span>
      </div>
    </TileWrap>
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
  const pages = useMemo(
    () => (note ? renderNotePagesOf(note.id) : []),
    [note?.id, previewVersion],
  );
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
    const inkDoc = browserInkRepository.loadHistory(note.id)?.present;
    if (!inkDoc) return;
    setIsExporting(true);
    try {
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
                  <div key={p.id} style={{ flex: "0 0 100%", height: "100%" }}>
                    {p.src && (
                      <img
                        src={p.src}
                        alt=""
                        draggable={false}
                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
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

// Muted, near-equal-lightness accents: a subject stays recognisable by colour
// without the grid turning into a neon quilt. Colour only rides the left bar.
const UNTIS_SUBJECT_PALETTE = [
  { accent: "#7ea8c4", bg: "rgba(126,168,196,.11)" },
  { accent: "#89b39b", bg: "rgba(137,179,155,.11)" },
  { accent: "#c1977c", bg: "rgba(193,151,124,.11)" },
  { accent: "#a493c0", bg: "rgba(164,147,192,.11)" },
  { accent: "#c2a86c", bg: "rgba(194,168,108,.11)" },
  { accent: "#c18b95", bg: "rgba(193,139,149,.11)" },
];
const UNTIS_WEEKDAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const UNTIS_MONTHS_SHORT = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];

function untisSubjectColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return UNTIS_SUBJECT_PALETTE[hash % UNTIS_SUBJECT_PALETTE.length];
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

  // Cluster mutually overlapping lessons per day so parallel courses split the column width.
  const clusteredByDay = lessonsByDay.map((dayLessons) => {
    const clusters = [];
    let current = [];
    let currentEnd = -Infinity;
    for (const lesson of dayLessons) {
      const start = untisMinutes(lesson.startTime);
      if (current.length && start >= currentEnd) {
        clusters.push(current);
        current = [];
        currentEnd = -Infinity;
      }
      current.push(lesson);
      currentEnd = Math.max(currentEnd, untisMinutes(lesson.endTime));
    }
    if (current.length) clusters.push(current);
    return clusters;
  });

  return (
    <div className="untis-grid">
      {note && (
        <div style={{ color: "rgba(255,255,255,.6)", font: "500 12px Manrope,sans-serif", padding: "0 4px 8px" }}>{note}</div>
      )}
      <div className="untis-grid-head">
        <div className="untis-time-col-head">
          <span>KW {untisISOWeek(monday)}</span>
          <span>{UNTIS_MONTHS_SHORT[monday.getMonth()]}</span>
        </div>
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
          <div key={dayIndex} className="untis-day-col">
            {clusters.map((cluster) =>
              cluster.map((lesson, slotIndex) => {
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
                    : lesson.su?.[0]?.longname || lesson.su?.[0]?.name) || "—";
                const room = lesson.ro?.[0]?.name || "";
                // Entfall = flagged cancelled, or the teacher/room was struck out ("---")
                // with no substitute entered (e.g. "eigenverantwortliches Arbeiten").
                const removed = (list) => list?.length > 0 && list.every((x) => x.id === 0 || x.name === "---");
                // Untis also enters a cancellation as substText only (code stays unset,
                // teacher list is empty for students), e.g. Spanisch on 2026-09-21.
                const selfStudy = /eigenverantwortlich/i.test(lesson.substText || "") && subject !== "Lernzeit";
                const cancelled = lesson.code === "cancelled" || removed(lesson.te) || removed(lesson.ro) || selfStudy;
                const irregular = lesson.code === "irregular";
                const color = cancelled
                  ? { accent: "#ff5a4f", bg: "rgba(255,90,79,.24)" }
                  : irregular
                  ? { accent: "#dba55e", bg: "rgba(219,165,94,.11)" }
                  : untisSubjectColor(subject);
                return (
                  <div
                    key={lesson.id}
                    className={`untis-lesson ${cancelled ? "is-cancelled" : ""}`}
                    style={{
                      top,
                      height,
                      left: `${left}%`,
                      width: `calc(${width}% - 3px)`,
                      borderLeftColor: color.accent,
                      background: color.bg,
                    }}
                    title={`${subject}${room ? " · " + room : ""}${cancelled ? " · Entfall" : ""}`}
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
  onOpenPlan,
  documentLibraryOptions,
}) {
  const documentLibrary = useDocumentLibrary(documentLibraryOptions);
  const fileInputRef = useRef(null);
  const dragDepthRef = useRef(0);
  const [isFileDragActive, setIsFileDragActive] = useState(false);

  // One document per file, so a stack of scanned book pages lands as separate
  // sources in the open folder. Only a single file is opened right away.
  const runImport = async (files) => {
    const list = Array.from(files || []);
    let note = null;
    for (const file of list) {
      note = await documentLibrary.importFiles([file], selectedSubject?.name || "");
    }
    if (list.length === 1 && note) onOpenNote?.(note);
  };

  const [selectedSubject, setSelectedSubject] = useState(null); // null = all subjects
  const [viewMode, setViewMode] = useState("masonry"); // 'masonry' | 'list'
  const [sortBy, setSortBy] = useState("recent"); // 'recent' | 'title' | 'subject'
  const [searchQuery, setSearchQuery] = useState("");
  const [isMicActive, setIsMicActive] = useState(false);
  const [isNewDocDialogOpen, setIsNewDocDialogOpen] = useState(false);
  const [sortToast, setSortToast] = useState(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [detailNote, setDetailNote] = useState(null);
  const [folderDialog, setFolderDialog] = useState(null); // null | { mode: "create", parentId } | { mode: "rename", folder }
  const toastTimeoutRef = useRef(null);
  const liquidGlassRootRef = useRef(null);
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

  const agent = useAgent({
    documentId: "library",
    noteTitle: selectedSubject?.name,
    subject: selectedSubject?.name,
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
      setUntisWeekOffset((o) => Math.max(-UNTIS_MAX_WEEKS_BACK, o + (dx < 0 ? 1 : -1)));
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

  const handleCreateFolder = ({ name, color, icon }, parentId) => {
    browserFolderRepository.createFolder({ name, color, icon, parentId });
    setFolderDialog(null);
  };

  const handleRenameFolder = (folder, { name, color, icon }) => {
    const updated = browserFolderRepository.renameFolder(folder.id, { name, color, icon });
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
    browserFolderRepository.removeFolder(folder.id);
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
  const sourceNoteTitles = Object.fromEntries(
    knowledgeNotes
      .filter((note) => note.id && note.title)
      .map((note) => [note.id, note.title]),
  );
  const knowledge = useKnowledge({ notes: knowledgeNotes, subjects: untisSubjects });
  const allNotes = [...importedCards, ...createdCards];

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
  }, [selectedSubject]);

  return (
    <div
      ref={liquidGlassRootRef}
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
          <Clock size={19} />
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
          onClick={onOpenPlan}
          className="lib-plan-btn"
          title="Lernplan & Glossar"
          aria-label="Lernplan & Glossar öffnen"
          data-testid="open-plan-btn"
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
        style={{
          position: "absolute",
          left: 106,
          top: agentOpen ? "auto" : "calc(20px + env(safe-area-inset-top, 0px))",
          bottom: agentOpen ? 20 : "auto",
          zIndex: 30,
          height: 52,
          width: 440,
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
          right: 88 + newNoteWidth + 14 + fileOpenWidth + 14,
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
        style={{
          position: "absolute",
          right: 88,
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
        onClick={() => fileInputRef.current?.click()}
        disabled={documentLibrary.isImporting}
        aria-label={
          documentLibrary.isImporting ? "Datei wird importiert" : "Datei öffnen"
        }
        style={{
          position: "absolute",
          right: 88 + newNoteWidth + 14,
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
          style={{
            font: '700 13px "Bricolage Grotesque",sans-serif',
            whiteSpace: "nowrap",
          }}
        >
          {documentLibrary.isImporting ? "Wird importiert…" : "Datei öffnen"}
        </span>
      </button>
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

      {/* Sort Toast */}
      {sortToast && (
        <div
          className="liquid-glass-pill"
          style={{
            position: "fixed",
            top: 84,
            right: 88,
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
          left: 570,
          top: 82,
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
            </div>

            {/* Folders horizontal selector row */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                margin: "0 0 28px",
                padding: "6px 4px 6px 0",
              }}
            >
              {rootFolders.map((folder) =>
                SUBJECT_THEMES[folder.id] ? (
                  <SubjectTile
                    key={folder.id}
                    s={{
                      id: folder.id,
                      name: folder.name,
                      count: countInFolder(folder, allNotes),
                      themeColor: SUBJECTS.find((x) => x.id === folder.id)?.themeColor,
                    }}
                    isSelected={false}
                    isOtherSelected={false}
                    onToggle={() => handleOpenFolder(folder)}
                  />
                ) : (
                  <GenericFolderTile
                    key={folder.id}
                    folder={folder}
                    count={countInFolder(folder, allNotes)}
                    onOpen={() => handleOpenFolder(folder)}
                  />
                ),
              )}
              <AddFolderTile onOpen={() => setFolderDialog({ mode: "create", parentId: null })} />
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
              onClick={() => setSelectedSubject(null)}
              title="Zurück zur Übersicht"
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
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              margin: "0 0 28px",
              padding: "6px 4px 6px 0",
            }}
          >
            {subFolders.map((folder) => (
              <GenericFolderTile
                key={folder.id}
                folder={folder}
                count={countInFolder(folder, allNotes)}
                onOpen={() => handleOpenFolder(folder)}
              />
            ))}
            <AddFolderTile
              onOpen={() => setFolderDialog({ mode: "create", parentId: selectedSubject.id })}
            />
          </div>
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
              : "DIESE WOCHE"}{" "}
            · {viewMode === "masonry" ? "MOODBOARD-RASTER" : "LISTENANSICHT"}
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
        data-open={!agentOpen && !detailNote}
        data-testid="left-overview-panel"
        style={{
          top: "calc(82px + env(safe-area-inset-top, 0px))",
          bottom: 20,
        }}
      >
        <div className="lib-glass agent-panel-card">
          <div className="agent-panel-head">
            <span style={{ font: "700 15px \"Bricolage Grotesque\",sans-serif", color: "#FFFFFF" }}>
              Anstehend
            </span>
            {knowledge.isScanning && <span className="agent-badge">SCAN LÄUFT</span>}
          </div>
          <div className="agent-panel-body">
            <UpcomingCard
              events={knowledge.openEvents}
              sourceNoteTitles={sourceNoteTitles}
              onToggle={knowledge.setEventDone}
            />
          </div>
        </div>
        <div className="lib-glass agent-panel-card" style={{ flex: "0 0 68%" }}>
          <div className="agent-panel-head">
            <span style={{ font: "700 15px \"Bricolage Grotesque\",sans-serif", color: "#FFFFFF" }}>
              Stundenplan
            </span>
            {untisStatus === "ready" && (() => {
              const at = loadUpdatedAt(untisMonday(untisWeekOffset));
              if (!at) return null;
              const d = new Date(at);
              const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
              const sameDay = d.toDateString() === new Date().toDateString();
              return (
                <span style={{ font: "500 10.5px Manrope,sans-serif", color: "rgba(255,255,255,.4)" }}>
                  Stand {sameDay ? time : `${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}, ${time}`}
                </span>
              );
            })()}
            {untisWeekOffset === 0 ? (
              <span className="agent-badge">WEBUNTIS</span>
            ) : (
              <button
                type="button"
                className="agent-badge"
                style={{ cursor: "pointer" }}
                onClick={() => setUntisWeekOffset(0)}
              >
                HEUTE
              </button>
            )}
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
            <span
              style={{
                font: "700 15px \"Bricolage Grotesque\",sans-serif",
                color: "#FFFFFF",
              }}
            >
              KI-Assistent
            </span>
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
                  <StepList steps={message.steps} elapsedMs={message.elapsedMs} />
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

            {agent.isRunning && agent.steps.length > 0 && <StepList steps={agent.steps} />}

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
          top: "calc(82px + env(safe-area-inset-top, 0px))",
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
