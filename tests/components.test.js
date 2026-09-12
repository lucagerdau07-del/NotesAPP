import { describe, expect, it } from "vitest";
import {
  ExpressionError,
  evaluateExpression,
  interpolateText,
} from "../src/agent/components/expression";
import { RecipeError, runRecipe, handDrawnPath } from "../src/agent/components/runtime";
import { COMPONENT_BY_ID, COMPONENT_LIBRARY } from "../src/agent/components/library";
import { createComponentStore } from "../src/agent/components/storage";
import { NOTE_THEMES } from "../src/agent/noteStyle";

const theme = NOTE_THEMES.dark;
const run = (recipe, args) => runRecipe(recipe, args, { pageId: "p1", theme, seed: 7 });

describe("expression", () => {
  it("does arithmetic with the usual precedence", () => {
    expect(evaluateExpression("2 + 3 * 4")).toBe(14);
    expect(evaluateExpression("(2 + 3) * 4")).toBe(20);
    expect(evaluateExpression("-3 + 1")).toBe(-2);
  });

  it("reads its scope, including list items and length", () => {
    const scope = { items: [{ label: "A" }, { label: "B" }], i: 1 };
    expect(evaluateExpression("len(items)", scope)).toBe(2);
    expect(evaluateExpression("items[i].label", scope)).toBe("B");
  });

  it("supports comparison and the ternary", () => {
    expect(evaluateExpression("3 > 2 ? 10 : 20")).toBe(10);
    expect(evaluateExpression("x == 0 ? 1 : 2", { x: 0 })).toBe(1);
  });

  it("spaces items evenly with step()", () => {
    expect(evaluateExpression("step(0, 3, 0, 300)")).toBe(0);
    expect(evaluateExpression("step(2, 3, 0, 300)")).toBe(300);
    expect(evaluateExpression("step(0, 1, 0, 300)")).toBe(150);
  });

  it("never divides by zero", () => {
    expect(evaluateExpression("5 / 0")).toBe(0);
  });

  it("rejects an unknown name instead of returning undefined", () => {
    expect(() => evaluateExpression("nichtDa + 1")).toThrow(ExpressionError);
  });

  it("rejects an unknown function", () => {
    expect(() => evaluateExpression("fetch(1)")).toThrow(ExpressionError);
  });

  // The whole point of parsing this by hand rather than using eval.
  it("cannot reach out of its scope", () => {
    expect(() => evaluateExpression("globalThis")).toThrow(ExpressionError);
    expect(() => evaluateExpression("constructor")).toThrow(ExpressionError);
    expect(() => evaluateExpression("x.__proto__", { x: {} })).toThrow(ExpressionError);
    expect(() => evaluateExpression("x.constructor", { x: {} })).toThrow(ExpressionError);
  });

  it("keeps text literal apart from the braces", () => {
    expect(interpolateText("Schritt {i + 1}", { i: 2 })).toBe("Schritt 3");
    expect(interpolateText("Definition", {})).toBe("Definition");
  });
});

