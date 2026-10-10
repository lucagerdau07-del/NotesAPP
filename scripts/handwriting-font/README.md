# Handwriting Font Pipeline

Turns your own handwriting, written in NotesAPP with a stylus, into an
installable `.ttf` font — with "en", "ei", "eu", "er" rendered as your
connected cursive joins instead of two separate letters.

## 1. Set up

    pip install -r requirements.txt

Install FontForge separately (used only in step 6): `winget install FontForge.FontForge`.

## 2. Generate the capture template

    python make_template.py template.png

Opens as a grid of 100 labeled cells (one per character, plus 4 for the
"en"/"ei"/"eu"/"er" ligatures).

## 3. Write your handwriting

In NotesAPP: create a new document, import `template.png` as a background
image, and write one character per cell with your stylus — including the
4 ligature cells, where you write the pair exactly as you'd write it
connected in a real word.

## 4. Export the ink data

In the browser devtools console, with that document open:

    copy(localStorage.getItem('notes-app:ink:' + <documentId>))

Paste the clipboard contents into a file, e.g. `handwriting.json`.
(Find `<documentId>` from the app's URL or document list.)

## 5. Extract glyph outlines

    python extract_glyphs.py handwriting.json glyphs/

Prints how many glyph SVGs were written, and lists any cells with no
strokes (fine to leave blank if you don't need that character — just
remove the matching entry from `layout.GLYPHS`/`LIGATURES` before step 6,
or `build_font.py` will fail looking for that file).

## 6. Build the font

    fontforge -script build_font.py glyphs/ handwriting.ttf

## 7. Verify it

    python verify_font.py handwriting.ttf

## 8. Install and test

Double-click `handwriting.ttf` and choose Install. Then, in any app, type:
`Regen`, `mein`, `Feuer`, `er` — the en/ei/eu/er pairs should render as
your single connected glyph; everything else as individual letters.

## 9. Optional: extra handwriting variants (more natural look)

Every letter/digit/umlaut so far renders with the exact same glyph every
time it repeats. To rotate between 3 slightly different versions of each
letter instead (the standard trick real handwriting fonts use — OpenType
has no true randomness, so it's a deterministic rotation keyed by the
preceding letter, not a dice roll):

    python make_template.py template_variants.png --variants

Write 2 *more* versions of each letter (labeled `<name>.v2` / `<name>.v3`
— your original capture already is variant 1) the same way as step 3, then:

    python extract_glyphs.py handwriting_variants.json glyphs/ --variants

This writes into the *same* `glyphs/` folder as before, so re-run step 6
(`build_font.py`) to bake them in, then apply the rotation rule:

    python generate_variant_feature.py handwriting.ttf

You can capture variants incrementally — any letter without a `.v2`/`.v3`
SVG yet is simply left out of the rotation and keeps rendering as before.
