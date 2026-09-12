// The agent's design system. Colours carry a role here, not a name, so the
// prompt, the presets and the tool schemas all argue about "accent" instead of
// each hard-coding a hex that then drifts apart.
//
// Two themes because the page background decides whether a colour reads at
// all: the dark red that carries an annotation on paper disappears into the
// app's default dark gradient, and the pale yellow that marks a key term on
// dark paper is invisible on white.

export const NOTE_THEMES = {
  dark: {
    id: "dark",
    body: "#ECE8E1",
    heading: "#FF8A4C",
    subheading: "#FF6FA5",
    accent: "#FFD166",
    support: "#6BCB88",
    signal: "#FF5C5C",
    muted: "#9A96A0",
    rule: "#3A3A42",
    // Callout/banner fills sit on top of the page, so they are translucent
    // enough to let the paper's ruling stay visible underneath.
    surface: "#FFFFFF12",
  },
  paper: {
    id: "paper",
    body: "#1A1A1A",
    heading: "#C2410C",
    subheading: "#BE185D",
    accent: "#B45309",
    support: "#15803D",
    signal: "#DC2626",
    muted: "#6B7280",
    rule: "#D9D4CA",
    surface: "#00000008",
  },
};

export const STYLE_ROLES = [
  "body",
  "heading",
  "subheading",
  "accent",
  "support",
  "signal",
  "muted",
];

// Marker colours are translucent on purpose: a solid bar behind text reads as
// a printed label, a see-through one reads as a highlighter swipe.
export const HIGHLIGHT_COLORS = {
  yellow: "#FFD16642",
  pink: "#FF6FA542",
  green: "#6BCB8842",
  blue: "#5BA8FF42",
  orange: "#FF8A4C42",
};

export const DEFAULT_HIGHLIGHT = "yellow";

// Each variant is a box with a coloured spine on its left edge. The label is
// what gets printed above the body when the model gives no title of its own.
export const CALLOUT_VARIANTS = {
  definition: { role: "subheading", label: "Definition" },
  example: { role: "support", label: "Beispiel" },
  warning: { role: "signal", label: "Achtung" },
  formula: { role: "accent", label: "Formel" },
  tip: { role: "support", label: "Merke" },
};

export const TYPE_SCALE = {
  title: 30,
  heading: 24,
  subheading: 20,
  body: 18,
  caption: 14,
};

// Page backgrounds are CSS strings (gradients, colours), not a theme flag, so
// the theme is read back out of whatever the page actually paints. Averaging
// the rgb() triples is crude but only ever has to answer "light or dark".
export function themeForBackground(background) {
  const text = String(background || "");
  const channels = [...text.matchAll(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/gi)];
  if (channels.length === 0) {
    const hex = text.match(/#([0-9a-f]{6})\b/i);
    if (!hex) return NOTE_THEMES.dark;
    const value = parseInt(hex[1], 16);
    const luminance =
      ((value >> 16) & 255) * 0.299 + ((value >> 8) & 255) * 0.587 + (value & 255) * 0.114;
    return luminance > 140 ? NOTE_THEMES.paper : NOTE_THEMES.dark;
  }
  const average =
    channels.reduce(
      (total, [, r, g, b]) =>
        total + Number(r) * 0.299 + Number(g) * 0.587 + Number(b) * 0.114,
      0,
    ) / channels.length;
  return average > 140 ? NOTE_THEMES.paper : NOTE_THEMES.dark;
}

export function themeOf(document) {
  return themeForBackground(document?.pages?.[0]?.background);
}

export function roleColor(theme, role, fallbackRole = "body") {
  const resolved = theme || NOTE_THEMES.dark;
  return resolved[role] || resolved[fallbackRole] || resolved.body;
}

export function highlightColor(name) {
  return HIGHLIGHT_COLORS[name] || HIGHLIGHT_COLORS[DEFAULT_HIGHLIGHT];
}

// Written out for the system prompt so the model is told the same palette the
// presets enforce, instead of inventing hexes that clash with the page.
export function describeNoteStyle(theme) {
  const resolved = theme || NOTE_THEMES.dark;
  const isDark = resolved.id === "dark";
  return [
    `Seitenhintergrund ist ${isDark ? "dunkel" : "hell"}. Farbrollen statt freier Hex-Werte:`,
    `- body ${resolved.body} für Fließtext, heading ${resolved.heading} für Abschnittstitel, subheading ${resolved.subheading} für Zwischenüberschriften.`,
    `- accent ${resolved.accent} für Schlüsselbegriffe, support ${resolved.support} für Beispiele, signal ${resolved.signal} für Prüfungsrelevantes, muted ${resolved.muted} für Bildunterschriften und Randnotizen.`,
    `Größen: Titel ${TYPE_SCALE.title}, Überschrift ${TYPE_SCALE.heading}, Zwischenüberschrift ${TYPE_SCALE.subheading}, Fließtext ${TYPE_SCALE.body}, Bildunterschrift ${TYPE_SCALE.caption}.`,
    "Höchstens drei Farben pro Seite zusätzlich zu body. Eine Seite, auf der alles bunt ist, liest sich schlechter als eine, auf der nur das Wichtige farbig ist.",
  ];
}