describe("runRecipe", () => {
  it("offsets everything by the placement origin", () => {
    const { objects } = run(
      { id: "t", params: { x: { default: 0 }, y: { default: 0 } }, body: [{ type: "rect", x: 10, y: 5, width: 20, height: 20 }] },
      { x: 100, y: 200 },
    );
    expect(objects[0]).toMatchObject({ x: 110, y: 205 });
  });

  it("repeats with the index in scope", () => {
    const { objects } = run({
      id: "t",
      params: { rows: { default: 3 } },
      body: [{ repeat: "rows", as: "i", body: [{ type: "rect", x: 0, y: "i * 20", width: 10, height: 10 }] }],
    });
    expect(objects.map((object) => object.y)).toEqual([0, 20, 40]);
  });

  it("lets a binding build on the one before it", () => {
    const { objects } = run({
      id: "t",
      body: [{ let: { a: "10", b: "a * 3" }, body: [{ type: "rect", x: "b", y: 0, width: 1, height: 1 }] }],
    });
    expect(objects[0].x).toBe(30);
  });

  it("skips a when-block whose condition is false", () => {
    const { objects } = run({
      id: "t",
      params: { show: { default: false } },
      body: [{ when: "show", body: [{ type: "rect", x: 0, y: 0, width: 1, height: 1 }] }],
    });
    expect(objects).toHaveLength(0);
  });

  it("resolves roles to the theme's colours", () => {
    const { objects } = run({
      id: "t",
      body: [{ type: "rect", x: 0, y: 0, width: 1, height: 1, role: "signal" }],
    });
    expect(objects[0].color).toBe(theme.signal);
  });

  it("takes an explicit hex over a role", () => {
    const { objects } = run({
      id: "t",
      body: [{ type: "rect", x: 0, y: 0, width: 1, height: 1, color: "#123456" }],
    });
    expect(objects[0].color).toBe("#123456");
  });

  it("makes strokes, and wobbles them unless asked not to", () => {
    const wobbly = run({
      id: "t",
      body: [{ type: "stroke", points: [[0, 0], [100, 0]] }],
    });
    const ruled = run({
      id: "t",
      body: [{ type: "stroke", hand: false, points: [[0, 0], [100, 0]] }],
    });
    expect(wobbly.strokes[0].points.length).toBeGreaterThan(2);
    expect(wobbly.strokes[0].points.some((point) => point.y !== 0)).toBe(true);
    expect(ruled.strokes[0].points).toHaveLength(2);
  });

  it("reports where a bad expression is", () => {
    expect(() =>
      run({ id: "t", body: [{ type: "rect", x: "quatsch", y: 0, width: 1, height: 1 }] }),
    ).toThrow(/quatsch/);
  });

  it("names the unknown type", () => {
    expect(() => run({ id: "t", body: [{ type: "banana" }] })).toThrow(RecipeError);
  });

  it("refuses a runaway repeat instead of hanging", () => {
    expect(() =>
      run({ id: "t", body: [{ repeat: 100000, as: "i", body: [{ type: "rect", x: 0, y: 0, width: 1, height: 1 }] }] }),
    ).toThrow(/Grenze/);
  });
});

describe("handDrawnPath", () => {
  it("keeps the endpoints and is the same every time", () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 50 }];
    const first = handDrawnPath(points, { seed: 42 });
    const second = handDrawnPath(points, { seed: 42 });
    expect(first).toEqual(second);
    expect(first[0]).toEqual({ x: 0, y: 0 });
    expect(first[first.length - 1]).toEqual({ x: 100, y: 50 });
  });
});

