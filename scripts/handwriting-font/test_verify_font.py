from fontTools.fontBuilder import FontBuilder
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph

from verify_font import missing_chars, ligature_rules


def _build_test_font(path, with_ligature=True):
    glyph_order = [".notdef", "e", "n", "en_liga"]
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap({ord("e"): "e", ord("n"): "n"})
    fb.setupGlyf({name: Glyph() for name in glyph_order})
    fb.setupHorizontalMetrics({name: (500, 0) for name in glyph_order})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": "Test", "styleName": "Regular"})
    fb.setupOS2()
    fb.setupPost()

    if with_ligature:
        fea = "feature liga { sub e n by en_liga; } liga;"
        addOpenTypeFeaturesFromString(fb.font, fea)

    fb.font.save(path)


def test_ligature_rules_detects_present_ligature(tmp_path):
    font_path = tmp_path / "test.ttf"
    _build_test_font(font_path, with_ligature=True)
    font = TTFont(str(font_path))
    assert "en" in ligature_rules(font)


def test_ligature_rules_empty_without_gsub(tmp_path):
    font_path = tmp_path / "test.ttf"
    _build_test_font(font_path, with_ligature=False)
    font = TTFont(str(font_path))
    assert ligature_rules(font) == {}


def test_missing_chars_reports_only_uncovered_chars(tmp_path):
    font_path = tmp_path / "test.ttf"
    _build_test_font(font_path, with_ligature=True)
    font = TTFont(str(font_path))
    assert missing_chars(font, expected_chars=["e", "n", "x"]) == ["x"]
