import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
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
} from "lucide-react";
import matheCard from "../assets/subjects/mathe-card.jpg";
import chemieCard from "../assets/subjects/chemie-card.jpg";
import kunstCard from "../assets/subjects/kunst-card.jpg";
import pgwCard from "../assets/subjects/pgw-card.jpg";
import philosophieCard from "../assets/subjects/philosophie-card.jpg";
import englischCard from "../assets/subjects/englisch-card.jpg";
import spanischCard from "../assets/subjects/spanisch-card.jpg";
import useLiquidGlass from "../hooks/useLiquidGlass";
import useDocumentLibrary from "../hooks/useDocumentLibrary";
import NewDocumentDialog from "./NewDocumentDialog.jsx";
import { loadUntisCredentials, UNTIS_API_URL } from "../ink/untisSettings.js";

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

const RECENT = [
  // MATHE
  {
    id: 1,
    type: "math",
    title: "Ableitungsregeln",
    subject: "Mathe",
    dot: "oklch(0.62 0.075 255)",
    when: "gestern",
    body: "Produktregel: (u·v)' = u'v + uv' — Kettenregel: äußere × innere Ableitung",
    tag: "Klausur 14.09.",
  },
  {
    id: 2,
    type: "math",
    title: "Integralrechnung & Stammfunktionen",
    subject: "Mathe",
    dot: "oklch(0.62 0.075 255)",
    when: "vor 2 Tagen",
    body: "Hauptsatz: ∫ f(x)dx = F(b) - F(a). Partielle Integration: ∫ u·v' = u·v - ∫ u'·v",
    tag: "Analysis",
  },
  {
    id: 3,
    type: "math",
    title: "Vektorgeometrie & Skalarprodukt",
    subject: "Mathe",
    dot: "oklch(0.62 0.075 255)",
    when: "Mo",
    body: "Orthogonalität: a ⊥ b ⇔ a·b = 0. Ebenengleichung: E: x = p + r·u + s·v",
    tag: "Lineare Algebra",
  },
  {
    id: 4,
    type: "math",
    title: "Kurvendiskussion Extrema & Wendepunkte",
    subject: "Mathe",
    dot: "oklch(0.62 0.075 255)",
    when: "letzte Woche",
    body: "Notwendige Bedingung: f'(x0) = 0. Hinreichende Bedingung: f''(x0) ≠ 0.",
    tag: "Übungsblatt 4",
  },

  // CHEMIE
  {
    id: 5,
    type: "inspect",
    title: "Titrationskurve & Tafelbild",
    subject: "Chemie",
    dot: "oklch(0.64 0.06 158)",
    when: "Mo",
    body: "Äquivalenzpunkt bei pH 7.0 (starke Säure / starke Base). Wendepunktanalyse.",
  },
  {
    id: 6,
    type: "math",
    title: "Redoxreaktionen & Oxidationszahlen",
    subject: "Chemie",
    dot: "oklch(0.64 0.06 158)",
    when: "heute",
    body: "Oxidation = Elektronenabgabe, Reduktion = Aufnahme. Merksatz: OMA / RIG.",
  },
  {
    id: 7,
    type: "editorial",
    title: "Galvanische Zelle & Daniell-Element",
    subject: "Chemie",
    dot: "oklch(0.64 0.06 158)",
    when: "vor 3 Tagen",
    subtitle: "Zink-Kupfer-Element",
    body: "Anode (Oxidation): Zn → Zn²⁺ + 2e⁻. Kathode (Reduktion): Cu²⁺ + 2e⁻ → Cu.",
    body2:
      "Standardpotential: ΔE° = E°(Kathode) - E°(Anode) = +0.34V - (-0.76V) = 1.10V.",
    tag: "Elektrochemie",
    source: "Laborprotokoll Nr. 3",
  },
  {
    id: 8,
    type: "math",
    title: "Organische Chemie: Esterbildung",
    subject: "Chemie",
    dot: "oklch(0.64 0.06 158)",
    when: "letzte Woche",
    body: "Carbonsäure + Alkohol ⇌ Carbonsäureester + Wasser (Säurekatalysiert)",
    tag: "Organik",
  },

  // KUNST
  {
    id: 9,
    type: "banner",
    title: "The Renaissance Edition",
    subject: "Kunst",
    dot: "oklch(0.6 0.07 320)",
    when: "11:42",
    tag: "Shopify Editions | Winter '26",
  },
  {
    id: 10,
    type: "gallery",
    title: "Fotostudie & Perspektive",
    subject: "Kunst",
    dot: "oklch(0.6 0.07 320)",
    when: "Mo",
    tag: "4 Fotos",
  },
  {
    id: 11,
    type: "figma",
    title: "Figma Draw & Vektoren",
    subject: "Kunst",
    dot: "#D8615B",
    when: "Di",
    tag: "Figma Draw",
  },
  {
    id: 12,
    type: "editorial",
    title: "Designing with Clarity",
    subject: "Kunst",
    dot: "#0a84ff",
    when: "heute",
    subtitle: "Structuring Ideas Before Execution",
    body: "Designing with clarity means making intentional choices that help users understand what to do and where to go.",
    body2:
      "Before jumping into visuals, organize ideas and define structure for maximum aesthetic harmony.",
    tag: "Farblehre & Komposition",
    source: "New York Times – Designing with Clarity",
  },

  // PGW
  {
    id: 13,
    type: "agent",
    title: "Ursachen der Französischen Revolution",
    subject: "PGW",
    dot: "oklch(0.58 0.075 320)",
    when: "14:02",
    agent: true,
    sources: 6,
    body: "Ständegesellschaft, Staatsbankrott 1788, Aufklärung als Legitimationsbruch — mit Zeitleiste und Quellenliste.",
  },
  {
    id: 14,
    type: "editorial",
    title: "Wahlsysteme im Vergleich: BRD vs. USA",
    subject: "PGW",
    dot: "oklch(0.58 0.075 320)",
    when: "gestern",
    subtitle: "Personalisiertes Verhältniswahlrecht vs. Mehrheitswahl",
    body: "BRD: Erststimme (Direktmandat) & Zweitstimme (Parteianteil mit 5%-Hürde).",
    body2:
      "USA: Winner-takes-all Prinzip im Electoral College mit 538 Wahlleuten.",
    tag: "Demokratie & Wahlen",
    source: "Bundeszentrale für politische Bildung",
  },
  {
    id: 15,
    type: "vehicle",
    title: "2025 LAND CRUISER",
    subject: "PGW",
    dot: "#E27D48",
    when: "vor 2 Tagen",
    tag: "Toyota Land Cruiser 250 - Overview",
  },

  // PHILOSOPHIE
  {
    id: 16,
    type: "serif",
    title: "Höhlengleichnis",
    subject: "Philosophie",
    dot: "oklch(0.7 0.035 78)",
    when: "Mi",
    body: "Schatten = Sinneswahrnehmung, Feuer = Sonne des Guten. Aufstieg = Erkenntnisstufen.",
    question: "Frage: Ist Bildung Zwang?",
  },
  {
    id: 17,
    type: "serif",
    title: "Kategorischer Imperativ",
    subject: "Philosophie",
    dot: "oklch(0.7 0.035 78)",
    when: "Do",
    body: "Handle nur nach derjenigen Maxime, durch die du zugleich wollen kannst, dass sie ein allgemeines Gesetz werde.",
    question: "Kant: Pflichtethik vs. Utilitarismus",
  },
  {
    id: 18,
    type: "quote",
    title: "CLOSED Bar Branding",
    subject: "Philosophie",
    dot: "oklch(0.7 0.035 78)",
    when: "14:20",
    platform: "X",
    body: "In crafting a rich, evocative identity for CLOSED bar, how by why serves a lesson in worldbuilding →",
  },

  // ENGLISCH
  {
    id: 19,
    type: "editorial",
    title: "Shakespeare: Macbeth Character Analysis",
    subject: "Englisch",
    dot: "oklch(0.68 0.09 26)",
    when: "heute",
    subtitle: "Ambition, Guilt and the Supernatural",
    body: "Macbeth's fatal flaw (hamartia) is unchecked ambition driven by the witches' prophecies and Lady Macbeth's manipulation.",
    body2:
      'Key motif: "Fair is foul, and foul is fair" — appearance versus reality.',
    tag: "Drama Analysis",
    source: "Oxford Literature Guides",
  },
  {
    id: 20,
    type: "code",
    title: "CopilotForXcode",
    repo: "github / CopilotForXcode",
    subject: "Englisch",
    dot: "#4FA66B",
    when: "vor 5 Min",
    body: "AI coding assistant for Xcode — Technical Documentation Analysis",
    lang: "Swift",
    stars: "5,512",
  },
  {
    id: 21,
    type: "math",
    title: "Rhetorical Devices & Connectors",
    subject: "Englisch",
    dot: "oklch(0.68 0.09 26)",
    when: "gestern",
    body: "Metaphor, Alliteration, Oxymoron, Hyperbole. Transitions: Furthermore, Conversely, In light of this.",
    tag: "Essay Writing",
  },

  // SPANISCH
  {
    id: 22,
    type: "editorial",
    title: "Subjuntivo vs. Indicativo: Regla WEIRDO",
    subject: "Spanisch",
    dot: "oklch(0.65 0.08 52)",
    when: "heute",
    subtitle: "Wishes, Emotions, Impersonal, Recommendations, Doubt, Ojalá",
    body: "El subjuntivo se utiliza para expresar deseos, dudas y valoraciones personales.",
    body2: 'Ejemplo: "Espero que tengas un buen día" / "Dudo que sea verdad".',
    tag: "Gramática C1",
    source: "Real Academia Española",
  },
  {
    id: 23,
    type: "math",
    title: "Vocabulario: Medio Ambiente y Clima",
    subject: "Spanisch",
    dot: "oklch(0.65 0.08 52)",
    when: "Mo",
    body: "el cambio climático, las energías renovables, la deforestación, la huella de carbono",
    tag: "Klausurvorbereitung",
  },
  {
    id: 24,
    type: "serif",
    title: "El Siglo de Oro & Don Quijote",
    subject: "Spanisch",
    dot: "oklch(0.65 0.08 52)",
    when: "vor 4 Tagen",
    body: "Miguel de Cervantes Saavedra (1605). La parodia de los libros de caballerías y el idealismo quijotesco.",
    question: "Pregunta: ¿Quién es el verdadero loco?",
  },
];

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

