# Handwriting Font Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Python tool that turns the user's handwriting — captured as stylus ink inside NotesAPP — into an installable `.ttf` font, with the letter pairs "en", "ei", "eu", "er" rendered as single connected (cursive) glyphs via an OpenType `liga` substitution.

**Architecture:** A fixed grid layout (`layout.py`) is the single source of truth for which glyph goes in which cell. `make_template.py` renders that grid to a PNG the user imports as a NotesAPP background image and writes over with a stylus. `extract_glyphs.py` reads the exported ink JSON, uses the background image object's own `x/y/width/height` (already stored by NotesAPP per page object) to map stroke points back into template-cell space with no manual alignment step, and turns each cell's strokes into a filled SVG outline via `shapely`'s line-buffering. `build_font.py` (run inside FontForge, installed separately) imports those SVGs and emits the `.ttf` with the ligature rules. `verify_font.py` (plain `fontTools`, no FontForge needed) sanity-checks the result.

**Tech Stack:** Python 3.10, `shapely` (stroke-to-outline), `Pillow` (template PNG), `fontTools` (font verification only), FontForge (font assembly, its own bundled Python — installed separately by the user).

**Spec:** [docs/superpowers/specs/2026-09-05-handwriting-font-design.md](../specs/2026-09-05-handwriting-font-design.md)

## Global Constraints

- Character set: `a-z A-Z 0-9 . , ! ? ' " -` plus `ä ö ü Ä Ö Ü ß`.
- Ligatures (v1 only, no more): `en`, `ei`, `eu`, `er`.
- No changes to NotesAPP's own source code — this tool only reads data NotesAPP already stores.
- All scripts live under `scripts/handwriting-font/` and are run from that directory (`pytest`, `python <script>.py`).
- Python dependencies pinned in `scripts/handwriting-font/requirements.txt`, installed via `pip install -r requirements.txt`.

---

## Task 1: Shared grid layout + capture template generator

**Files:**
- Create: `scripts/handwriting-font/requirements.txt`
- Create: `scripts/handwriting-font/layout.py`
- Create: `scripts/handwriting-font/test_layout.py`
- Create: `scripts/handwriting-font/make_template.py`
- Create: `scripts/handwriting-font/test_make_template.py`

**Interfaces:**
- Produces: `layout.GLYPHS` (`list[tuple[str, str]]`, `(filesystem-safe name, unicode char)`), `layout.LIGATURES` (`list[tuple[str, str]]`, `(letter sequence, unencoded glyph name)`), `layout.CELL_SIZE`, `layout.MARGIN`, `layout.COLUMNS` (`int`), `layout.cell_names() -> list[str]`, `layout.cell_bbox(index: int) -> tuple[float, float, float, float]` (x0, y0, x1, y1), `layout.template_size() -> tuple[int, int]`. `make_template.build_template(path: str) -> str`.
- Consumes: nothing (this is the foundation task).

- [ ] **Step 1: Create the dependency list**

```text
shapely
Pillow
fonttools
pytest
```
Save as `scripts/handwriting-font/requirements.txt`.

- [ ] **Step 2: Install dependencies**

Run: `pip install -r scripts/handwriting-font/requirements.txt`

- [ ] **Step 3: Write the failing test for the layout module**

```python
# scripts/handwriting-font/test_layout.py
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
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd scripts/handwriting-font && pytest test_layout.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'layout'`

- [ ] **Step 5: Implement the layout module**

