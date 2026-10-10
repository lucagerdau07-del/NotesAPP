// Pure key logic for the chemistry keyboard: which character a key really
// types, given the sub/superscript mode and the text left of the caret.

const SUB = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", "+": "₊", "-": "₋", n: "ₙ", x: "ₓ" };
const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "+": "⁺", "-": "⁻", n: "ⁿ", x: "ˣ" };

// Digit straight after an element symbol, a closing bracket or another
// subscript digit: H2 -> H₂, (SO4)3 -> (SO₄)₃. "2H2O": the leading 2 stays.
const FORMULA_DIGIT_AFTER = /[A-Za-zÄÖÜäöüß)\]₀-₉]$/;

export function typedChar(ch, { script = "normal", formula = false, before = "" } = {}) {
  if (script === "sub") return SUB[ch] ?? ch;
  if (script === "sup") return SUP[ch] ?? ch;
  if (formula && /^[0-9]$/.test(ch) && FORMULA_DIGIT_AFTER.test(before)) return SUB[ch];
  return ch;
}

export const LETTER_ROWS = [
  "1234567890".split(""),
  "qwertzuiopü".split(""),
  "asdfghjklöä".split(""),
  "yxcvbnm,.".split(""),
];

export const SYMBOL_ROWS = [
  ["→", "⇌", "↔", "↑", "↓", "=", "≡", "≈", "•", "/", "~"],
  ["(", ")", "[", "]", "{", "}", "|", ":", ";", '"', "'"],
  ["α", "β", "γ", "δ", "ε", "λ", "μ", "π", "σ", "ω", "Δ"],
  ["①", "②", "③", "④", "°", "·", "±", "×", "÷", "<", ">", "ß"],
];

// Long-press alternatives (first entry is shown leftmost).
export const ALTERNATES = {
  a: ["ä", "à", "á", "â", "ã", "å", "æ"],
  e: ["é", "è", "ê", "ë", "ē"],
  i: ["í", "ì", "î", "ï"],
  o: ["ö", "ò", "ó", "ô", "õ", "ø", "œ"],
  u: ["ü", "ù", "ú", "û"],
  s: ["ß", "š", "ś"],
  c: ["ç", "č", "ć"],
  n: ["ñ", "ń"],
  y: ["ÿ", "ý"],
  z: ["ž", "ź"],
  "1": ["₁", "¹", "½"],
  "2": ["₂", "²"],
  "3": ["₃", "³"],
  "4": ["₄", "⁴"],
  "5": ["₅", "⁵"],
  "6": ["₆", "⁶"],
  "7": ["₇", "⁷"],
  "8": ["₈", "⁸"],
  "9": ["₉", "⁹"],
  "0": ["₀", "⁰", "°"],
  "+": ["±", "⁺", "₊"],
  "-": ["−", "–", "—", "⁻", "₋"],
  ".": ["…", "?", "!", ":", ";", "'", '"'],
  ",": [";", ":", "!", "?"],
};
