/**
 * Casio fx-991DEX ClassWiz Math & State Engine
 */

// Helper: Convert decimal to simplest fraction (up to reasonable denominator)
export function toFraction(val, maxDenominator = 10000, tolerance = 1e-9) {
  if (!Number.isFinite(val)) return null;
  if (Math.abs(val - Math.round(val)) < tolerance) {
    return { n: Math.round(val), d: 1 };
  }

  const sign = val < 0 ? -1 : 1;
  val = Math.abs(val);

  let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
  let b = val;
  do {
    const a = Math.floor(b);
    let aux = h1;
    h1 = a * h1 + h2;
    h2 = aux;
    aux = k1;
    k1 = a * k1 + k2;
    k2 = aux;
    b = 1 / (b - a);
  } while (Math.abs(val - h1 / k1) > val * tolerance && k1 <= maxDenominator);

  if (k1 > maxDenominator) return null;
  return { n: sign * h1, d: k1 };
}

export function createCasioState() {
  return {
    tokens: [],
    cursor: 0,
    resultText: null,
    numericResult: null,
    fractionResult: null,
    isFractionMode: false,
    lastAnswer: 0,
    shift: false,
    alpha: false,
    angleMode: 'DEG', // 'DEG' or 'RAD'
    error: null,
    history: [],
  };
}

// Convert degree to radian if needed
function degToRad(angle, isDeg) {
  return isDeg ? (angle * Math.PI) / 180 : angle;
}

function radToDeg(rad, isDeg) {
  return isDeg ? (rad * 180) / Math.PI : rad;
}

