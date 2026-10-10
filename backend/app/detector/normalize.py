"""Text normalisation used before rule matching.

Scammers obfuscate keywords with zero-width characters, look-alike letters
from other scripts, and full-width forms. We normalise to a canonical form
for matching, while keeping a character map so evidence spans can be shown
against the original text.
"""
from __future__ import annotations

import unicodedata
from dataclasses import dataclass

ZERO_WIDTH = {"​", "‌", "‍", "⁠", "﻿", "­"}

# A small, deliberate confusables table (Cyrillic / Greek letters that render
# like Latin ones). Not exhaustive; see docs/threat-model.md.
CONFUSABLES = {
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x",
    "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "ɡ": "g", "һ": "h", "ӏ": "l",
    "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O",
    "Р": "P", "С": "C", "Т": "T", "Х": "X", "Ү": "Y",
    "α": "a", "ο": "o", "ν": "v", "ρ": "p", "τ": "t", "ι": "i", "κ": "k",
    "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K",
    "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
}


@dataclass
class NormalizedText:
    original: str
    text: str            # normalised, lower-cased text used for matching
    index_map: list[int]  # index_map[i] = index in original for text[i]
    zero_width_count: int
    confusable_count: int

    def span_to_original(self, start: int, end: int) -> tuple[int, int]:
        if not self.index_map:
            return (0, 0)
        start = min(start, len(self.index_map) - 1)
        end_idx = min(max(end - 1, start), len(self.index_map) - 1)
        return self.index_map[start], self.index_map[end_idx] + 1


def normalize(original: str) -> NormalizedText:
    out_chars: list[str] = []
    index_map: list[int] = []
    zero_width = 0
    confusable = 0
    for i, ch in enumerate(original):
        if ch in ZERO_WIDTH:
            zero_width += 1
            continue
        if ch in CONFUSABLES:
            confusable += 1
            ch = CONFUSABLES[ch]
        # NFKC folds full-width and stylised letters (e.g. "ＯＴＰ" -> "OTP").
        folded = unicodedata.normalize("NFKC", ch).lower()
        for f in folded:
            out_chars.append(f)
            index_map.append(i)
    return NormalizedText(
        original=original,
        text="".join(out_chars),
        index_map=index_map,
        zero_width_count=zero_width,
        confusable_count=confusable,
    )
