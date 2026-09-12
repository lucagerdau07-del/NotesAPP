export { COMPONENT_LIBRARY, COMPONENT_BY_ID } from "./library.js";
export { createComponentStore } from "./storage.js";
export { runRecipe, RecipeError, handDrawnPath } from "./runtime.js";
export { ExpressionError } from "./expression.js";

// The recipe format, written for the system prompt. Kept next to the runtime
// so a change to one is an obvious prompt to change the other.
export function describeRecipeLanguage() {
  return [
    "Bauelemente sind Rezepte aus Daten, keine Programme. Ein Rezept hat params (mit Standardwerten) und body.",
    "Im body stehen Elemente: {type: rect|ellipse|line|arrow} mit x/y/width/height, {type: text} mit text/x/y/width/size, {type: stroke} mit points: [[x,y],...].",
    "Zahlenfelder dürfen rechnen: \"width / 2 - 8\". Textfelder sind wörtlich, mit {} als Platzhalter: \"Schritt {i + 1}\".",
    "Steuerung: {repeat: \"len(items)\", as: \"i\", body: [...]}, {when: \"i < 3\", body: [...]}, {let: {name: \"…\"}, body: [...]} — let-Bindungen sehen die vorherigen.",
    "Verfügbar: min max abs round floor ceil sqrt pow exp sin cos atan2 hypot len clamp lerp step, sowie PI und TAU.",
    "Farben über role (body, heading, accent, support, signal, muted) statt fester Hex-Werte. strokes sind handgezeichnet, hand: false macht sie gerade.",
    "Koordinaten sind lokal zum Element, (0,0) ist seine linke obere Ecke. insert_component setzt es an die Stelle auf der Seite.",
    "Parameter dürfen Grenzen tragen, wie insert_table rows/cols fest auf 1-20/1-10 begrenzt: \"min\"/\"max\" für Zahlen, \"minItems\"/\"maxItems\" für Listen, \"options\" für eine feste Auswahl, \"fixed\": true, wenn ein Wert nie überschrieben werden darf (z.B. eine Grafik, die immer genau drei Spalten hat).",
  ];
}
