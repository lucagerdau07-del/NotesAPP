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
