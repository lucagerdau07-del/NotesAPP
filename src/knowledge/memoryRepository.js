export const MEMORY_STORAGE_KEY = "notes.agentMemory.v1";

// Was sich der Agent über den Nutzer merkt (Schwächen, Lehrervorgaben,
// Vorlieben). Der Block steht in jedem Prompt, also zählt jedes Zeichen:
// wenige, kurze Zeilen. Ist er voll, muss der Agent zusammenfassen oder
// ersetzen, statt dass der Prompt wächst.
// { version: 1, next: 4, items: [{ id: 3, text }] }
export const MEMORY_MAX_ITEMS = 12;
export const MEMORY_MAX_CHARS = 100;

const lineOf = (item) => `${item.id} ${item.text}`;

export function createMemoryRepository(storage) {
  const read = () => {
    try {
      const parsed = JSON.parse(storage?.getItem?.(MEMORY_STORAGE_KEY) || "null");
      const items = (Array.isArray(parsed?.items) ? parsed.items : []).filter(
        (item) => Number.isInteger(item?.id) && typeof item?.text === "string",
      );
      return { next: Math.max(Number(parsed?.next) || 1, ...items.map((item) => item.id + 1)), items };
    } catch {
      return { next: 1, items: [] };
    }
  };

  const write = (state) => {
    try {
      storage?.setItem?.(MEMORY_STORAGE_KEY, JSON.stringify({ version: 1, ...state }));
    } catch {
      // Speicher blockiert: der Agent merkt sich dann eben nichts.
    }
  };

  return {
    list: () => read().items,

    // Das Werkzeug remember. Die Rückgabe geht als Text ans Modell, ein Fehler
    // nennt den nächsten Schritt.
    remember({ text, id } = {}) {
      const line = String(text ?? "").replace(/\s+/g, " ").trim();
      const state = read();
      const wanted = id == null || id === "" ? null : Number(id);
      const index = state.items.findIndex((item) => item.id === wanted);
      if (wanted !== null && index < 0) return `Fehler: Eintrag ${id} gibt es nicht.`;
      if (!line) {
        if (index < 0) return "Fehler: text fehlt.";
        write({ ...state, items: state.items.filter((_, i) => i !== index) });
        return `Gelöscht: ${wanted}`;
      }
      if (line.length > MEMORY_MAX_CHARS)
        return `Fehler: höchstens ${MEMORY_MAX_CHARS} Zeichen, kürzer fassen.`;
      if (index >= 0) {
        write({ ...state, items: state.items.map((item, i) => (i === index ? { ...item, text: line } : item)) });
        return `Ersetzt: ${wanted}`;
      }
      if (state.items.length >= MEMORY_MAX_ITEMS)
        return `Fehler: Gedächtnis voll (${MEMORY_MAX_ITEMS}). Fasse zwei Einträge in einem zusammen oder ersetze einen per id:\n${state.items.map(lineOf).join("\n")}`;
      write({ next: state.next + 1, items: [...state.items, { id: state.next, text: line }] });
      return `Gemerkt: ${state.next}`;
    },
  };
}

// Der Block für den Systemprompt, leer ohne Einträge.
export function memoryBlock(items) {
  return items.length
    ? `Über den Nutzer (aus remember, richte dich danach):\n${items.map(lineOf).join("\n")}`
    : "";
}

export const browserMemoryRepository = createMemoryRepository(globalThis.localStorage);
