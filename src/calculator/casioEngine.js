/**
 * Casio fx-991DEX ClassWiz Natural V.P.A.M. Engine
 * Supports 2D textbook math templates (Fractions, Roots, Powers, Integrals)
 * and interactive cursor/box navigation matching the physical calculator.
 */

let idCounter = 1;
export function nextId() {
  return `casio_node_${idCounter++}`;
}

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
    items: [],
    cursorTarget: { nodeId: null, slot: null, index: 0 },
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

function degToRad(angle, isDeg) {
  return isDeg ? (angle * Math.PI) / 180 : angle;
}

function radToDeg(rad, isDeg) {
  return isDeg ? (rad * 180) / Math.PI : rad;
}

// Find a node and its parent list inside the tree
export function findNodeAndParent(items, nodeId) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item === 'object' && item !== null) {
      if (item.id === nodeId) {
        return { node: item, parentList: items, indexInParent: i };
      }
      if (item.type === 'frac') {
        const inNum = findNodeAndParent(item.num, nodeId);
        if (inNum) return inNum;
        const inDen = findNodeAndParent(item.den, nodeId);
        if (inDen) return inDen;
      } else if (item.type === 'sqrt') {
        const inContent = findNodeAndParent(item.content, nodeId);
        if (inContent) return inContent;
      } else if (item.type === 'pow') {
        const inBase = findNodeAndParent(item.base, nodeId);
        if (inBase) return inBase;
        const inExp = findNodeAndParent(item.exp, nodeId);
        if (inExp) return inExp;
      } else if (item.type === 'integral') {
        const inIntegrand = findNodeAndParent(item.integrand, nodeId);
        if (inIntegrand) return inIntegrand;
        const inLower = findNodeAndParent(item.lower, nodeId);
        if (inLower) return inLower;
        const inUpper = findNodeAndParent(item.upper, nodeId);
        if (inUpper) return inUpper;
      }
    }
  }
  return null;
}

// Get the array currently pointed to by cursorTarget
export function getTargetArray(items, cursorTarget) {
  if (!cursorTarget.nodeId) {
    return items;
  }
  const found = findNodeAndParent(items, cursorTarget.nodeId);
  if (!found || !found.node) return items;
  return found.node[cursorTarget.slot] || items;
}

// Convert a tree of items into an evaluatable math expression string
export function treeToMathString(items, { angleMode = 'DEG', lastAnswer = 0 } = {}) {
  let res = '';
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item === 'string') {
      let t = item;
      if (t === '×') t = '*';
      else if (t === '÷') t = '/';
      else if (t === 'Ans') t = `(${lastAnswer})`;
      else if (t === 'π') t = `(${Math.PI})`;
      else if (t === 'e') t = `(${Math.E})`;
      else if (t === '(-)') t = '(-1)*';
      else if (t === '²') t = '^2';
      else if (t === '³') t = '^3';
      else if (t === '⁻¹') t = '^(-1)';
      res += t;
    } else if (item && typeof item === 'object') {
      if (item.type === 'frac') {
        const numStr = treeToMathString(item.num.length ? item.num : ['0'], { angleMode, lastAnswer });
        const denStr = treeToMathString(item.den.length ? item.den : ['1'], { angleMode, lastAnswer });
        res += `((${numStr})/(${denStr}))`;
      } else if (item.type === 'sqrt') {
        const contentStr = treeToMathString(item.content.length ? item.content : ['0'], { angleMode, lastAnswer });
        res += `Math.sqrt(${contentStr})`;
      } else if (item.type === 'pow') {
        const baseStr = treeToMathString(item.base.length ? item.base : ['0'], { angleMode, lastAnswer });
        const expStr = treeToMathString(item.exp.length ? item.exp : ['1'], { angleMode, lastAnswer });
        res += `((${baseStr})**(${expStr}))`;
      } else if (item.type === 'integral') {
        // Numerical integration using Simpson's composite rule for x
        const lowerStr = treeToMathString(item.lower.length ? item.lower : ['0'], { angleMode, lastAnswer });
        const upperStr = treeToMathString(item.upper.length ? item.upper : ['1'], { angleMode, lastAnswer });
        const funcStr = treeToMathString(item.integrand.length ? item.integrand : ['x'], { angleMode, lastAnswer });
        res += `__integrate((${lowerStr}), (${upperStr}), (x) => (${funcStr}))`;
      }
    }
  }
  return res;
}

