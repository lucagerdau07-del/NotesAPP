import { createPageObject } from "../../ink/pageObjects.js";
import { createInkStroke, getToolStyle } from "../../ink/inkDocument.js";
import { newId } from "../agentGeometry.js";
import { roleColor } from "../noteStyle.js";
import { ExpressionError, interpolateText, resolveValue } from "./expression.js";

// Runs a component recipe and returns the page objects and ink strokes it
// describes. A recipe is data, never code: the only things it can produce are
// the shapes below, and every number in it goes through the expression
// evaluator, which can read its own scope and nothing else.

export class RecipeError extends Error {}

const MAX_NODES = 400;
const MAX_REPEAT = 120;
const DRAW_TOOLS = new Set(["pen", "fountain", "pencil", "highlighter"]);

// Hand-drawn strokes need to wobble the same way every time the page is
// rendered, so the noise is a seeded sequence rather than Math.random.
function seededNoise(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

function seedFrom(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// Straight segments read as printed, not drawn. Resampling the polyline and
// nudging each sample off the line gives the slight waver of a real pen; the
// ends stay put so shapes still meet where the recipe says they meet.
export function handDrawnPath(points, { amount = 1.4, spacing = 18, seed = 1 } = {}) {
  if (points.length < 2) return points;
  const noise = seededNoise(seed);
  const output = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.round(length / spacing));
    const normalX = length === 0 ? 0 : -dy / length;
    const normalY = length === 0 ? 0 : dx / length;
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      // Taper the waver towards both ends of the segment.
      const falloff = Math.sin(Math.PI * t);
      const offset = noise() * amount * falloff;
      output.push({
        x: from.x + dx * t + normalX * offset,
        y: from.y + dy * t + normalY * offset,
      });
    }
  }
  output.push(points[points.length - 1]);
  return output;
}

function asPoints(raw, scope, where) {
  if (!Array.isArray(raw)) throw new RecipeError(`${where}: points muss eine Liste sein.`);
  return raw.map((point, index) => {
    const pair = Array.isArray(point) ? point : [point?.x, point?.y];
    const x = Number(resolveValue(pair[0], scope));
    const y = Number(resolveValue(pair[1], scope));
    if (!Number.isFinite(x) || !Number.isFinite(y))
      throw new RecipeError(`${where}: Punkt ${index} ergibt keine Zahl.`);
    return { x, y };
  });
}

function colorOf(node, scope, context) {
  if (node.color) {
    const resolved = interpolateText(node.color, scope);
    if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(resolved)) return resolved;
    return roleColor(context.theme, resolved);
  }
  return roleColor(context.theme, node.role ? interpolateText(node.role, scope) : "body");
}

function number(node, key, scope, fallback, where) {
  if (node[key] === undefined) return fallback;
  const value = Number(resolveValue(node[key], scope));
  if (!Number.isFinite(value)) throw new RecipeError(`${where}: "${key}" ergibt keine Zahl.`);
  return value;
}

function emitShape(node, kind, scope, context, where) {
  const x = number(node, "x", scope, 0, where);
  const y = number(node, "y", scope, 0, where);
  context.objects.push(
    createPageObject({
      id: newId("shape"),
      pageId: context.pageId,
      type: kind,
      x: context.originX + x,
      y: context.originY + y,
      width: number(node, "width", scope, 0, where),
      height: number(node, "height", scope, 0, where),
      color: colorOf(node, scope, context),
      strokeWidth: number(node, "strokeWidth", scope, 2, where),
      ...(node.fill ? { fillColor: colorOf({ color: node.fill }, scope, context) } : {}),
    }),
  );
}

function emitText(node, scope, context, where) {
  const text = interpolateText(node.text, scope);
  if (!text.trim()) return;
  const size = number(node, "size", scope, 16, where);
  context.objects.push(
    createPageObject({
      id: newId("text"),
      pageId: context.pageId,
      type: "text",
      x: context.originX + number(node, "x", scope, 0, where),
      y: context.originY + number(node, "y", scope, 0, where),
      width: number(node, "width", scope, 160, where),
      height: number(node, "height", scope, Math.round(size * 1.4), where),
      text,
      fontSize: size,
      color: colorOf(node, scope, context),
      bold: node.bold === true,
      italic: node.italic === true,
      textAlign: ["left", "center", "right"].includes(node.align) ? node.align : "left",
      fontFamily: node.font || "sans",
      aiGenerated: true,
    }),
  );
}

