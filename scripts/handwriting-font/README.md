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
