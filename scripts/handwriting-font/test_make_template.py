from PIL import Image

from layout import template_size, variant_template_size
from make_template import build_template, build_variant_template


def test_build_template_creates_png_with_expected_size(tmp_path):
    output_path = tmp_path / "template.png"
    build_template(str(output_path))
    with Image.open(output_path) as img:
        assert img.size == template_size()


def test_build_variant_template_creates_png_with_expected_size(tmp_path):
    output_path = tmp_path / "template_variants.png"
    build_variant_template(str(output_path))
    with Image.open(output_path) as img:
        assert img.size == variant_template_size()
