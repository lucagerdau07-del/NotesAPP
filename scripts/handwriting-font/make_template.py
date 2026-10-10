"""Renders capture grids the user imports into NotesAPP as a background
image and writes their handwriting over."""
import sys

from PIL import Image, ImageDraw, ImageFont

from layout import (
    cell_names,
    cell_bbox,
    template_size,
    variant_glyph_names,
    variant_template_size,
)


def _build(names, size, path):
    width, height = size
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default()

    for index, name in enumerate(names):
        x0, y0, x1, y1 = cell_bbox(index)
        draw.rectangle([x0, y0, x1, y1], outline="black", width=2)
        draw.text((x0 + 4, y0 + 4), name, fill="gray", font=font)

    img.save(path)
    return path


def build_template(path="template.png"):
    return _build(cell_names(), template_size(), path)


def build_variant_template(path="template_variants.png"):
    """Second-pass template: 2 extra handwriting variants (v2, v3) for every
    letter/digit/umlaut, so the font can rotate between them instead of
    reusing one identical glyph every time a letter repeats."""
    return _build(variant_glyph_names(), variant_template_size(), path)


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "template.png"
    if "--variants" in sys.argv:
        build_variant_template(target)
    else:
        build_template(target)
