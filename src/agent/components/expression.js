// Arithmetic for component recipes, parsed and walked by hand rather than
// handed to eval/new Function. Recipes are authored by the model, and this app
// keeps the user's notes and the agent's access key in the same origin — so a
// recipe must not be able to reach anything but the numbers it was given.
// There are no assignments, no function definitions and no globals here: an
// expression can only read its scope and call the arithmetic below.

export class ExpressionError extends Error {}

const FUNCTIONS = {
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sqrt: Math.sqrt,
  pow: Math.pow,
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  atan2: Math.atan2,
  hypot: Math.hypot,
  len: (value) => (value == null ? 0 : Array.isArray(value) || typeof value === "string" ? value.length : 0),
  clamp: (value, low, high) => Math.min(high, Math.max(low, value)),
  // Maps 0..count-1 onto low..high, the spacing every repeat-based recipe
  // needs, with the single-item case landing in the middle instead of dividing
  // by zero.
  lerp: (from, to, t) => from + (to - from) * t,
  step: (index, count, low, high) =>
    count <= 1 ? (low + high) / 2 : low + ((high - low) * index) / (count - 1),
};

const CONSTANTS = { PI: Math.PI, TAU: Math.PI * 2, true: true, false: false, null: null };

// Reaching these through member access is the usual way out of a sandbox.
const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const OPERATORS = [
  ["||"],
  ["&&"],
  ["==", "!=", "<=", ">=", "<", ">"],
  ["+", "-"],
  ["*", "/", "%"],
];

function tokenize(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(source[index + 1] || ""))) {
      const match = /^[0-9]*\.?[0-9]+/.exec(source.slice(index));
      tokens.push({ type: "number", value: Number(match[0]) });
      index += match[0].length;
      continue;
    }
    if (char === '"' || char === "'") {
      const end = source.indexOf(char, index + 1);
      if (end === -1) throw new ExpressionError(`Nicht geschlossener Text in "${source}"`);
      tokens.push({ type: "string", value: source.slice(index + 1, end) });
      index = end + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(char)) {
      const match = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(source.slice(index));
      tokens.push({ type: "name", value: match[0] });
      index += match[0].length;
      continue;
    }
    const two = source.slice(index, index + 2);
    if (["==", "!=", "<=", ">=", "&&", "||"].includes(two)) {
      tokens.push({ type: "op", value: two });
      index += 2;
      continue;
    }
    if ("+-*/%<>?:().,[]!".includes(char)) {
      tokens.push({ type: "op", value: char });
      index += 1;
      continue;
    }
    throw new ExpressionError(`Unerwartetes Zeichen "${char}" in "${source}"`);
  }
  return tokens;
}

function parseTokens(tokens, source) {
  let position = 0;
  const peek = () => tokens[position];
  const eat = (value) => {
    const token = tokens[position];
    if (!token || token.value !== value)
      throw new ExpressionError(`"${value}" erwartet in "${source}"`);
    position += 1;
    return token;
  };

  function parseBinary(level) {
    if (level >= OPERATORS.length) return parseUnary();
    let left = parseBinary(level + 1);
    while (peek()?.type === "op" && OPERATORS[level].includes(peek().value)) {
      const operator = tokens[position++].value;
      left = { kind: "binary", operator, left, right: parseBinary(level + 1) };
    }
    return left;
  }

  function parseUnary() {
    const token = peek();
    if (token?.type === "op" && (token.value === "-" || token.value === "!")) {
      position += 1;
      return { kind: "unary", operator: token.value, argument: parseUnary() };
    }
    return parsePostfix();
  }

  function parsePostfix() {
    let target = parsePrimary();
    for (;;) {
      const token = peek();
      if (token?.value === ".") {
        position += 1;
        const name = tokens[position++];
        if (!name || name.type !== "name")
          throw new ExpressionError(`Name nach "." erwartet in "${source}"`);
        target = { kind: "member", target, key: { kind: "literal", value: name.value } };
      } else if (token?.value === "[") {
        position += 1;
        const key = parseTernary();
        eat("]");
        target = { kind: "member", target, key };
      } else if (token?.value === "(") {
        position += 1;
        const args = [];
        if (peek()?.value !== ")") {
          args.push(parseTernary());
          while (peek()?.value === ",") {
            position += 1;
            args.push(parseTernary());
          }
        }
        eat(")");
        if (target.kind !== "name")
          throw new ExpressionError(`Nur einfache Funktionsnamen erlaubt in "${source}"`);
        target = { kind: "call", name: target.name, args };
      } else {
        return target;
      }
    }
  }

  function parsePrimary() {
    const token = tokens[position];
    if (!token) throw new ExpressionError(`Ausdruck endet unerwartet: "${source}"`);
    if (token.type === "number" || token.type === "string") {
      position += 1;
      return { kind: "literal", value: token.value };
    }
    if (token.type === "name") {
      position += 1;
      return { kind: "name", name: token.value };
    }
    if (token.value === "(") {
      position += 1;
      const inner = parseTernary();
      eat(")");
      return inner;
    }
    throw new ExpressionError(`Unerwartetes "${token.value}" in "${source}"`);
  }

  function parseTernary() {
    const condition = parseBinary(0);
    if (peek()?.value !== "?") return condition;
    position += 1;
    const whenTrue = parseTernary();
    eat(":");
    return { kind: "ternary", condition, whenTrue, whenFalse: parseTernary() };
  }

  const ast = parseTernary();
  if (position < tokens.length)
    throw new ExpressionError(`Rest "${tokens[position].value}" nach Ausdruck in "${source}"`);
  return ast;
}