```python
# scripts/handwriting-font/layout.py
"""Shared glyph list and grid layout for the handwriting font capture template.

GLYPHS pairs a filesystem-safe glyph name with the unicode character it
encodes. Punctuation and German characters get names because raw characters
like '?' or '"' are not valid Windows filenames.
"""

_PUNCTUATION = {
    "period": ".",
    "comma": ",",
    "exclam": "!",
    "question": "?",
    "quotesingle": "'",
    "quotedbl": '"',
    "hyphen": "-",
}
_GERMAN = {
    "adieresis": "ä",
    "odieresis": "ö",
    "udieresis": "ü",
    "Adieresis": "Ä",
    "Odieresis": "Ö",
    "Udieresis": "Ü",
    "germandbls": "ß",
}

GLYPHS = (
    [(chr(c), chr(c)) for c in range(ord("a"), ord("z") + 1)]
    + [(chr(c), chr(c)) for c in range(ord("A"), ord("Z") + 1)]
    + [(chr(c), chr(c)) for c in range(ord("0"), ord("9") + 1)]
    + list(_PUNCTUATION.items())
    + list(_GERMAN.items())
)

# (letter sequence to substitute, unencoded ligature glyph name)
LIGATURES = [
    ("en", "en_liga"),
    ("ei", "ei_liga"),
    ("eu", "eu_liga"),
    ("er", "er_liga"),
]

CELL_SIZE = 220
MARGIN = 40
COLUMNS = 9


def cell_names():
    """Filesystem-safe glyph names in fixed template order: encoded glyphs, then ligatures."""
    return [name for name, _ in GLYPHS] + [name for _, name in LIGATURES]


def cell_bbox(index):
    """Pixel bbox (x0, y0, x1, y1) of the Nth cell in template space."""
    col = index % COLUMNS
    row = index // COLUMNS
    x0 = MARGIN + col * (CELL_SIZE + MARGIN)
    y0 = MARGIN + row * (CELL_SIZE + MARGIN)
    return (x0, y0, x0 + CELL_SIZE, y0 + CELL_SIZE)


def template_size():
    """Overall (width, height) in pixels the template PNG must be."""
    count = len(cell_names())
    rows = -(-count // COLUMNS)  # ceil division
    width = MARGIN + COLUMNS * (CELL_SIZE + MARGIN)
    height = MARGIN + rows * (CELL_SIZE + MARGIN)
    return width, height
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd scripts/handwriting-font && pytest test_layout.py -v`
Expected: PASS (4 tests)

- [ ] **Step 7: Write the failing test for the template generator**

```python
# scripts/handwriting-font/test_make_template.py
from PIL import Image

from layout import template_size
from make_template import build_template


def test_build_template_creates_png_with_expected_size(tmp_path):
    output_path = tmp_path / "template.png"
    build_template(str(output_path))
    with Image.open(output_path) as img:
        assert img.size == template_size()
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `cd scripts/handwriting-font && pytest test_make_template.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'make_template'`

- [ ] **Step 9: Implement the template generator**

```python
# scripts/handwriting-font/make_template.py
"""Renders the capture grid to a PNG the user imports into NotesAPP as a
background image and writes their handwriting over."""
from PIL import Image, ImageDraw, ImageFont

from layout import cell_names, cell_bbox, template_size


def build_template(path="template.png"):
    width, height = template_size()
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default()

    for index, name in enumerate(cell_names()):
        x0, y0, x1, y1 = cell_bbox(index)
        draw.rectangle([x0, y0, x1, y1], outline="black", width=2)
        draw.text((x0 + 4, y0 + 4), name, fill="gray", font=font)

    img.save(path)
    return path


if __name__ == "__main__":
    import sys

    build_template(sys.argv[1] if len(sys.argv) > 1 else "template.png")
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `cd scripts/handwriting-font && pytest test_make_template.py -v`
Expected: PASS

- [ ] **Step 11: Generate the real template for manual inspection**

Run: `cd scripts/handwriting-font && python make_template.py template.png`
Open `template.png` and confirm: 100 labeled cells, readable captions, no overlap.

- [ ] **Step 12: Commit**

```bash
git add scripts/handwriting-font/requirements.txt scripts/handwriting-font/layout.py scripts/handwriting-font/test_layout.py scripts/handwriting-font/make_template.py scripts/handwriting-font/test_make_template.py
git commit -m "feat: add handwriting font capture grid layout and template generator"
```

---

## Task 2: Stroke extraction — ink JSON to per-glyph SVG outlines

