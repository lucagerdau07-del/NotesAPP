# Document creation options: page styles + infinite whiteboard

Status: approved, not yet implemented
Date: 2026-09-03

## Problem

Creating a note today is a single click: the "+" button (and the per-subject
"Neue X-Notiz" buttons) in [`src/components/Library.jsx`](../../../src/components/Library.jsx)
call `onOpenNote?.({ title, subject })` directly — no choices, no dialog. The
underlying page model (`src/ink/inkDocument.js`, `src/documents/documentLayout.js`,
`src/components/document/DocumentPage.jsx`) only knows one shape: a vertical
stack of fixed-size (800×1131) white, blank pages rendered as one raster
`<canvas>` per page (`src/components/document/InkPageCanvas.jsx`), capped at
16,000,000 backing pixels.

We want a creation dialog offering:
1. **Page type** — normal (paged) or **whiteboard** (a true infinite,
   freely pannable/zoomable canvas, no page bounds — think tldraw/Figma, not
   GoodNotes' auto-growing page).
2. **Background color** — a preset palette (not a full color picker).
3. **Page format** — A4 portrait (current default), A4 landscape, square.
   Only applies to normal pages.
4. **Ruling** — blank, lined, grid (kariert), dot grid. Only applies to
   normal pages; whiteboard stays plain.

## Non-goals

- No free-form color picker (preset palette only, per approved answers).
- No ruling/background styling for whiteboard pages.
- No migration of existing documents — old docs simply lack the new fields
  and fall back to current defaults (`kind: "page"`, format `a4-portrait`,
  `background: "#FFFFFF"`, `ruling: "blank"`).
- No change to PDF/image import flows — this only affects newly created
  blank documents.
- No virtualized/tiled rendering beyond what's needed for smooth whiteboard
  pan/zoom at normal note-taking scale; large-scale performance tuning
  (thousands of strokes far apart) is out of scope.

## Data model

Page objects (wherever they're constructed for a *new* document — the ink
document's page list, and the render-facing `page` prop passed into
`DocumentPage`) gain:

- `kind`: `"page"` (default) | `"whiteboard"`
- `background`: hex string, e.g. `"#FFFFFF"`. Ignored when `kind === "whiteboard"`.
- `ruling`: `"blank"` (default) | `"lined"` | `"grid"` | `"dot"`. Ignored when `kind === "whiteboard"`.
- `width` / `height`: unchanged fields, now sourced from a format preset
  instead of the current hardcoded defaults, for `kind === "page"` only.

A whiteboard document is a single page with `kind: "whiteboard"` and no
meaningful `width`/`height` (the whiteboard renderer ignores them; see
below). Multi-page whiteboards are out of scope — one whiteboard = one
infinite page.

New constants module `src/documents/pageStyles.js`:

```js
export const PAGE_FORMATS = {
  "a4-portrait": { width: 800, height: 800 * 1.414 }, // current default
  "a4-landscape": { width: 800 * 1.414, height: 800 },
  "square": { width: 900, height: 900 },
};

export const BACKGROUND_PRESETS = [
  { id: "white", hex: "#FFFFFF" },
  { id: "beige", hex: "#EFECE4" }, // matches existing ink preference default
  { id: "gray", hex: "#E7E7E9" },
  { id: "dark", hex: "#1C1C1E" },
];

export const RULING_OPTIONS = ["blank", "lined", "grid", "dot"];

export function resolvePageStyle({ format, background, ruling } = {}) {
  // returns { width, height, background: hex, ruling } with defaults filled in
}
```

Existing documents (no `kind`/`background`/`ruling` stored) read back as
`undefined` and every consumer treats that the same as today's hardcoded
values via `??` fallbacks — no migration script, no schema version bump.

## Creation dialog

New `src/components/NewDocumentDialog.jsx`, opened in place of the current
direct `onOpenNote?.(...)` call:

- **Step 1 — Seitentyp**: Normal / Whiteboard (two large buttons/cards).
- **Step 2 (Normal only)** — Format (3 options), Hintergrundfarbe (4
  swatches from `BACKGROUND_PRESETS`), Linierung (4 icon buttons from
  `RULING_OPTIONS`). Whiteboard skips straight past this step.
- Title field prefilled the same way it is today (`Neue ${subject}-Notiz` /
  `Neue Notiz`), editable.
- "Erstellen" calls `onOpenNote({ title, subject, kind, format, background, ruling })`
  — whiteboard payload omits `format`/`background`/`ruling` (or leaves them
  `undefined`; `resolvePageStyle` doesn't get called for whiteboard docs).

`Library.jsx` changes: the "+" button and each "Neue X-Notiz" button open
this dialog instead of calling `onOpenNote` directly. `App.jsx`'s `openNote`
is unchanged — it already just spreads whatever note object it's given.

## Normal-page rendering (background + ruling)

`DocumentPage.jsx` currently hardcodes `backgroundColor: "#FFFFFF"`
(line 52). Change:

- `backgroundColor: page.background ?? "#FFFFFF"`
- A new ruling layer: an absolutely-positioned `div` between the background
  and the ink canvas, sized to the page, with `background-image` set from
  `page.ruling`:
  - `lined`: repeating `linear-gradient` (horizontal lines every ~32px)
  - `grid`: two overlaid `linear-gradient`s (horizontal + vertical)
  - `dot`: `radial-gradient` dot pattern via `background-image` +
    `background-size`
  - `blank`: no layer rendered
  - Pattern origin/spacing scales with `zoom` the same way the page itself
    does, so lines stay put relative to the page instead of the viewport.
- Pure CSS, no new dependency, no extra canvas or render pass.

## Whiteboard rendering (new subsystem)

The existing per-page pipeline (`calculateDocumentMetrics`,
`viewportPointToPage`/`pagePointToViewport` in `documentLayout.js`,
`InkPageCanvas`'s one-raster-per-page-at-full-size approach) assumes a
finite, vertically stacked list of bounded pages. That doesn't extend to a
freely pannable/zoomable infinite canvas — a giant raster canvas would blow
past the existing 16,000,000-backing-pixel cap almost immediately and
render blurry well before the user pans far.

New pieces:

- **`src/components/document/WhiteboardCanvas.jsx`**: a `<canvas>` sized to
  its *container viewport* (not to any page dimension), redrawn whenever
  the camera (pan/zoom) or the stroke list changes. Rendering applies a
  world→screen transform (`ctx.setTransform(scale, 0, 0, scale, -camX*scale, -camY*scale)`
  or equivalent) and draws only strokes whose bounding box intersects the
  current viewport in world space — same `renderInkStroke` primitive
  reused, just called with a different transform per frame instead of a
  fixed page-local one.
- **Camera state**: `{ x, y, scale }` in world units, owned by whichever
  component hosts the whiteboard (a new small hook, e.g.
  `useWhiteboardCamera`, mirroring the shape of existing pan/zoom state but
  independent of the page-stack scroll container). Pan = drag updates
  `x`/`y`; pinch/wheel-zoom updates `scale` around the gesture's focal
  point.
- **Pointer mapping**: a whiteboard-specific counterpart to
  `mapViewportPoint`/`viewportPointToPage` that converts a screen point to
  world coordinates via the camera transform, with **no bounds clamping**
  (existing page mapping clamps to `[0, page.width] × [0, page.height]`;
  whiteboard must not).
- **`DocumentPage.jsx`** dispatches on `page.kind`: `"page"` keeps today's
  render path unchanged; `"whiteboard"` renders `WhiteboardCanvas` inside a
  full-bleed pan/zoom container and skips `calculateDocumentMetrics`/page-
  stack layout entirely (a whiteboard document never has more than the one
  page, so there's nothing to stack).
- **Strokes/objects storage**: unchanged shape (`strokes`/`objects` arrays
  keyed by `pageId`), just interpreted as world coordinates instead of
  page-local `0..width` coordinates for a whiteboard page. Undo/redo, lasso
  selection, bucket fill, and the tool rail all operate on this same
  stroke/object data and don't need to know which coordinate space they're
  in — only the two mapping functions above and the canvas renderer do.

### Rejected alternatives

- **Very large fixed page** (reuse `InkPageCanvas` with e.g. a
  10,000×10,000 page): simplest change, but hits the 16,000,000-pixel
  raster cap almost immediately at any real zoom level (blurry), and is
  still bounded — not what was asked for (echtes freies Canvas-Pan).
- **Third-party whiteboard library** (tldraw, excalidraw, etc.): would
  duplicate the in-house ink engine — pressure curves, palm rejection,
  pointer-id handling (see recent `src/ink/` commit history) — that's
  already tuned for this app's stylus support. Wrong layer to replace for
  what's otherwise a rendering-strategy change.

## Testing

- `tests/pageStyles.test.js` (new): `resolvePageStyle` returns correct
  width/height/background/ruling for each format/preset/ruling combination,
  and sane defaults when fields are omitted (covers the no-migration
  fallback path for old documents).
- `tests/documentPage.test.jsx` or extend existing DocumentPage test:
  renders the whiteboard path when `page.kind === "whiteboard"` and the
  normal path otherwise; asserts `calculateDocumentMetrics`/page-stack
  layout is not invoked for a whiteboard page.
- Existing ink/document tests stay green unchanged — they don't set `kind`/
  `background`/`ruling` and get today's defaults via fallback.

## Open items for the implementation plan

- Exact whiteboard pan/zoom gesture wiring (mouse wheel + trackpad pinch +
  touch pinch) should follow whatever gesture-handling conventions already
  exist for the page-stack zoom (`src/hooks/useInkPointer.js` and the
  two-finger zoom/pan work referenced in
  [`2026-08-26-two-finger-zoom-pan-palm-protection-design.md`](2026-08-26-two-finger-zoom-pan-palm-protection-design.md))
  rather than being reinvented from scratch.
- Whether whiteboard pages participate in the existing PDF/image page types
  at all (answer: no — whiteboard is ink-only, `sourceType` stays unset).
