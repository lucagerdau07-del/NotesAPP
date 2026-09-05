from layout import (
    GLYPHS,
    LIGATURES,
    _PUNCTUATION,
    cell_names,
    cell_bbox,
    template_size,
    variant_base_names,
    variant_glyph_names,
    variant_template_size,
)


def test_cell_names_count_matches_glyphs_and_ligatures():
    assert len(cell_names()) == len(GLYPHS) + len(LIGATURES)


def test_cell_names_are_unique():
    names = cell_names()
    assert len(names) == len(set(names))


def test_adjacent_cells_do_not_overlap():
    names = cell_names()
    for index in range(len(names) - 1):
        x0, y0, x1, y1 = cell_bbox(index)
        nx0, ny0, nx1, ny1 = cell_bbox(index + 1)
        assert x1 <= nx0 or y1 <= ny0 or x0 >= nx1 or y0 >= ny1


def test_template_size_covers_every_cell():
    width, height = template_size()
    for index in range(len(cell_names())):
        x0, y0, x1, y1 = cell_bbox(index)
        assert x1 <= width
        assert y1 <= height


def test_variant_base_names_excludes_punctuation():
    punctuation_names = set(_PUNCTUATION)
    assert not (set(variant_base_names()) & punctuation_names)


def test_variant_base_names_matches_non_punctuation_glyphs():
    punctuation_names = set(_PUNCTUATION)
    expected = [name for name, _ in GLYPHS if name not in punctuation_names]
    assert variant_base_names() == expected


def test_variant_glyph_names_are_unique_and_disjoint_from_cell_names():
    names = variant_glyph_names()
    assert len(names) == len(set(names))
    assert len(names) == len(variant_base_names()) * 2  # v2 + v3 each
    assert not (set(names) & set(cell_names()))


def test_no_glyph_name_is_purely_numeric():
    # A bare-digit glyph name ("0", "1", ...) parses as a CID/number
    # reference in AFDKO feature syntax, not a glyph name — breaks
    # generate_variant_feature.py's generated calt rules.
    for name, _char in GLYPHS:
        assert not name.isdigit(), name


def test_variant_template_size_covers_every_variant_cell():
    names = variant_glyph_names()
    width, height = variant_template_size()
    for index in range(len(names)):
        x0, y0, x1, y1 = cell_bbox(index)
        assert x1 <= width
        assert y1 <= height