function emitStroke(node, scope, context, where) {
  const points = asPoints(node.points, scope, where).map((point) => ({
    x: context.originX + point.x,
    y: context.originY + point.y,
  }));
  if (points.length < 2) throw new RecipeError(`${where}: stroke braucht mindestens zwei Punkte.`);
  const tool = DRAW_TOOLS.has(node.tool) ? node.tool : "pen";
  const style = getToolStyle(
    tool,
    colorOf(node, scope, context),
    number(node, "width", scope, 2.4, where),
  );
  // Hand-drawn unless the recipe asks for a ruled line.
  const shaped =
    node.hand === false
      ? points
      : handDrawnPath(points, {
          amount: number(node, "wobble", scope, 1.4, where),
          seed: context.seed + context.strokes.length * 7919,
        });
  context.strokes.push(
    createInkStroke({
      id: newId("stroke"),
      pageId: context.pageId,
      tool,
      color: style.color,
      width: style.width,
      opacity: style.opacity,
      points: shaped,
    }),
  );
}

function runNodes(nodes, scope, context, path) {
  if (!Array.isArray(nodes)) throw new RecipeError(`${path}: body muss eine Liste sein.`);
  nodes.forEach((node, index) => {
    const where = `${path}[${index}]`;
    if (!node || typeof node !== "object") throw new RecipeError(`${where}: kein Element.`);
    context.emitted += 1;
    if (context.emitted > MAX_NODES)
      throw new RecipeError(`Zu viele Elemente (Grenze ${MAX_NODES}).`);

    if (node.repeat !== undefined) {
      const count = Math.floor(Number(resolveValue(node.repeat, scope)));
      if (!Number.isFinite(count)) throw new RecipeError(`${where}: repeat ergibt keine Zahl.`);
      if (count > MAX_REPEAT)
        throw new RecipeError(`${where}: repeat ${count} über der Grenze ${MAX_REPEAT}.`);
      const name = typeof node.as === "string" ? node.as : "i";
      for (let step = 0; step < count; step += 1)
        runNodes(node.body, { ...scope, [name]: step, [`${name}Count`]: count }, context, `${where}.body`);
      return;
    }
    if (node.when !== undefined) {
      if (!resolveValue(node.when, scope)) return;
      if (node.body) runNodes(node.body, scope, context, `${where}.body`);
      return;
    }
    if (node.let !== undefined) {
      // Sequential, so a binding can build on the one above it — geometry is
      // far easier to read as a chain of named steps than as one expression.
      const bound = { ...scope };
      for (const [key, value] of Object.entries(node.let)) bound[key] = resolveValue(value, bound);
      runNodes(node.body, bound, context, `${where}.body`);
      return;
    }
    switch (node.type) {
      case "rect":
      case "ellipse":
      case "line":
      case "arrow":
        emitShape(node, node.type, scope, context, where);
        return;
      case "text":
        emitText(node, scope, context, where);
        return;
      case "stroke":
        emitStroke(node, scope, context, where);
        return;
      default:
        throw new RecipeError(`${where}: unbekannter Typ "${node.type}".`);
    }
  });
}

function buildScope(recipe, args) {
  const scope = {};
  for (const [name, spec] of Object.entries(recipe.params || {})) {
    const given = args?.[name];
    scope[name] = given === undefined || given === null ? spec?.default : given;
    if (scope[name] === undefined) scope[name] = 0;
  }
  return scope;
}

/**
 * Runs one recipe. Returns { objects, strokes, scope } or throws RecipeError /
 * ExpressionError, whose messages are written to be handed straight back to the
 * model as a tool result so it can correct the recipe itself.
 */
export function runRecipe(recipe, args = {}, { pageId, theme, seed } = {}) {
  if (!recipe || typeof recipe !== "object") throw new RecipeError("Kein Rezept.");
  const scope = buildScope(recipe, args);
  const context = {
    pageId,
    theme,
    objects: [],
    strokes: [],
    emitted: 0,
    originX: Number(args?.x ?? scope.x ?? 0) || 0,
    originY: Number(args?.y ?? scope.y ?? 0) || 0,
    seed: seed ?? seedFrom(recipe.id || "component"),
  };
  // Coordinates inside a recipe are local to the component, so the origin is
  // added once here and x/y must not be added a second time from the scope.
  scope.x = 0;
  scope.y = 0;
  try {
    runNodes(recipe.body, scope, context, "body");
  } catch (error) {
    if (error instanceof RecipeError || error instanceof ExpressionError) throw error;
    throw new RecipeError(String(error?.message || error));
  }
  return { objects: context.objects, strokes: context.strokes, scope };
}
