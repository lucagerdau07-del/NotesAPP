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