**Files:**
- Create: `scripts/handwriting-font/extract_glyphs.py`
- Create: `scripts/handwriting-font/test_extract_glyphs.py`

**Interfaces:**
- Consumes: `layout.cell_names() -> list[str]`, `layout.cell_bbox(index: int) -> tuple[float, float, float, float]`, `layout.template_size() -> tuple[int, int]`.
- Produces: `extract_glyphs.load_document(path: str) -> dict`, `extract_glyphs.find_template_image(document: dict) -> dict`, `extract_glyphs.page_to_template(point: dict, image_obj: dict, template_w: float, template_h: float) -> tuple[float, float]`, `extract_glyphs.assign_strokes_to_cells(document: dict, image_obj: dict) -> dict[str, list[tuple[list[tuple[float, float]], float]]]`, `extract_glyphs.glyph_outline(strokes: list, bbox: tuple) -> shapely.geometry.base.BaseGeometry | None`, `extract_glyphs.write_glyph_svg(name: str, geometry, bbox: tuple, out_dir: str) -> Path`, `extract_glyphs.extract(document_path: str, out_dir: str) -> tuple[list[Path], list[str]]` (written, empty-cell-names). Writes one `<name>.svg` file per non-empty cell into `out_dir`, consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

```python
# scripts/handwriting-font/test_extract_glyphs.py
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd scripts/handwriting-font && pytest test_extract_glyphs.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'extract_glyphs'`

- [ ] **Step 3: Implement extraction**

```python
# scripts/handwriting-font/extract_glyphs.py
"""Reads an exported NotesAPP ink document and writes one SVG outline per
grid cell that has handwriting in it.

The exported document's background `image` page object already carries the
exact x/y/width/height NotesAPP placed the capture template at, so stroke
points are mapped back into template-pixel space from that — no manual
alignment between the template PNG and the page is required.
"""
import json
import sys
from pathlib import Path

from shapely.geometry import LineString
from shapely.ops import unary_union

from layout import cell_names, cell_bbox, template_size


def load_document(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def find_template_image(document):
    images = [o for o in document.get("objects", []) if o.get("type") == "image"]
    if len(images) != 1:
        raise ValueError(
            f"Expected exactly one background image object, found {len(images)}"
        )
    return images[0]


def page_to_template(point, image_obj, template_w, template_h):
    scale_x = image_obj["width"] / template_w
    scale_y = image_obj["height"] / template_h
    return (
        (point["x"] - image_obj["x"]) / scale_x,
        (point["y"] - image_obj["y"]) / scale_y,
    )


def stroke_centroid(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def assign_strokes_to_cells(document, image_obj):
    template_w, template_h = template_size()
    names = cell_names()
    bboxes = [cell_bbox(i) for i in range(len(names))]

    by_cell = {name: [] for name in names}
    for stroke in document.get("strokes", []):
        if len(stroke.get("points", [])) < 2:
            continue
        mapped = [
            page_to_template(p, image_obj, template_w, template_h)
            for p in stroke["points"]
        ]
        cx, cy = stroke_centroid(mapped)
        for name, (x0, y0, x1, y1) in zip(names, bboxes):
            if x0 <= cx <= x1 and y0 <= cy <= y1:
                by_cell[name].append((mapped, stroke["width"]))
                break
    return by_cell


def glyph_outline(strokes, bbox):
    if not strokes:
        return None
    x0, y0, _, _ = bbox
    polygons = []
    for points, width in strokes:
        local = [(x - x0, y - y0) for x, y in points]
        polygons.append(
            LineString(local).buffer(width / 2, cap_style=1, join_style=1)
        )
    return unary_union(polygons)


def polygon_to_svg_path(geometry):
    parts = []
    polys = geometry.geoms if geometry.geom_type == "MultiPolygon" else [geometry]
    for poly in polys:
        for ring in [poly.exterior, *poly.interiors]:
            coords = list(ring.coords)
            d = f"M {coords[0][0]:.2f} {coords[0][1]:.2f} "
            d += " ".join(f"L {x:.2f} {y:.2f}" for x, y in coords[1:])
            d += " Z"
            parts.append(d)
    return " ".join(parts)


def write_glyph_svg(name, geometry, bbox, out_dir):
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    path_data = polygon_to_svg_path(geometry)
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
        f'<path d="{path_data}" fill="black" fill-rule="evenodd"/></svg>'
    )
    out_path = Path(out_dir) / f"{name}.svg"
    out_path.write_text(svg, encoding="utf-8")
    return out_path


def extract(document_path, out_dir):
    document = load_document(document_path)
    image_obj = find_template_image(document)
    by_cell = assign_strokes_to_cells(document, image_obj)
    names = cell_names()
    bboxes = {name: cell_bbox(i) for i, name in enumerate(names)}

    Path(out_dir).mkdir(parents=True, exist_ok=True)
    written, empty = [], []
    for name in names:
        geometry = glyph_outline(by_cell[name], bboxes[name])
        if geometry is None:
            empty.append(name)
            continue
        written.append(write_glyph_svg(name, geometry, bboxes[name], out_dir))
    return written, empty


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python extract_glyphs.py <exported-document.json> <out-dir>")
        sys.exit(1)
    written, empty = extract(sys.argv[1], sys.argv[2])
    print(f"Wrote {len(written)} glyph SVGs to {sys.argv[2]}")
    if empty:
        print(f"No strokes found for: {', '.join(empty)}")
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd scripts/handwriting-font && pytest test_extract_glyphs.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/handwriting-font/extract_glyphs.py scripts/handwriting-font/test_extract_glyphs.py
git commit -m "feat: extract handwritten glyph outlines from exported NotesAPP ink JSON"
```