// Recipes re-evaluate the same expressions once per instance (and once per
// repeat iteration), so the parse is kept rather than redone.
const astCache = new Map();
const CACHE_LIMIT = 500;

export function parseExpression(source) {
  const cached = astCache.get(source);
  if (cached) return cached;
  const ast = parseTokens(tokenize(source), source);
  if (astCache.size >= CACHE_LIMIT) astCache.clear();
  astCache.set(source, ast);
  return ast;
}

function evaluateNode(node, scope, source) {
  switch (node.kind) {
    case "literal":
      return node.value;
    case "name": {
      if (Object.hasOwn(scope, node.name)) return scope[node.name];
      if (Object.hasOwn(CONSTANTS, node.name)) return CONSTANTS[node.name];
      throw new ExpressionError(`Unbekannter Wert "${node.name}" in "${source}"`);
    }
    case "member": {
      const target = evaluateNode(node.target, scope, source);
      const key = evaluateNode(node.key, scope, source);
      if (target == null) return undefined;
      if (BLOCKED_KEYS.has(String(key))) throw new ExpressionError(`Zugriff auf "${key}" ist gesperrt.`);
      if (typeof target !== "object" && typeof target !== "string") return undefined;
      if (typeof target === "string" || Array.isArray(target)) {
        if (key === "length") return target.length;
        return target[key];
      }
      return Object.hasOwn(target, key) ? target[key] : undefined;
    }
    case "call": {
      const fn = Object.hasOwn(FUNCTIONS, node.name) ? FUNCTIONS[node.name] : null;
      if (!fn) throw new ExpressionError(`Unbekannte Funktion "${node.name}" in "${source}"`);
      return fn(...node.args.map((arg) => evaluateNode(arg, scope, source)));
    }
    case "unary": {
      const value = evaluateNode(node.argument, scope, source);
      return node.operator === "-" ? -value : !value;
    }
    case "ternary":
      return evaluateNode(node.condition, scope, source)
        ? evaluateNode(node.whenTrue, scope, source)
        : evaluateNode(node.whenFalse, scope, source);
    case "binary": {
      const left = evaluateNode(node.left, scope, source);
      if (node.operator === "&&") return left && evaluateNode(node.right, scope, source);
      if (node.operator === "||") return left || evaluateNode(node.right, scope, source);
      const right = evaluateNode(node.right, scope, source);
      switch (node.operator) {
        case "+": return typeof left === "string" || typeof right === "string" ? `${left}${right}` : left + right;
        case "-": return left - right;
        case "*": return left * right;
        case "/": return right === 0 ? 0 : left / right;
        case "%": return right === 0 ? 0 : left % right;
        case "==": return left === right;
        case "!=": return left !== right;
        case "<": return left < right;
        case "<=": return left <= right;
        case ">": return left > right;
        default: return left >= right;
      }
    }
    default:
      throw new ExpressionError(`Unbekannter Knoten in "${source}"`);
  }
}

export function evaluateExpression(source, scope = {}) {
  return evaluateNode(parseExpression(source), scope, source);
}

// Two kinds of field, so a recipe never has to escape anything:
//
//   geometry  x: 12        a number passes through
//             x: "w/2 - 8" a string is arithmetic
//   text      text: "Schritt {i + 1} von {len(items)}"
//
// Text is literal apart from the braces. Evaluating text fields as expressions
// instead would make the common case ("Definition") a syntax error.
export function resolveValue(value, scope) {
  if (typeof value !== "string") return value;
  return evaluateExpression(value, scope);
}

const NUMBER_FORMAT = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

export function interpolateText(template, scope) {
  if (typeof template !== "string") return template == null ? "" : String(template);
  return template.replace(/\{([^{}]+)\}/g, (_, expression) => {
    const value = evaluateExpression(expression, scope);
    if (value == null) return "";
    return typeof value === "number" ? NUMBER_FORMAT.format(value) : String(value);
  });
}
