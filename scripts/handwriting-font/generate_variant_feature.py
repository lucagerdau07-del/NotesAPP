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

from layout import variant_base_names, LIGATURES

VARIANT_COUNT = 3  # 1 = the base/encoded glyph (no substitution), 2 and 3 are extra


def variant_index(prev_name, curr_name):
    """0 = keep the base glyph, 1/2 = which extra variant (.v2/.v3) to use.

    Deterministic and stable across runs (unlike Python's built-in hash()).
    """
    total = sum(ord(c) for c in prev_name) + sum(ord(c) for c in curr_name)
    return total % VARIANT_COUNT


def build_feature_text(letter_names, ligatures=()):
    lines = []
    for prev in letter_names:
        for curr in letter_names:
            if prev == curr:
                # A repeat of the same letter needs its own chain rules
                # below — variant_index(x, x) is constant, so it can never
                # make consecutive repeats of one letter differ from each
                # other (e.g. every "b" in "bbb" picking the same variant).
                continue
            v = variant_index(prev, curr)
            if v == 0:
                continue
            lines.append(f"    sub {prev} {curr}' by {curr}.v{v + 1};")
    # Chain rules: each repeat of the same letter advances to the next
    # variant, so runs like "bbb" cycle base -> v2 -> v3 -> base instead of
    # repeating one form. Order matters: each rule is its own lookup applied
    # in sequence, so rule 2 sees rule 1's substitutions.
    for name in letter_names:
        lines.append(f"    sub {name} {name}' by {name}.v2;")
        lines.append(f"    sub {name}.v2 {name}' by {name}.v3;")
        lines.append(f"    sub {name}.v3 {name}' by {name};")
    body = "\n".join(lines)
    calt = f"feature calt {{\n{body}\n}} calt;\n"

    if not ligatures:
        return calt

    # feaLib compiles a fresh GSUB from this .fea text, replacing the whole
    # table — so the `liga` feature build_font.py already wrote via
    # FontForge's native API has to be re-declared here too, or it's lost.
    liga_lines = "\n".join(
        f"    sub {' '.join(sequence)} by {lig_name};" for sequence, lig_name in ligatures
    )
    liga = f"feature liga {{\n{liga_lines}\n}} liga;\n"

    return liga + "\n" + calt


def apply_variant_feature(font_path, letter_names=None, ligatures=None):
    letter_names = letter_names if letter_names is not None else variant_base_names()
    ligatures = ligatures if ligatures is not None else LIGATURES
    font = TTFont(font_path)
    existing_glyphs = set(font.getGlyphOrder())
    # Only rotate letters that have BOTH extra variants — captures are
    # incremental, and variant_index() can pick either one.
    usable = [
        name
        for name in letter_names
        if f"{name}.v2" in existing_glyphs and f"{name}.v3" in existing_glyphs
    ]
    # Only re-declare ligatures whose glyphs actually exist in this font
    # (keeps this function usable against small/synthetic test fonts too).
    usable_ligatures = [
        (sequence, lig_name)
        for sequence, lig_name in ligatures
        if lig_name in existing_glyphs and all(c in existing_glyphs for c in sequence)
    ]
    fea = build_feature_text(usable, usable_ligatures)
    addOpenTypeFeaturesFromString(font, fea)
    font.save(font_path)
    return len(usable)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python generate_variant_feature.py <font.ttf>")
        sys.exit(1)
    count = apply_variant_feature(sys.argv[1])
    print(f"Applied variant-rotation calt feature for {count} letters.")