describe("component library", () => {
  it("runs every built-in without error", () => {
    for (const recipe of COMPONENT_LIBRARY) {
      expect(() => run(recipe, {}), `${recipe.id} mit Standardwerten`).not.toThrow();
    }
  });

  it("draws something for every built-in given typical arguments", () => {
    const samples = {
      zeitstrahl: { items: [{ label: "1793", sub: "Reform" }, { label: "1857", sub: "Aufstand" }] },
      ablauf: { steps: ["Eins", "Zwei"] },
      vergleich: { leftItems: ["a"], rightItems: ["b"] },
      klammer: { items: ["a", "b"], label: "Gruppe" },
      koordinatensystem: { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      glockenkurve: {},
      kolben: { label: "Probe" },
      reaktionspfeil: { above: "+HCl" },
      kreislauf: { items: ["a", "b", "c"] },
      atom: { label: "N", shells: 2 },
      randnotiz: { text: "wichtig" },
      nummernkreis: { number: 2 },
    };
    for (const recipe of COMPONENT_LIBRARY) {
      const { objects, strokes } = run(recipe, samples[recipe.id] || {});
      expect(objects.length + strokes.length, `${recipe.id} erzeugt nichts`).toBeGreaterThan(0);
    }
  });

  it("describes every built-in so the model knows what it is for", () => {
    for (const recipe of COMPONENT_LIBRARY) {
      expect(recipe.description, recipe.id).toBeTruthy();
      expect(recipe.title, recipe.id).toBeTruthy();
    }
  });
});

describe("component store", () => {
  function memoryStorage() {
    const map = new Map();
    return {
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => map.set(key, value),
    };
  }

  it("falls back to the built-ins", () => {
    const store = createComponentStore(memoryStorage());
    expect(store.get("zeitstrahl")).toBe(COMPONENT_BY_ID.get("zeitstrahl"));
  });

  it("shadows a built-in with a saved edit, and resetting brings it back", () => {
    const store = createComponentStore(memoryStorage());
    store.save({ ...COMPONENT_BY_ID.get("zeitstrahl"), title: "Meine Zeitachse" });
    expect(store.get("zeitstrahl").title).toBe("Meine Zeitachse");
    expect(store.list().find((entry) => entry.id === "zeitstrahl").source).toBe("geändert");
    store.reset("zeitstrahl");
    expect(store.get("zeitstrahl").title).toBe("Zeitstrahl");
  });

  it("lists a component the agent invented as its own", () => {
    const store = createComponentStore(memoryStorage());
    store.save({ id: "eigen", title: "Eigen", body: [] });
    const entry = store.list().find((item) => item.id === "eigen");
    expect(entry.source).toBe("eigen");
  });

  it("survives unreadable storage", () => {
    const broken = {
      getItem: () => "{kaputt",
      setItem: () => {
        throw new Error("voll");
      },
    };
    const store = createComponentStore(broken);
    expect(store.get("zeitstrahl")).toBeTruthy();
    expect(store.save({ id: "x", body: [] })).toBe(false);
  });
});

describe("component parameter constraints", () => {
  it("clamps a number into its min/max range", () => {
    const { objects } = run({
      id: "t",
      params: { size: { default: 10, min: 5, max: 20 } },
      body: [{ type: "rect", x: 0, y: 0, width: "size", height: "size" }],
    }, { size: 999 });
    expect(objects[0].width).toBe(20);
  });

  it("truncates a list over maxItems", () => {
    const { scope } = run({
      id: "t",
      params: { items: { default: [], maxItems: 2 } },
      body: [],
    }, { items: ["a", "b", "c", "d"] });
    expect(scope.items).toEqual(["a", "b"]);
  });

  it("rejects a list under minItems, naming the parameter", () => {
    expect(() =>
      run(
        { id: "t", params: { items: { default: [], minItems: 3 } }, body: [] },
        { items: ["a"] },
      ),
    ).toThrow(/items.*mindestens 3/);
  });

  it("locks a fixed parameter regardless of what is passed", () => {
    const { scope } = run(
      { id: "t", params: { cols: { default: 3, fixed: true } }, body: [] },
      { cols: 99 },
    );
    expect(scope.cols).toBe(3);
  });

  it("falls back to the default when a value is not among options", () => {
    const { scope } = run(
      { id: "t", params: { variant: { default: "a", options: ["a", "b"] } }, body: [] },
      { variant: "quatsch" },
    );
    expect(scope.variant).toBe("a");
  });

  it("accepts a value that is among options", () => {
    const { scope } = run(
      { id: "t", params: { variant: { default: "a", options: ["a", "b"] } }, body: [] },
      { variant: "b" },
    );
    expect(scope.variant).toBe("b");
  });
});

describe("built-in constraints hold the library components inside their designed range", () => {
  it("keeps a zeitstrahl from growing past its label spacing", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ label: String(i), sub: "" }));
    const { scope } = run(COMPONENT_BY_ID.get("zeitstrahl"), { items: many });
    expect(scope.items).toHaveLength(8);
  });

  it("refuses a vergleich-less klammer instead of drawing a pointless brace", () => {
    expect(() => run(COMPONENT_BY_ID.get("klammer"), { items: ["nur eins"] })).toThrow(/mindestens/);
  });

  it("keeps glockenkurve sigma marks from running under the axis", () => {
    const { scope } = run(COMPONENT_BY_ID.get("glockenkurve"), { sigmas: 12 });
    expect(scope.sigmas).toBe(3);
  });
});
