"""Run with: fontforge -script build_font.py <svg-dir> <output.ttf>

Imports one hand-drawn glyph SVG per character (produced by
extract_glyphs.py) plus the 4 ligature glyphs, and emits a .ttf with a
`liga` GSUB rule substituting each letter pair for its connected glyph.
"""
import sys

import fontforge

from layout import GLYPHS, LIGATURES

# Matches layout.CELL_SIZE — a single flat advance width for every glyph in
# this first pass. Per-glyph spacing can be tuned later in the FontForge GUI.
ADVANCE = 220


def import_glyph_from_svg(glyph, svg_path):
    glyph.importOutlines(str(svg_path))
    glyph.width = ADVANCE


def build(svg_dir, output_path):
    font = fontforge.font()
    font.encoding = "UnicodeFull"
    font.fontname = "MyHandwriting"
    font.familyname = "My Handwriting"
    font.fullname = "My Handwriting"
    font.ascent = 200
    font.descent = 56

    glyph_by_char = {}
    for name, char in GLYPHS:
        glyph = font.createMappedChar(ord(char))
        import_glyph_from_svg(glyph, f"{svg_dir}/{name}.svg")
        glyph_by_char[char] = glyph

    font.addLookup(
        "liga_lookup", "gsub_ligature", (), (("liga", (("latn", ("dflt",)),)),)
    )
    font.addLookupSubtable("liga_lookup", "liga_subtable")

    for sequence, lig_name in LIGATURES:
        lig_glyph = font.createChar(-1, lig_name)
        import_glyph_from_svg(lig_glyph, f"{svg_dir}/{lig_name}.svg")
        component_names = tuple(glyph_by_char[c].glyphname for c in sequence)
        lig_glyph.addPosSub("liga_subtable", component_names)

    font.generate(output_path)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: fontforge -script build_font.py <svg-dir> <output.ttf>")
        sys.exit(1)
    build(sys.argv[1], sys.argv[2])
