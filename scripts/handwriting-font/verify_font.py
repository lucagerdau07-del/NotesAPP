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