---

## Task 3: Font assembly via FontForge

**Files:**
- Create: `scripts/handwriting-font/build_font.py`

**Interfaces:**
- Consumes: `layout.GLYPHS`, `layout.LIGATURES`; SVG files named `<name>.svg` in the directory passed as `svg_dir` (produced by Task 2's `extract_glyphs.extract`).
- Produces: `build_font.build(svg_dir: str, output_path: str) -> None`, writing a `.ttf` file to `output_path`. Consumed by Task 4 (verification) and the README (Task 5).

This script runs inside FontForge's own bundled Python, not the system Python — it imports the `fontforge` module, which only exists there. It cannot be exercised by a plain `pytest` run; Task 4 provides the automated check that runs against its output.

- [ ] **Step 1: Implement the build script**

```python
# scripts/handwriting-font/build_font.py
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
```

- [ ] **Step 2: Skip any glyph SVGs missing from the capture (manual note, not code)**

If the user left a punctuation cell blank, `extract_glyphs.py` simply won't have written that `<name>.svg`, and `build()` above will raise `FileNotFoundError` on it — that's the correct signal to either go back and fill in that cell, or comment out that entry in `layout.GLYPHS` for this run. Not automated; call this out in the README (Task 5).

- [ ] **Step 3: Manual run once real glyph SVGs exist (Task 2's output)**

Run: `fontforge -script build_font.py <svg-dir> handwriting.ttf`
Expected: `handwriting.ttf` is created with no errors printed.

- [ ] **Step 4: Commit**

```bash
git add scripts/handwriting-font/build_font.py
git commit -m "feat: assemble handwriting TTF with ligature GSUB rules via FontForge"
```

---

## Task 4: Font verification (fontTools, no FontForge needed)

**Files:**
- Create: `scripts/handwriting-font/verify_font.py`
- Create: `scripts/handwriting-font/test_verify_font.py`

**Interfaces:**
- Consumes: `layout.GLYPHS`, `layout.LIGATURES`; a `.ttf` file path (produced by Task 3's `build_font.build`).
- Produces: `verify_font.missing_chars(font: TTFont, expected_chars: list[str] | None = None) -> list[str]`, `verify_font.ligature_rules(font: TTFont) -> dict[str, list[str]]`, `verify_font.verify(font_path: str) -> list[str]` (list of human-readable problems; empty means the font is correct).

- [ ] **Step 1: Write the failing tests**

```python
# scripts/handwriting-font/test_verify_font.py
from fontTools.fontBuilder import FontBuilder
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.ttLib import TTFont

from verify_font import missing_chars, ligature_rules


def _build_test_font(path, with_ligature=True):
    glyph_order = [".notdef", "e", "n", "en_liga"]
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap({ord("e"): "e", ord("n"): "n"})
    fb.setupGlyf({name: None for name in glyph_order})
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd scripts/handwriting-font && pytest test_verify_font.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'verify_font'`

- [ ] **Step 3: Implement verification**

```python
# scripts/handwriting-font/verify_font.py
import sys

from fontTools.ttLib import TTFont

from layout import GLYPHS, LIGATURES


def missing_chars(font, expected_chars=None):
    if expected_chars is None:
        expected_chars = [char for _, char in GLYPHS]
    cmap = font.getBestCmap()
    return [char for char in expected_chars if ord(char) not in cmap]


def ligature_rules(font):
    """Returns {letter-sequence: [component glyph names]} for every liga
    substitution actually present in the font's GSUB table."""
    if "GSUB" not in font:
        return {}
    gsub = font["GSUB"].table
    cmap = font.getBestCmap()
    glyph_to_char = {name: chr(codepoint) for codepoint, name in cmap.items()}

    found = {}
    for feature_record in gsub.FeatureList.FeatureRecord:
        if feature_record.FeatureTag != "liga":
            continue
        for lookup_index in feature_record.Feature.LookupListIndex:
            lookup = gsub.LookupList.Lookup[lookup_index]
            for subtable in lookup.SubTable:
                for first_glyph, ligatures in subtable.ligatures.items():
                    for lig in ligatures:
                        component_names = [first_glyph] + list(lig.Component)
                        sequence = "".join(
                            glyph_to_char.get(name, "?") for name in component_names
                        )
                        found[sequence] = component_names
    return found


def verify(font_path):
    font = TTFont(font_path)
    problems = []

    missing = missing_chars(font)
    if missing:
        problems.append(f"Missing characters in cmap: {', '.join(missing)}")

    found_ligatures = ligature_rules(font)
    for sequence, _ in LIGATURES:
        if sequence not in found_ligatures:
            problems.append(f"Missing ligature rule for '{sequence}'")

    return problems


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python verify_font.py <font.ttf>")
        sys.exit(1)
    problems = verify(sys.argv[1])
    if problems:
        print("Problems found:")
        for p in problems:
            print(f"  - {p}")
        sys.exit(1)
    print("Font looks correct: all characters and ligature rules present.")
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd scripts/handwriting-font && pytest test_verify_font.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/handwriting-font/verify_font.py scripts/handwriting-font/test_verify_font.py
git commit -m "feat: add fontTools-based sanity check for the generated handwriting font"
```

---

## Task 5: End-to-end usage README

**Files:**
- Create: `scripts/handwriting-font/README.md`

**Interfaces:**
- Consumes: every CLI entry point from Tasks 1-4 (`make_template.py`, `extract_glyphs.py`, `build_font.py`, `verify_font.py`).
- Produces: documentation only, no code.

- [ ] **Step 1: Write the walkthrough**

```markdown
# Handwriting Font Pipeline

Turns your own handwriting, written in NotesAPP with a stylus, into an
installable `.ttf` font — with "en", "ei", "eu", "er" rendered as your
connected cursive joins instead of two separate letters.

## 1. Set up

    pip install -r requirements.txt

Install FontForge separately (used only in step 4): `winget install FontForge.FontForge`.

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
```

- [ ] **Step 2: Commit**

```bash
git add scripts/handwriting-font/README.md
git commit -m "docs: add handwriting font pipeline usage walkthrough"
```
