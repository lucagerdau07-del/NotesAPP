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
