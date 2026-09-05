"""Adds a `calt` feature that rotates each letter between its captured
handwriting variants, keyed by the preceding letter, so the same letter
doesn't render identically every time it repeats in running text.

OpenType has no random-selection mechanism, so this is deterministic (the
same text always renders the same way) — the standard alternate-cycling
technique real handwriting fonts use instead of true randomness.
"""
import sys

from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.ttLib import TTFont

from layout import variant_base_names

VARIANT_COUNT = 3  # 1 = the base/encoded glyph (no substitution), 2 and 3 are extra


def variant_index(prev_name, curr_name):
    """0 = keep the base glyph, 1/2 = which extra variant (.v2/.v3) to use.

    Deterministic and stable across runs (unlike Python's built-in hash()).
    """
    total = sum(ord(c) for c in prev_name) + sum(ord(c) for c in curr_name)
    return total % VARIANT_COUNT


def build_feature_text(letter_names):
    lines = []
    for prev in letter_names:
        for curr in letter_names:
            v = variant_index(prev, curr)
            if v == 0:
                continue
            lines.append(f"    sub {prev} {curr}' by {curr}.v{v + 1};")
    body = "\n".join(lines)
    return f"feature calt {{\n{body}\n}} calt;\n"


def apply_variant_feature(font_path, letter_names=None):
    letter_names = letter_names if letter_names is not None else variant_base_names()
    font = TTFont(font_path)
    existing_glyphs = set(font.getGlyphOrder())
    # Only reference variant glyphs that actually exist — captures are
    # incremental, so v2/v3 may not all be there yet.
    usable = [name for name in letter_names if f"{name}.v2" in existing_glyphs]
    fea = build_feature_text(usable)
    addOpenTypeFeaturesFromString(font, fea)
    font.save(font_path)
    return len(usable)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python generate_variant_feature.py <font.ttf>")
        sys.exit(1)
    count = apply_variant_feature(sys.argv[1])
    print(f"Applied variant-rotation calt feature for {count} letters.")
