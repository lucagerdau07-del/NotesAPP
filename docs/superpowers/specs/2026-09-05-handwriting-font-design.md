# Handwriting Font Pipeline — Design

## Goal

Turn the user's own handwriting, captured via NotesAPP's existing stylus ink
layer, into an installable TrueType font (`.ttf`) that reproduces their
cursive letter joins (e.g. "en", "ei", "eu", "er" drawn as one connected
stroke) via OpenType ligature substitution, instead of rendering each letter
as an isolated glyph.

This is a standalone tooling project. It does not modify NotesAPP's runtime
code — it only *reads* ink data NotesAPP already stores.

## Why this is feasible without tracing photos

NotesAPP already stores stylus strokes as vector point data
([inkDocument.js](../../../src/ink/inkDocument.js)):

```js
{ id, pageId, tool, color, width, opacity, points: [{x, y}, ...] }
```

persisted per document under `notes-app:ink:<documentId>` in `localStorage`
([inkRepository.js:4](../../../src/ink/inkRepository.js#L4)). Each stroke is
a centerline polyline with a constant width, rendered with round caps/joins
([renderInk.js:39-66](../../../src/ink/renderInk.js#L39-L66)). That is
exactly the input a stroke-to-outline "buffer" operation needs — no
photo/scan vectorization step required.

## Character set

Basic Latin + German: `a-z A-Z 0-9 . , ! ? ' " -` plus `ä ö ü Ä Ö Ü ß`.

## Ligatures (MVP)

Four letter-pairs the user always writes as one connected glyph:
`en`, `ei`, `eu`, `er`. Each becomes one hand-written glyph (not a
programmatic join of the two separate letterforms), substituted in via an
OpenType `liga` GSUB rule, e.g. `sub e n by en.liga;`.

Only these four ship in v1. More pairs can be added later the same way if
the rendered font looks wrong without them — no need to enumerate every
possible join up front.

## Pipeline

1. **Capture template** — a labeled grid PNG (one cell per glyph, plus 4
   cells for the ligature pairs) that the user imports as a background image
   into a new NotesAPP document and writes over with the stylus, one
   character per cell, at a fixed physical size.

2. **Extraction (no app code changes)** — the user runs one line in the
   browser devtools console to copy
   `localStorage.getItem('notes-app:ink:<documentId>')` to the clipboard,
   pastes it into a `.json` file. This is a one-time manual export step, not
   a feature added to NotesAPP.

3. **Stroke → outline (Python, `shapely`)** — for each glyph cell: select the
   strokes whose points fall inside that cell's known bounding box (from the
   template layout), and for each stroke build
   `LineString(points).buffer(width/2, cap_style=1, join_style=1)` (round
   caps/joins — matches the canvas renderer's `lineCap="round"`,
   `lineJoin="round"`). Union multiple strokes per glyph (e.g. dot on an "i")
   into one polygon set. Write each glyph's polygon(s) out as an SVG file
   with the correct winding order for FontForge import.

4. **Font assembly (FontForge script)** — import each glyph SVG, position it
   using the template's known cell size to derive consistent advance
   width/side bearings, map standard glyphs to their Unicode codepoints, add
   the 4 ligature glyphs as unencoded glyphs referenced only from the `liga`
   feature, write the feature rules, generate the `.ttf`.

5. **Test** — install the generated font, type the four ligature test words
   in NotesAPP/Word, confirm the joined pairs render as the single captured
   glyph and everything else renders as individual letters.

## Out of scope (v1)

- Contextual alternates beyond the 4 listed pairs.
- Automatic curve smoothing/cleanup in FontForge (manual touch-up in the
  FontForge GUI is expected and fine).
- Any change to NotesAPP's own code or UI.

## Tools needed

- `pip install shapely` (stroke outline generation)
- FontForge (installed separately by the user, e.g. `winget install
  FontForge.FontForge`) — its bundled scripting Python builds the font and
  ligature rules.