export function evaluateCasioExpression(tokens, { angleMode = 'DEG', lastAnswer = 0 } = {}) {
  if (!tokens || tokens.length === 0) return { error: null, value: null };

  let raw = tokens.join('');

  // 1. Replacements for math operators
  let expr = raw
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/Ans/g, `(${lastAnswer})`)
    .replace(/π/g, `(${Math.PI})`)
    .replace(/e\b/g, `(${Math.E})`)
    .replace(/\(-/g, '(-1*')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁻¹/g, '^(-1)');

  // Unary minus at start or after operator
  expr = expr.replace(/(^|[+\-*/^(])-/g, '$1(-1)*');

  // Implicit multiplication: e.g. 2(3) -> 2*(3), 2sin -> 2*sin, )3 -> )*3, )( -> )*(
  expr = expr.replace(/(\d)(\()/g, '$1*$2');
  expr = expr.replace(/(\))(\d)/g, '$1*$2');
  expr = expr.replace(/(\))(\()/g, '$1*$2');
  expr = expr.replace(/(\d)(sin|cos|tan|ln|log|√)/g, '$1*$2');
  expr = expr.replace(/(\))(sin|cos|tan|ln|log|√)/g, '$1*$2');

  // Scientific functions handling
  const isDeg = angleMode === 'DEG';

  let jsExpr = expr
    .replace(/\^/g, '**')
    .replace(/√\(/g, 'Math.sqrt(')
    .replace(/ln\(/g, 'Math.log(')
    .replace(/log\(/g, 'Math.log10(');

  // Trig replacements
  jsExpr = jsExpr
    .replace(/sin⁻¹\(/g, '__asin(')
    .replace(/cos⁻¹\(/g, '__acos(')
    .replace(/tan⁻¹\(/g, '__atan(')
    .replace(/sin\(/g, '__sin(')
    .replace(/cos\(/g, '__cos(')
    .replace(/tan\(/g, '__tan(');

  // Auto-close missing parentheses
  let openCount = 0;
  for (const ch of jsExpr) {
    if (ch === '(') openCount++;
    if (ch === ')') openCount--;
  }
  while (openCount > 0) {
    jsExpr += ')';
    openCount--;
  }

  // Safe evaluation context
  const scope = {
    Math,
    __sin: (x) => Math.sin(degToRad(x, isDeg)),
    __cos: (x) => {
      if (isDeg && Math.abs(x % 180) === 90) return 0;
      return Math.cos(degToRad(x, isDeg));
    },
    __tan: (x) => {
      if (isDeg && Math.abs(x % 180) === 90) return NaN;
      return Math.tan(degToRad(x, isDeg));
    },
    __asin: (x) => radToDeg(Math.asin(x), isDeg),
    __acos: (x) => radToDeg(Math.acos(x), isDeg),
    __atan: (x) => radToDeg(Math.atan(x), isDeg),
  };

  try {
    if (/[^0-9+\-*/().,eE _*Mathsincoatalgqr0-9]/.test(jsExpr.replace(/__[a-z]+/g, ''))) {
      return { error: 'Syntax ERROR', value: null };
    }

    const func = new Function(...Object.keys(scope), `"use strict"; return (${jsExpr});`);
    const val = func(...Object.values(scope));

    if (val === undefined || val === null || Number.isNaN(val)) {
      return { error: 'Math ERROR', value: null };
    }
    if (!Number.isFinite(val)) {
      return { error: 'Math ERROR', value: null };
    }

    const rounded = Number(parseFloat(val.toPrecision(12)));
    return { error: null, value: rounded };
  } catch (err) {
    return { error: 'Syntax ERROR', value: null };
  }
}

export function formatCasioNumber(val) {
  if (val === null || val === undefined) return '';
  if (Math.abs(val) >= 1e10 || (Math.abs(val) > 0 && Math.abs(val) < 1e-3)) {
    return val.toExponential(6).replace('e+', '×10^').replace('e-', '×10^-');
  }
  return String(val);
}

export function handleCasioKeyPress(state, keyId) {
  const next = { ...state };

  if (next.error && keyId !== 'AC' && keyId !== 'ON') {
    next.error = null;
  }

  const isShift = next.shift;
  const isAlpha = next.alpha;

  const consumeModifiers = () => {
    next.shift = false;
    next.alpha = false;
  };

  switch (keyId) {
    case 'ON':
    case 'AC':
      next.tokens = [];
      next.cursor = 0;
      next.resultText = null;
      next.numericResult = null;
      next.fractionResult = null;
      next.isFractionMode = false;
      next.error = null;
      next.shift = false;
      next.alpha = false;
      return next;

    case 'DEL':
      if (next.tokens.length > 0 && next.cursor > 0) {
        next.tokens = [
          ...next.tokens.slice(0, next.cursor - 1),
          ...next.tokens.slice(next.cursor),
        ];
        next.cursor -= 1;
      }
      consumeModifiers();
      return next;

    case 'SHIFT':
      next.shift = !next.shift;
      next.alpha = false;
      return next;

    case 'ALPHA':
      next.alpha = !next.alpha;
      next.shift = false;
      return next;

    case 'MENU':
      if (isShift) {
        next.angleMode = next.angleMode === 'DEG' ? 'RAD' : 'DEG';
      }
      consumeModifiers();
      return next;

    case 'D_LEFT':
      if (next.cursor > 0) next.cursor -= 1;
      consumeModifiers();
      return next;

    case 'D_RIGHT':
      if (next.cursor < next.tokens.length) next.cursor += 1;
      consumeModifiers();
      return next;

    case 'D_UP':
    case 'D_DOWN':
      if (next.history.length > 0) {
        const last = next.history[next.history.length - 1];
        next.tokens = [...last.tokens];
        next.cursor = next.tokens.length;
        next.resultText = last.resultText;
        next.numericResult = last.numericResult;
      }
      consumeModifiers();
      return next;

    case 'SD': {
      if (next.numericResult !== null) {
        if (!next.fractionResult) {
          next.fractionResult = toFraction(next.numericResult);
        }
        next.isFractionMode = !next.isFractionMode;
        if (next.isFractionMode && next.fractionResult && next.fractionResult.d !== 1) {
          next.resultText = `${next.fractionResult.n} ⌟ ${next.fractionResult.d}`;
        } else {
          next.resultText = formatCasioNumber(next.numericResult);
        }
      }
      consumeModifiers();
      return next;
    }

    case 'EQUALS': {
      if (next.tokens.length === 0) return next;
      const { error, value } = evaluateCasioExpression(next.tokens, {
        angleMode: next.angleMode,
        lastAnswer: next.lastAnswer,
      });
      if (error) {
        next.error = error;
        next.resultText = null;
        next.numericResult = null;
      } else {
        next.error = null;
        next.numericResult = value;
        next.lastAnswer = value;
        next.fractionResult = toFraction(value);
        next.isFractionMode = false;
        next.resultText = formatCasioNumber(value);
        next.history = [...next.history, {
          tokens: [...next.tokens],
          resultText: next.resultText,
          numericResult: value,
        }];
      }
      consumeModifiers();
      return next;
    }

    default:
      break;
  }

  let inserted = null;

  if (isShift) {
    switch (keyId) {
      case 'EXP': inserted = 'π'; break;
      case 'ANS': inserted = '%'; break;
      case 'SQRT': inserted = '∛('; break;
      case 'SQR': inserted = '³'; break;
      case 'POW': inserted = '^(1/'; break;
      case 'LOG_B': inserted = '10^('; break;
      case 'LN': inserted = 'e^('; break;
      case 'SIN': inserted = 'sin⁻¹('; break;
      case 'COS': inserted = 'cos⁻¹('; break;
      case 'TAN': inserted = 'tan⁻¹('; break;
      case 'INV': inserted = '!'; break;
      case 'DOT': inserted = 'Ran#'; break;
      default: break;
    }
  } else if (isAlpha) {
    switch (keyId) {
      case 'EXP': inserted = 'e'; break;
      case 'CALC': inserted = '='; break;
      case 'X_VAR': inserted = 'x'; break;
      default: break;
    }
  }

  if (!inserted) {
    switch (keyId) {
      case 'NUM_0': inserted = '0'; break;
      case 'NUM_1': inserted = '1'; break;
      case 'NUM_2': inserted = '2'; break;
      case 'NUM_3': inserted = '3'; break;
      case 'NUM_4': inserted = '4'; break;
      case 'NUM_5': inserted = '5'; break;
      case 'NUM_6': inserted = '6'; break;
      case 'NUM_7': inserted = '7'; break;
      case 'NUM_8': inserted = '8'; break;
      case 'NUM_9': inserted = '9'; break;
      case 'DOT': inserted = '.'; break;
      case 'EXP': inserted = '×10^('; break;
      case 'ANS': inserted = 'Ans'; break;
      case 'PLUS': inserted = '+'; break;
      case 'MINUS': inserted = '-'; break;
      case 'MUL': inserted = '×'; break;
      case 'DIV': inserted = '÷'; break;
      case 'LPAREN': inserted = '('; break;
      case 'RPAREN': inserted = ')'; break;
      case 'NEG': inserted = '(-)'; break;
      case 'FRAC': inserted = '÷'; break;
      case 'SQRT': inserted = '√('; break;
      case 'SQR': inserted = '²'; break;
      case 'POW': inserted = '^('; break;
      case 'LOG_B': inserted = 'log('; break;
      case 'LN': inserted = 'ln('; break;
      case 'SIN': inserted = 'sin('; break;
      case 'COS': inserted = 'cos('; break;
      case 'TAN': inserted = 'tan('; break;
      case 'INV': inserted = '⁻¹'; break;
      case 'X_VAR': inserted = 'x'; break;
      default: break;
    }
  }

  if (inserted) {
    if (next.resultText && next.tokens.length === 0 && ['+', '-', '×', '÷'].includes(inserted)) {
      next.tokens = ['Ans', inserted];
      next.cursor = 2;
    } else {
      next.tokens = [
        ...next.tokens.slice(0, next.cursor),
        inserted,
        ...next.tokens.slice(next.cursor),
      ];
      next.cursor += 1;
    }
  }

  consumeModifiers();
  return next;
}
