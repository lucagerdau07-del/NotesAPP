import io

import uharfbuzz as hb
from fontTools.fontBuilder import FontBuilder
from fontTools.ttLib.tables._g_l_y_f import Glyph

from generate_variant_feature import variant_index, apply_variant_feature


_BASE = ["a", "b", "c"]
_VARIANTS = [f"{c}.v2" for c in _BASE] + [f"{c}.v3" for c in _BASE]
_GLYPH_ORDER = [".notdef"] + _BASE + _VARIANTS


def _build_test_font(path):
    glyph_order = _GLYPH_ORDER
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap({ord(c): c for c in _BASE})
    fb.setupGlyf({name: Glyph() for name in glyph_order})
    fb.setupHorizontalMetrics({name: (500, 0) for name in glyph_order})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": "Test", "styleName": "Regular"})
    fb.setupOS2()
    fb.setupPost()
    fb.font.save(path)


def _shape_glyph_names(font_path, text):
    with open(font_path, "rb") as f:
        data = f.read()
    face = hb.Face(data)
    font = hb.Font(face)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, {"calt": True})
    return [_GLYPH_ORDER[info.codepoint] for info in buf.glyph_infos]


def test_variant_index_deterministic_across_calls():
    assert variant_index("a", "c") == variant_index("a", "c")


def test_variant_index_covers_all_three_slots():
    seen = {variant_index(p, c) for p in "abc" for c in "abc"}
    assert seen == {0, 1, 2}


def test_shaping_picks_expected_variant_or_base(tmp_path):
    font_path = tmp_path / "test.ttf"
    _build_test_font(font_path)
    used = apply_variant_feature(str(font_path), letter_names=["a", "b", "c"])
    assert used == 3

    # a -> c: variant_index("a","c") == 1 -> expect "c.v2"
    assert _shape_glyph_names(str(font_path), "ac") == ["a", "c.v2"]
    # b -> c: variant_index("b","c") == 2 -> expect "c.v3"
    assert _shape_glyph_names(str(font_path), "bc") == ["b", "c.v3"]
    # a -> b: variant_index("a","b") == 0 -> base glyph, no substitution
    assert _shape_glyph_names(str(font_path), "ab") == ["a", "b"]


def test_apply_variant_feature_skips_letters_missing_variants(tmp_path):
    font_path = tmp_path / "test.ttf"
    _build_test_font(font_path)
    used = apply_variant_feature(str(font_path), letter_names=["a", "b", "c", "z"])
    assert used == 3  # "z" has no captured .v2/.v3 glyphs, so it's skipped