// Numerical integration helper (Simpson's 1/3 rule)
function numericalIntegrate(a, b, fn, steps = 30) {
  if (a === b) return 0;
  const n = steps % 2 === 0 ? steps : steps + 1;
  const h = (b - a) / n;
  let sum = fn(a) + fn(b);
  for (let i = 1; i < n; i++) {
    const x = a + i * h;
    sum += (i % 2 === 0 ? 2 : 4) * fn(x);
  }
  return (h / 3) * sum;
}

export function evaluateCasioTree(items, { angleMode = 'DEG', lastAnswer = 0 } = {}) {
  if (!items || items.length === 0) return { error: null, value: null };

  let raw = treeToMathString(items, { angleMode, lastAnswer });
  if (!raw || raw.trim() === '') return { error: null, value: null };

  // Implicit multiplication: e.g. 2(3) -> 2*(3), 2sin -> 2*sin, )3 -> )*3, )( -> )*(
  raw = raw.replace(/(\d)(\()/g, '$1*$2');
  raw = raw.replace(/(\))(\d)/g, '$1*$2');
  raw = raw.replace(/(\))(\()/g, '$1*$2');
  raw = raw.replace(/(\d)(sin|cos|tan|ln|log|Math\.sqrt)/g, '$1*$2');
  raw = raw.replace(/(\))(sin|cos|tan|ln|log|Math\.sqrt)/g, '$1*$2');

  const isDeg = angleMode === 'DEG';

  let jsExpr = raw
    .replace(/\^/g, '**')
    .replace(/ln\(/g, 'Math.log(')
    .replace(/log\(/g, 'Math.log10(')
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

  const scope = {
    Math,
    __integrate: (a, b, f) => numericalIntegrate(a, b, f),
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
    const func = new Function(...Object.keys(scope), `"use strict"; return (${jsExpr});`);
    const val = func(...Object.values(scope));

    if (val === undefined || val === null || Number.isNaN(val) || !Number.isFinite(val)) {
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

export function containsFractionOrDivision(items) {
  if (!items || !Array.isArray(items)) return false;
  for (const item of items) {
    if (item === '÷') return true;
    if (typeof item === 'object' && item !== null) {
      if (item.type === 'frac') return true;
      if (item.type === 'sqrt' && containsFractionOrDivision(item.content)) return true;
      if (item.type === 'pow' && (containsFractionOrDivision(item.base) || containsFractionOrDivision(item.exp))) return true;
      if (item.type === 'integral' && (containsFractionOrDivision(item.integrand) || containsFractionOrDivision(item.lower) || containsFractionOrDivision(item.upper))) return true;
    }
  }
  return false;
}

export function handleCasioKeyPress(state, keyId) {
  const next = {
    ...state,
    items: JSON.parse(JSON.stringify(state.items)),
    cursorTarget: { ...state.cursorTarget },
  };

  if (next.error && keyId !== 'AC' && keyId !== 'ON') {
    next.error = null;
  }

  const isShift = next.shift;
  const isAlpha = next.alpha;

  const consumeModifiers = () => {
    next.shift = false;
    next.alpha = false;
  };

  // Helper to insert into the currently targeted slot
  const insertToken = (token) => {
    const arr = getTargetArray(next.items, next.cursorTarget);
    const idx = next.cursorTarget.index;
    arr.splice(idx, 0, token);
    next.cursorTarget.index = idx + 1;
  };

  switch (keyId) {
    case 'ON':
    case 'AC':
      next.items = [];
      next.cursorTarget = { nodeId: null, slot: null, index: 0 };
      next.resultText = null;
      next.numericResult = null;
      next.fractionResult = null;
      next.isFractionMode = false;
      next.error = null;
      next.shift = false;
      next.alpha = false;
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

    case 'SD': {
      if (next.numericResult !== null) {
        if (!next.fractionResult) {
          next.fractionResult = toFraction(next.numericResult);
        }
        if (next.fractionResult && next.fractionResult.d !== 1) {
          next.isFractionMode = !next.isFractionMode;
          if (next.isFractionMode) {
            next.resultText = `${next.fractionResult.n}/${next.fractionResult.d}`;
          } else {
            next.resultText = formatCasioNumber(next.numericResult);
          }
        }
      }
      consumeModifiers();
      return next;
    }

    case 'EQUALS': {
      if (next.items.length === 0) return next;
      const { error, value } = evaluateCasioTree(next.items, {
        angleMode: next.angleMode,
        lastAnswer: next.lastAnswer,
      });
      if (error) {
        next.error = error;
        next.resultText = null;
        next.numericResult = null;
        next.fractionResult = null;
        next.isFractionMode = false;
      } else {
        next.error = null;
        next.numericResult = value;
        next.lastAnswer = value;
        next.fractionResult = toFraction(value);
        const hasFrac = containsFractionOrDivision(next.items);
        if (hasFrac && next.fractionResult && next.fractionResult.d !== 1) {
          next.isFractionMode = true;
          next.resultText = `${next.fractionResult.n}/${next.fractionResult.d}`;
        } else {
          next.isFractionMode = false;
          next.resultText = formatCasioNumber(value);
        }
        next.history = [...next.history, {
          items: JSON.parse(JSON.stringify(next.items)),
          resultText: next.resultText,
          numericResult: value,
          fractionResult: next.fractionResult,
          isFractionMode: next.isFractionMode,
        }];
      }
      consumeModifiers();
      return next;
    }

    case 'D_LEFT': {
      if (next.cursorTarget.index > 0) {
        next.cursorTarget.index -= 1;
      } else if (next.cursorTarget.nodeId) {
        // Move before node in parent
        const found = findNodeAndParent(next.items, next.cursorTarget.nodeId);
        if (found) {
          // If in frac.den, moving left goes to frac.num
          if (found.node.type === 'frac' && next.cursorTarget.slot === 'den') {
            next.cursorTarget.slot = 'num';
            next.cursorTarget.index = found.node.num.length;
          } else if (found.node.type === 'pow' && next.cursorTarget.slot === 'exp') {
            next.cursorTarget.slot = 'base';
            next.cursorTarget.index = found.node.base.length;
          } else {
            // Exit to parent
            next.cursorTarget.nodeId = null;
            next.cursorTarget.slot = null;
            next.cursorTarget.index = found.indexInParent;
          }
        }
      }
      consumeModifiers();
      return next;
    }

    case 'D_RIGHT': {
      const arr = getTargetArray(next.items, next.cursorTarget);
      if (next.cursorTarget.index < arr.length) {
        const nextItem = arr[next.cursorTarget.index];
        if (typeof nextItem === 'object' && nextItem !== null) {
          // Enter the node
          if (nextItem.type === 'frac') {
            next.cursorTarget = { nodeId: nextItem.id, slot: 'num', index: 0 };
          } else if (nextItem.type === 'sqrt') {
            next.cursorTarget = { nodeId: nextItem.id, slot: 'content', index: 0 };
          } else if (nextItem.type === 'pow') {
            next.cursorTarget = { nodeId: nextItem.id, slot: 'base', index: 0 };
          } else if (nextItem.type === 'integral') {
            next.cursorTarget = { nodeId: nextItem.id, slot: 'integrand', index: 0 };
          }
        } else {
          next.cursorTarget.index += 1;
        }
      } else if (next.cursorTarget.nodeId) {
        // At end of slot in node
        const found = findNodeAndParent(next.items, next.cursorTarget.nodeId);
        if (found) {
          if (found.node.type === 'frac' && next.cursorTarget.slot === 'num') {
            next.cursorTarget.slot = 'den';
            next.cursorTarget.index = 0;
          } else if (found.node.type === 'pow' && next.cursorTarget.slot === 'base') {
            next.cursorTarget.slot = 'exp';
            next.cursorTarget.index = 0;
          } else {
            // Exit to parent after this node
            next.cursorTarget.nodeId = null;
            next.cursorTarget.slot = null;
            next.cursorTarget.index = found.indexInParent + 1;
          }
        }
      }
      consumeModifiers();
      return next;
    }

    case 'D_UP': {
      if (next.cursorTarget.nodeId) {
        const found = findNodeAndParent(next.items, next.cursorTarget.nodeId);
        if (found) {
          if (found.node.type === 'frac' && next.cursorTarget.slot === 'den') {
            next.cursorTarget.slot = 'num';
            next.cursorTarget.index = found.node.num.length;
          } else if (found.node.type === 'pow' && next.cursorTarget.slot === 'base') {
            next.cursorTarget.slot = 'exp';
            next.cursorTarget.index = 0;
          } else if (found.node.type === 'integral') {
            if (next.cursorTarget.slot === 'lower') {
              next.cursorTarget.slot = 'integrand';
              next.cursorTarget.index = 0;
            } else if (next.cursorTarget.slot === 'integrand') {
              next.cursorTarget.slot = 'upper';
              next.cursorTarget.index = 0;
            }
          }
        }
      } else if (next.history.length > 0) {
        const last = next.history[next.history.length - 1];
        next.items = JSON.parse(JSON.stringify(last.items));
        next.cursorTarget = { nodeId: null, slot: null, index: next.items.length };
        next.resultText = last.resultText;
        next.numericResult = last.numericResult;
        next.fractionResult = last.fractionResult || toFraction(last.numericResult);
        next.isFractionMode = !!last.isFractionMode;
      }
      consumeModifiers();
      return next;
    }

    case 'D_DOWN': {
      if (next.cursorTarget.nodeId) {
        const found = findNodeAndParent(next.items, next.cursorTarget.nodeId);
        if (found) {
          if (found.node.type === 'frac' && next.cursorTarget.slot === 'num') {
            next.cursorTarget.slot = 'den';
            next.cursorTarget.index = 0;
          } else if (found.node.type === 'pow' && next.cursorTarget.slot === 'exp') {
            next.cursorTarget.slot = 'base';
            next.cursorTarget.index = found.node.base.length;
          } else if (found.node.type === 'integral') {
            if (next.cursorTarget.slot === 'upper') {
              next.cursorTarget.slot = 'integrand';
              next.cursorTarget.index = 0;
            } else if (next.cursorTarget.slot === 'integrand') {
              next.cursorTarget.slot = 'lower';
              next.cursorTarget.index = 0;
            }
          }
        }
      }
      consumeModifiers();
      return next;
    }

    case 'DEL': {
      const arr = getTargetArray(next.items, next.cursorTarget);
      if (next.cursorTarget.index > 0) {
        arr.splice(next.cursorTarget.index - 1, 1);
        next.cursorTarget.index -= 1;
      } else if (next.cursorTarget.nodeId) {
        // Inside a node at index 0
        const found = findNodeAndParent(next.items, next.cursorTarget.nodeId);
        if (found) {
          // Check if entire node is empty
          const isNodeEmpty =
            (found.node.type === 'frac' && found.node.num.length === 0 && found.node.den.length === 0) ||
            (found.node.type === 'sqrt' && found.node.content.length === 0) ||
            (found.node.type === 'pow' && found.node.base.length === 0 && found.node.exp.length === 0) ||
            (found.node.type === 'integral' && found.node.integrand.length === 0);

          if (isNodeEmpty) {
            // Delete the empty template node completely
            found.parentList.splice(found.indexInParent, 1);
            next.cursorTarget = { nodeId: null, slot: null, index: found.indexInParent };
          } else if (found.node.type === 'frac' && next.cursorTarget.slot === 'den') {
            next.cursorTarget.slot = 'num';
            next.cursorTarget.index = found.node.num.length;
          } else {
            // Exit node
            next.cursorTarget = { nodeId: null, slot: null, index: found.indexInParent };
          }
        }
      }
      consumeModifiers();
      return next;
    }

    // --- Natural V.P.A.M. Template Keys ---

    case 'FRAC': {
      // Create fraction node
      const fracId = nextId();
      const arr = getTargetArray(next.items, next.cursorTarget);
      const idx = next.cursorTarget.index;

      // If preceded by a number or Ans, place it in numerator
      let numItems = [];
      let startSlot = 'den';
      if (idx > 0 && typeof arr[idx - 1] === 'string' && /^[0-9Ansπe]$/.test(arr[idx - 1])) {
        numItems = [arr.splice(idx - 1, 1)[0]];
        next.cursorTarget.index = idx - 1;
      } else {
        startSlot = 'num';
      }

      const fracNode = {
        type: 'frac',
        id: fracId,
        num: numItems,
        den: [],
      };

      arr.splice(next.cursorTarget.index, 0, fracNode);
      next.cursorTarget = { nodeId: fracId, slot: startSlot, index: 0 };
      consumeModifiers();
      return next;
    }

    case 'SQRT': {
      const sqrtId = nextId();
      const arr = getTargetArray(next.items, next.cursorTarget);
      const idx = next.cursorTarget.index;

      const sqrtNode = {
        type: 'sqrt',
        id: sqrtId,
        content: [],
      };

      arr.splice(idx, 0, sqrtNode);
      next.cursorTarget = { nodeId: sqrtId, slot: 'content', index: 0 };
      consumeModifiers();
      return next;
    }

    case 'POW': {
      const powId = nextId();
      const arr = getTargetArray(next.items, next.cursorTarget);
      const idx = next.cursorTarget.index;

      let baseItems = [];
      let startSlot = 'exp';
      if (idx > 0) {
        // Take preceding item as base
        baseItems = [arr.splice(idx - 1, 1)[0]];
        next.cursorTarget.index = idx - 1;
      } else {
        // Both base and exp empty (shows [][])
        startSlot = 'base';
      }

      const powNode = {
        type: 'pow',
        id: powId,
        base: baseItems,
        exp: [],
      };

      arr.splice(next.cursorTarget.index, 0, powNode);
      next.cursorTarget = { nodeId: powId, slot: startSlot, index: 0 };
      consumeModifiers();
      return next;
    }

    case 'SQR': {
      // x²: power with fixed exponent 2
      const powId = nextId();
      const arr = getTargetArray(next.items, next.cursorTarget);
      const idx = next.cursorTarget.index;

      let baseItems = [];
      if (idx > 0) {
        baseItems = [arr.splice(idx - 1, 1)[0]];
        next.cursorTarget.index = idx - 1;
      }

      const powNode = {
        type: 'pow',
        id: powId,
        base: baseItems,
        exp: ['2'],
      };

      arr.splice(next.cursorTarget.index, 0, powNode);
      // Place cursor after the square
      next.cursorTarget.index += 1;
      consumeModifiers();
      return next;
    }

    case 'INTEGRAL': {
      const intId = nextId();
      const arr = getTargetArray(next.items, next.cursorTarget);
      const idx = next.cursorTarget.index;

      const intNode = {
        type: 'integral',
        id: intId,
        integrand: [],
        lower: [],
        upper: [],
      };

      arr.splice(idx, 0, intNode);
      next.cursorTarget = { nodeId: intId, slot: 'integrand', index: 0 };
      consumeModifiers();
      return next;
    }

    default:
      break;
  }

  // Handle standard tokens & modifiers
  let inserted = null;

  if (isShift) {
    switch (keyId) {
      case 'EXP': inserted = 'π'; break;
      case 'ANS': inserted = '%'; break;
      case 'SQR': inserted = '³'; break;
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
    if (next.resultText && next.items.length === 0 && ['+', '-', '×', '÷'].includes(inserted)) {
      insertToken('Ans');
      insertToken(inserted);
    } else {
      insertToken(inserted);
    }
  }

  consumeModifiers();
  return next;
}
