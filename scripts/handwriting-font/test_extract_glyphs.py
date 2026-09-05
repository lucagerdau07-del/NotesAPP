import pytest

from layout import cell_bbox, cell_names, template_size
from extract_glyphs import assign_strokes_to_cells, glyph_outline, find_template_image


def _make_document_with_stroke_in_cell(cell_index, scale=2.0, offset=(50, 30)):
    template_w, template_h = template_size()
    x0, y0, x1, y1 = cell_bbox(cell_index)
    # A short horizontal stroke through the middle of the cell, in template space.
    template_points = [(x0 + 20, (y0 + y1) / 2), (x1 - 20, (y0 + y1) / 2)]
    # Map template space -> page space the same way NotesAPP's background
    # image object would place the template on the page.
    page_points = [
        {"x": offset[0] + tx * scale, "y": offset[1] + ty * scale}
        for tx, ty in template_points
    ]
    image_obj = {
        "type": "image",
        "x": offset[0],
        "y": offset[1],
        "width": template_w * scale,
        "height": template_h * scale,
    }
    document = {
        "objects": [image_obj],
        "strokes": [
            {"id": "s1", "pageId": "p1", "tool": "pen", "width": 6, "points": page_points}
        ],
    }
    return document, image_obj


def test_assign_strokes_to_cells_maps_stroke_back_to_its_cell():
    document, image_obj = _make_document_with_stroke_in_cell(cell_index=5)
    by_cell = assign_strokes_to_cells(document, image_obj)
    target_name = cell_names()[5]
    assert len(by_cell[target_name]) == 1
    other_names = [name for name in cell_names() if name != target_name]
    assert all(len(by_cell[name]) == 0 for name in other_names)


def test_glyph_outline_produces_nonempty_polygon():
    document, image_obj = _make_document_with_stroke_in_cell(cell_index=0)
    by_cell = assign_strokes_to_cells(document, image_obj)
    name = cell_names()[0]
    bbox = cell_bbox(0)
    geometry = glyph_outline(by_cell[name], bbox)
    assert geometry is not None
    assert geometry.area > 0


def test_glyph_outline_returns_none_for_empty_cell():
    assert glyph_outline([], (0, 0, 220, 220)) is None


def test_find_template_image_requires_exactly_one_image():
    with pytest.raises(ValueError):
        find_template_image({"objects": []})
    with pytest.raises(ValueError):
        find_template_image({"objects": [{"type": "image"}, {"type": "image"}]})
