export const CARD_STORAGE_KEY = "notes.cards.v1";

// Folder cards for the agent (see docs/superpowers/specs/2026-10-10-library-
// context-cards-design.md). `auto` is generated from the notes inside, `manual`
// is the user's own line and always wins. Kept apart from the folder records:
// derived data must not travel with, or bloat, what the user owns.
// { [folderId]: { manual?: string, auto?: { text, notes, seen, stamp, generatedAt } } }
export function createCardRepository(storage) {
  const read = () => {
    try {
      const parsed = JSON.parse(storage?.getItem?.(CARD_STORAGE_KEY) || "null");
      const cards = parsed?.cards;
      return cards && typeof cards === "object" && !Array.isArray(cards) ? cards : {};
    } catch {
      return {};
    }
  };

  const write = (cards) => {
    try {
      storage?.setItem?.(CARD_STORAGE_KEY, JSON.stringify({ version: 1, cards }));
    } catch {
      // A card is a cache: it is regenerated on the next library open.
    }
  };

  const put = (folderId, patch) => {
    const cards = read();
    const key = String(folderId);
    const next = { ...cards[key], ...patch };
    if (!next.manual) delete next.manual;
    if (!next.auto) delete next.auto;
    if (next.manual || next.auto) cards[key] = next;
    else delete cards[key];
    write(cards);
  };

  return {
    // One parse for callers that look at many folders (list_notes, overview).
    all: read,
    get: (folderId) => read()[String(folderId)] || null,

    setAuto(folderId, auto) {
      put(folderId, { auto });
    },

    setManual(folderId, text) {
      put(folderId, { manual: String(text ?? "").trim() });
    },

    remove(ids) {
      const cards = read();
      let changed = false;
      for (const id of ids) {
        if (String(id) in cards) {
          delete cards[String(id)];
          changed = true;
        }
      }
      if (changed) write(cards);
    },
  };
}

// The text the agent sees for a folder: the user's line, else the generated one.
export function cardText(card) {
  return String(card?.manual || "").trim() || card?.auto?.text || "";
}

export const browserCardRepository = createCardRepository(globalThis.localStorage);
