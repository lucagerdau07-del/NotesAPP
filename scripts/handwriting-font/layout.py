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
# Standard PostScript digit names — a bare "0".."9" glyph name parses as a
# CID/number reference in AFDKO feature syntax (used by generate_variant_
# feature.py), not a glyph name, even when backslash-escaped.
_DIGITS = {
    "zero": "0",
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
}
_GERMAN = {
    "adieresis": "ä",
    "odieresis": "ö",
    "udieresis": "ü",
    "Adieresis_upper": "Ä",
    "Odieresis_upper": "Ö",
    "Udieresis_upper": "Ü",
    "germandbls": "ß",
}

# Uppercase letters get a "_upper" suffix: on a case-insensitive filesystem
# (Windows, default macOS) "A.svg" and "a.svg" are the same file, so plain
# single-letter names would silently collide and overwrite each other.
GLYPHS = (
    [(chr(c), chr(c)) for c in range(ord("a"), ord("z") + 1)]
    + [(chr(c) + "_upper", chr(c)) for c in range(ord("A"), ord("Z") + 1)]
    + list(_DIGITS.items())
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

# Extra handwriting variants captured for every GLYPHS entry except
# punctuation (a period looks the same every time you write it). The base
# GLYPHS glyph doubles as variant 1 — only 2 and 3 are extra unencoded
# glyphs, so existing v1 captures stay valid when this list is extended.
VARIANT_SUFFIXES = ["v2", "v3"]

CELL_SIZE = 220
MARGIN = 40
COLUMNS = 9


def cell_names():
    """Filesystem-safe glyph names in fixed template order: encoded glyphs, then ligatures."""
    return [name for name, _ in GLYPHS] + [name for _, name in LIGATURES]


def variant_base_names():
    """GLYPHS names that get extra handwriting variants (everything but punctuation)."""
    punctuation_names = set(_PUNCTUATION)
    return [name for name, _ in GLYPHS if name not in punctuation_names]


def variant_glyph_names():
    """Extra (unencoded) cell/glyph names for the 2nd/3rd handwriting variant
    of each name in variant_base_names(), e.g. "a.v2", "a.v3"."""
    return [
        f"{name}.{suffix}"
        for name in variant_base_names()
        for suffix in VARIANT_SUFFIXES
    ]


def cell_bbox(index):
    """Pixel bbox (x0, y0, x1, y1) of the Nth cell in template space."""
    col = index % COLUMNS
    row = index // COLUMNS
    x0 = MARGIN + col * (CELL_SIZE + MARGIN)
    y0 = MARGIN + row * (CELL_SIZE + MARGIN)
    return (x0, y0, x0 + CELL_SIZE, y0 + CELL_SIZE)


def _grid_size(count):
    rows = -(-count // COLUMNS)  # ceil division
    width = MARGIN + COLUMNS * (CELL_SIZE + MARGIN)
    height = MARGIN + rows * (CELL_SIZE + MARGIN)
    return width, height


def template_size():
    """Overall (width, height) in pixels the main template PNG must be."""
    return _grid_size(len(cell_names()))


def variant_template_size():
    """Overall (width, height) in pixels the variants template PNG must be."""
    return _grid_size(len(variant_glyph_names()))