function RecentCard({ n, onOpen }) {
  return (
    <div
      onClick={onOpen}
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

function RecentListRow({ n, onOpen }) {
  return (
    <div
      onClick={onOpen}
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

const UNTIS_SUBJECT_PALETTE = [
  { border: "#5ec8c0", bg: "rgba(94,200,192,.14)" },
  { border: "#8f8fe8", bg: "rgba(143,143,232,.14)" },
  { border: "#e8a15e", bg: "rgba(232,161,94,.14)" },
  { border: "#e85e9e", bg: "rgba(232,94,158,.14)" },
  { border: "#5e9ee8", bg: "rgba(94,158,232,.14)" },
  { border: "#9ee85e", bg: "rgba(158,232,94,.14)" },
];
const UNTIS_WEEKDAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const UNTIS_MONTHS_SHORT = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];
const UNTIS_PX_PER_MINUTE = 1.05;

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
function UntisWeekGrid({ lessons }) {
  const monday = new Date();
  const dow = monday.getDay();
  monday.setDate(monday.getDate() + (dow === 0 ? -6 : 1 - dow));
  monday.setHours(0, 0, 0, 0);

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

  if (allLessons.length === 0) {
    return (
      <div className="agent-card" style={{ color: "rgba(255,255,255,.6)", font: "500 12.5px Manrope,sans-serif" }}>
        Diese Woche keine Stunden.
      </div>
    );
  }

  const minStart = Math.min(...allLessons.map((l) => untisMinutes(l.startTime)));
  const maxEnd = Math.max(...allLessons.map((l) => untisMinutes(l.endTime)));
  const gridHeight = (maxEnd - minStart) * UNTIS_PX_PER_MINUTE;
  const axisTimes = [...new Set(allLessons.flatMap((l) => [l.startTime, l.endTime]))].sort((a, b) => a - b);

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
      <div className="untis-grid-body" style={{ height: gridHeight }}>
        <div className="untis-time-axis">
          {axisTimes.map((t) => {
            const top = (untisMinutes(t) - minStart) * UNTIS_PX_PER_MINUTE;
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
                const top = (start - minStart) * UNTIS_PX_PER_MINUTE;
                const height = Math.max(18, (end - start) * UNTIS_PX_PER_MINUTE - 2);
                const width = 100 / cluster.length;
                const left = slotIndex * width;
                const subject = lesson.su?.[0]?.longname || lesson.su?.[0]?.name || "—";
                const room = lesson.ro?.[0]?.name || "";
                const cancelled = lesson.code === "cancelled";
                const irregular = lesson.code === "irregular";
                const color = cancelled
                  ? { border: "#ff453a", bg: "rgba(255,69,58,.12)" }
                  : irregular
                  ? { border: "#ffb340", bg: "rgba(255,179,64,.12)" }
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
                      borderColor: color.border,
                      background: color.bg,
                    }}
                    title={`${subject}${room ? " · " + room : ""}`}
                  >
                    <span className="untis-lesson-subject">{subject}</span>
                    {room && <span className="untis-lesson-room">{room}</span>}
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
  documentLibraryOptions,
}) {
  const documentLibrary = useDocumentLibrary(documentLibraryOptions);
  const fileInputRef = useRef(null);
  const dragDepthRef = useRef(0);
  const [isFileDragActive, setIsFileDragActive] = useState(false);

  const runImport = async (files) => {
    const note = await documentLibrary.importFiles(
      files,
      selectedSubject?.name || "",
    );
    if (note) onOpenNote?.(note);
  };

  const [selectedSubject, setSelectedSubject] = useState(null); // null = all subjects
  const [viewMode, setViewMode] = useState("masonry"); // 'masonry' | 'list'
  const [sortBy, setSortBy] = useState("recent"); // 'recent' | 'title' | 'subject'
  const [searchQuery, setSearchQuery] = useState("");
  const [isMicActive, setIsMicActive] = useState(false);
  const [isNewDocDialogOpen, setIsNewDocDialogOpen] = useState(false);
  const [sortToast, setSortToast] = useState(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentTasks, setAgentTasks] = useState([]);
  const toastTimeoutRef = useRef(null);
  const liquidGlassRootRef = useRef(null);

  const [untisStatus, setUntisStatus] = useState("idle"); // idle|missing|loading|ready|error
  const [untisLessons, setUntisLessons] = useState([]);
  const [untisError, setUntisError] = useState("");

  useEffect(() => {
    const creds = loadUntisCredentials();
    if (!creds?.school || !creds?.server || !creds?.username || !creds?.password) {
      setUntisStatus("missing");
      return;
    }
    setUntisStatus("loading");
    fetch(UNTIS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error || "Stundenplan konnte nicht geladen werden.");
        setUntisLessons(
          [...(data.timetable || [])].sort((a, b) => a.startTime - b.startTime),
        );
        setUntisStatus("ready");
      })
      .catch((err) => {
        setUntisError(err.message || "Stundenplan konnte nicht geladen werden.");
        setUntisStatus("error");
      });
  }, []);

  useLiquidGlass(liquidGlassRootRef, selectedSubject?.id || "all");

  const newNoteRef = useRef(null);
  const [newNoteWidth, setNewNoteWidth] = useState(0);

  const showToast = (msg) => {
    setSortToast(msg);
    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setSortToast(null), 1600);
  };

  const askAgent = (text) => {
    const q = text.trim();
    if (!q) return;
    setAgentTasks((prev) =>
      [
        { id: Date.now(), text: q, subject: selectedSubject?.name || null },
        ...prev,
      ].slice(0, 6),
    );
    setAgentOpen(true);
    setSearchQuery("");
    showToast("An den Agenten übergeben");
  };

  const handleToggleSubject = (subject) => {
    if (selectedSubject?.id === subject.id) {
      setSelectedSubject(null);
      showToast("Alle Fächer werden angezeigt");
    } else {
      setSelectedSubject(subject);
      showToast(`Fach ausgewählt: ${subject.name}`);
    }
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
  const allNotes = [...importedCards, ...RECENT];

  // Filter notes by selected subject and search query
  const filteredNotes = allNotes.filter((n) => {
    const matchesSubject =
      !selectedSubject ||
      (n.subject &&
        n.subject.toLowerCase() === selectedSubject.name.toLowerCase()) ||
      (n.subject &&
        n.subject.toLowerCase() === selectedSubject.id.toLowerCase());
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
    return String(a.id).localeCompare(String(b.id));
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
          onClick={onOpenSettings}
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
            transition: "all 0.15s",
          }}
          className="lib-settings-btn"
          title="Einstellungen"
          data-testid="settings-nav-btn"
        >
          <Settings size={20} />
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
          top: agentOpen ? "auto" : 20,
          bottom: agentOpen ? 20 : "auto",
          zIndex: 30,
          height: 52,
          width: 440,
          padding: "0 20px 0 16px",
          gap: 12,
          cursor: "text",
          transition:
            "top 0.42s cubic-bezier(0.16, 1, 0.3, 1), bottom 0.42s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
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
          right: 110 + newNoteWidth + 14,
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
          right: 110,
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
        type="button"
        className="liquid-glass-pill lib-file-open"
        onClick={() => fileInputRef.current?.click()}
        disabled={documentLibrary.isImporting}
        aria-label={
          documentLibrary.isImporting ? "Datei wird importiert" : "Datei öffnen"
        }
        style={{
          position: "absolute",
          right: 110 + newNoteWidth + 14 + 130 + 10,
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
            right: 110,
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
            {SUBJECTS.length} FÄCHER ·{" "}
            {SUBJECTS.reduce((a, s) => a + s.count, 0)} NOTIZEN
          </span>
        </div>

        {/* Subjects horizontal selector row */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            margin: "0 0 28px",
            padding: "6px 4px 6px 0",
          }}
        >
          {SUBJECTS.map((s) => (
            <SubjectTile
              key={s.id}
              s={s}
              isSelected={selectedSubject?.id === s.id}
              isOtherSelected={selectedSubject && selectedSubject.id !== s.id}
              onToggle={() => handleToggleSubject(s)}
            />
          ))}
        </div>

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
              <RecentCard key={n.id} n={n} onOpen={() => onOpenNote?.(n)} />
            ))}
          </div>
        ) : (
          <div className="lib-list-view" data-testid="list-view">
            {sortedRecent.map((n) => (
              <RecentListRow key={n.id} n={n} onOpen={() => onOpenNote?.(n)} />
            ))}
          </div>
        )}
      </div>

      {/* left overview: shown in the space the agent panel occupies once it's collapsed */}
      <div
        className="agent-panel"
        data-open={!agentOpen}
        data-testid="left-overview-panel"
        style={{ top: 82, bottom: 20 }}
      >
        <div className="lib-glass agent-panel-card" style={{ flex: "0 0 68%" }}>
          <div className="agent-panel-head">
            <span style={{ font: "700 15px \"Bricolage Grotesque\",sans-serif", color: "#FFFFFF" }}>
              Stundenplan
            </span>
            <span className="agent-badge">WEBUNTIS</span>
          </div>
          <div className="agent-panel-body">
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
              <div className="agent-card" style={{ color: "rgba(255,69,58,.85)", font: "500 12.5px Manrope,sans-serif" }}>
                {untisError}
              </div>
            )}
            {untisStatus === "ready" && <UntisWeekGrid lessons={untisLessons} />}
          </div>
        </div>
        <div className="lib-glass agent-panel-card">
          <div className="agent-panel-head">
            <span style={{ font: "700 15px \"Bricolage Grotesque\",sans-serif", color: "#FFFFFF" }}>
              Neuigkeiten
            </span>
          </div>
          <div className="agent-panel-body">
            {/* ponytail: placeholder, add real feed later */}
            <div className="agent-card" style={{ color: "rgba(255,255,255,.6)", font: "500 12.5px Manrope,sans-serif" }}>
              Noch keine Neuigkeiten.
            </div>
          </div>
        </div>
      </div>

      {/* agent panel */}
      <button
        className="liquid-glass-circle liquid-control liquid-control-agent"
        data-liquid-glass-control="agent"
        data-config={JSON.stringify({
          cornerRadius: 26,
          zRadius: 26,
          button: true,
        })}
        onClick={() => setAgentOpen(true)}
        title="Agent öffnen"
        aria-hidden={agentOpen}
        tabIndex={agentOpen ? -1 : undefined}
        style={{
          position: "absolute",
          right: 20,
          top: 20,
          zIndex: 20,
          visibility: agentOpen ? "hidden" : "visible",
          pointerEvents: agentOpen ? "none" : "auto",
        }}
        data-testid="agent-open-btn"
      >
        <Sparkles size={18} strokeWidth={2.2} />
      </button>

      <div
        className="agent-panel"
        data-open={agentOpen}
        data-testid="agent-panel"
      >
        <div className="lib-glass agent-panel-card">
          <div className="agent-panel-head">
            <span className="agent-badge">{2 + agentTasks.length} AKTIV</span>
            <button
              className="agent-close"
              onClick={() => setAgentOpen(false)}
              title="Agent schließen"
              data-testid="agent-close-btn"
            >
              <X size={14} strokeWidth={2.4} />
            </button>
          </div>

          <div className="agent-panel-body">
            {agentTasks.map((t) => (
              <div
                key={t.id}
                className="agent-card agent-card-new"
                data-testid="agent-task"
              >
                <div className="agent-card-head">
                  <Sparkles size={12} color="oklch(0.8 0.12 90)" />
                  <span>
                    NEUE ANFRAGE
                    {t.subject ? ` · ${t.subject.toUpperCase()}` : ""}
                  </span>
                </div>
                <div
                  style={{
                    font: "500 12.5px/1.42 Manrope,sans-serif",
                    color: "#FFFFFF",
                  }}
                >
                  {t.text}
                </div>
                <div className="agent-progress">
                  <span style={{ width: "18%" }} />
                </div>
              </div>
            ))}
            <div className="agent-card">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 7,
                }}
              >
                <Globe size={12} color="oklch(0.76 0.06 320)" />
                <span
                  style={{
                    font: "700 9.5px ui-monospace,monospace",
                    letterSpacing: ".05em",
                    color: "#FFFFFF",
                  }}
                >
                  RECHERCHIERT
                </span>
              </div>
              <div
                style={{
                  font: "500 12.5px/1.42 Manrope,sans-serif",
                  color: "#FFFFFF",
                }}
              >
                {selectedSubject
                  ? `${selectedSubject.name}: Fachbegriffe & Zusammenfassung`
                  : "Wahlsystem BRD vs. USA — Vergleichstabelle"}
              </div>
              <div className="agent-progress">
                <span style={{ width: "64%" }} />
              </div>
              <div
                style={{
                  marginTop: 7,
                  display: "flex",
                  justifyContent: "space-between",
                  font: "600 9.5px ui-monospace,monospace",
                  color: "#FFFFFF",
                }}
              >
                <span>Quelle 4 von 6</span>
                <span>~2 min</span>
              </div>
            </div>

            <div className="agent-card">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 7,
                }}
              >
                <ScanText size={12} color="oklch(0.76 0.055 235)" />
                <span
                  style={{
                    font: "700 9.5px ui-monospace,monospace",
                    letterSpacing: ".05em",
                    color: "#FFFFFF",
                  }}
                >
                  LIEST HANDSCHRIFT
                </span>
              </div>
              <div
                style={{
                  font: "500 12.5px/1.42 Manrope,sans-serif",
                  color: "#FFFFFF",
                }}
              >
                {selectedSubject
                  ? `${selectedSubject.name}-Notizen der Woche → Formelsammlung`
                  : "Mathe-Notizen der Woche → Formelsammlung"}
              </div>
              <div style={{ marginTop: 9, display: "flex", gap: 4 }}>
                {[1, 1, 1, 0, 0].map((on, i) => (
                  <span
                    key={i}
                    style={{
                      height: 3,
                      flex: 1,
                      borderRadius: 2,
                      background: on
                        ? "oklch(0.68 0.055 235)"
                        : "rgba(255,255,255,.2)",
                    }}
                  />
                ))}
              </div>
            </div>

            <div
              style={{
                marginTop: 4,
                font: "600 9.5px ui-monospace,monospace",
                letterSpacing: ".08em",
                color: "#FFFFFF",
                paddingLeft: 4,
              }}
            >
              FERTIG · HEUTE
            </div>

            {[
              'Zusammenfassung „Franz. Revolution" → PGW',
              "Vokabeltest Unidad 3 erstellt — 24 Karten",
            ].map((t, i) => (
              <div
                key={i}
                className="lib-agent-done"
                style={{
                  borderRadius: 18,
                  padding: "12px 14px",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{ display: "flex", gap: 8, alignItems: "flex-start" }}
                >
                  <Check
                    size={13}
                    color="oklch(0.7 0.08 150)"
                    style={{ marginTop: 2, flexShrink: 0 }}
                  />
                  <span
                    style={{
                      font: "500 12.5px/1.4 Manrope,sans-serif",
                      color: "#FFFFFF",
                    }}
                  >
                    {t}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
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
    </div>
  );
}
