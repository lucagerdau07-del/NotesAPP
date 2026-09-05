from layout import GLYPHS, LIGATURES, cell_names, cell_bbox, template_size


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
