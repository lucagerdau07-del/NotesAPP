"""Run with: fontforge -script build_font.py <svg-dir> <output.ttf>

Imports one hand-drawn glyph SVG per character (produced by
extract_glyphs.py) plus the 4 ligature glyphs, and emits a .ttf with a
`liga` GSUB rule substituting each letter pair for its connected glyph.
"""
import sys
from pathlib import Path

import fontforge
import psMat

from layout import GLYPHS, LIGATURES, variant_glyph_names

# Fallback advance for a glyph with no ink (shouldn't happen — empty cells
# are skipped during extraction). Matches layout.CELL_SIZE.
FALLBACK_ADVANCE = 220
LEFT_BEARING = 15
RIGHT_BEARING = 25


def import_glyph_from_svg(glyph, svg_path):
    glyph.importOutlines(str(svg_path))
    xmin, _ymin, xmax, _ymax = glyph.boundingBox()
    if xmax <= xmin:
        glyph.width = FALLBACK_ADVANCE
        return
    # Advance width tracks each glyph's actual ink width instead of a flat
    # cell-sized advance, so narrow letters ("i", "l", "1") sit closer to
    # their neighbors and wide ones ("m", "w") keep their natural spacing.
    glyph.transform(psMat.translate(-xmin + LEFT_BEARING, 0))
    glyph.width = int(xmax - xmin) + LEFT_BEARING + RIGHT_BEARING


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
        # createMappedChar renames the glyph to the standard AGL name for its
        # codepoint (e.g. "A_upper" -> "A") unless we pin it back — variant
        # glyph names ("A_upper.v2") and the calt feature both key off our
        # own layout.py names, not FontForge's.
        glyph.glyphname = name
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

    # Optional: 2nd/3rd handwriting variants, captured separately (see
    # make_template.py --variants). Skipped when not yet captured so the
    # font still builds with just the base letters.
    for variant_name in variant_glyph_names():
        svg_path = Path(svg_dir) / f"{variant_name}.svg"
        if not svg_path.exists():
            continue
        glyph = font.createChar(-1, variant_name)
        import_glyph_from_svg(glyph, svg_path)

    font.generate(output_path)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: fontforge -script build_font.py <svg-dir> <output.ttf>")
        sys.exit(1)
    build(sys.argv[1], sys.argv[2])
