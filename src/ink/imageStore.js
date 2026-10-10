import { openDB } from "idb";

// Big images (an opened PDF is one per page) do not fit into localStorage, where
// the whole origin shares ~5M chars and a note that overflows is not saved at
// all. In memory a note keeps plain data URLs, so every renderer works as
// before; only the persisted copy swaps them for an "idb:<id>" stub whose bytes
// sit in IndexedDB. Save (externalizeImages) and load (hydrateImages) are the
// only sync seams; a cold start fills the cache with loadImages first.
// ponytail: images stay in `cache` once seen, and orphaned rows in IndexedDB
// are never swept. Evict / garbage-collect if memory or disk ever shows it.
const PREFIX = "idb:";
const THRESHOLD = 20000;

const cache = new Map(); // id -> data URL
const stored = new Set(); // ids known to be written (or being written)
let dbPromise;

const available = () => typeof indexedDB !== "undefined";
const database = () =>
  (dbPromise ??= openDB("notes-ink-images", 1, {
    upgrade(db) {
      db.createObjectStore("images");
    },
  }));

export const isStoredImage = (src) => typeof src === "string" && src.startsWith(PREFIX);

// Two FNV-style 32-bit hashes plus the length: same bytes, same id, so a page
// that is saved again (or duplicated) never writes twice.
function hashOf(text) {
  let a = 0x811c9dc5;
  let b = text.length;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b + c, 2246822519) ^ (b >>> 13);
  }
  return `${text.length.toString(36)}-${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
}

// Same document back when no object changed, so unchanged notes stay ===.
function mapSources(document, change) {
  if (!Array.isArray(document?.objects)) return document;
  let changed = false;
  const objects = document.objects.map((object) => {
    const src = change(object.src);
    if (src === object.src) return object;
    changed = true;
    return { ...object, src };
  });
  return changed ? { ...document, objects } : document;
}

function write(id, src) {
  stored.add(id);
  database()
    .then((db) => db.put("images", src, id))
    .catch((error) => {
      // Forget it so the next save of a note holding it tries again.
      stored.delete(id);
      console.warn("[ink] image write failed", error);
    });
}

export function externalizeImages(document) {
  if (!available()) return document;
  return mapSources(document, (src) => {
    if (typeof src !== "string" || src.length < THRESHOLD || !src.startsWith("data:")) return src;
    const id = hashOf(src);
    cache.set(id, src);
    if (!stored.has(id)) write(id, src);
    return PREFIX + id;
  });
}

export function hydrateImages(document) {
  return mapSources(document, (src) =>
    isStoredImage(src) ? cache.get(src.slice(PREFIX.length)) ?? src : src,
  );
}

async function loadIds(ids) {
  const missing = ids.filter((id) => !cache.has(id));
  if (!missing.length) return false;
  const db = await database();
  await Promise.all(
    missing.map(async (id) => {
      const src = await db.get("images", id);
      if (src) {
        cache.set(id, src);
        stored.add(id);
      }
    }),
  );
  return true;
}

// True when it had something to fetch, i.e. hydrateImages now returns more.
export function loadImages(document) {
  if (!available() || !Array.isArray(document?.objects)) return Promise.resolve(false);
  const ids = document.objects
    .filter((object) => isStoredImage(object.src))
    .map((object) => object.src.slice(PREFIX.length));
  return ids.length ? loadIds(ids) : Promise.resolve(false);
}

// For a single src that may be a stub (the preview's image decoder).
export async function resolveImageSrc(src) {
  if (!isStoredImage(src)) return src;
  const id = src.slice(PREFIX.length);
  await loadIds([id]);
  return cache.get(id) ?? src;
}
