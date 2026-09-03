# Integrated Sidebar Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Android-native browser inside the editor's existing left rail, with persistent shortcuts, a strictly 30-day local history, Google search fallback, and internal opening of document links.

**Architecture:** React owns the shared Agent/Browser rail, browser chrome, home screen, persistence, and link routing. A narrow bridge selects a native child `WebView` on Android and an iframe fallback on the web; document link sources call a shared React context instead of opening tabs directly.

**Tech Stack:** React 19, Vite 8, Vitest/Testing Library, Capacitor 8, Android Java/WebView, PDF.js

**Spec:** `docs/superpowers/specs/2026-09-03-integrated-sidebar-browser-design.md`

## Global Constraints

- Android tablet is the full-fidelity target; desktop web is an explicitly limited iframe fallback.
- Free text opens `https://www.google.com/search?q=…`; recognizable domains receive `https://`.
- Only `http:` and `https:` are normal internal navigations; SSL errors must never be bypassed.
- History is local and is pruned when `visitedAt < now - 30 × 24 hours`; exactly 30-day-old entries remain until the next threshold crossing.
- Shortcuts persist until the user edits or deletes them; history deletion must not clear WebView cookies or logins.
- Agent and Browser share one rail and retain independent session state when switching.
- Document link objects, Markdown links, and PDF URL annotations open internally by default.
- The current HTTP(S) page always has a one-tap external-browser action.
- Do not add multiple tabs, a download manager, incognito mode, sync, password management, or handwriting URL recognition.
- After each completed task, run its focused tests and create the listed Git savestate.

---

### Task 1: URL and navigation policy

**Files:**
- Create: `src/browser/browserInput.js`
- Create: `tests/browserInput.test.js`

**Interfaces:**
- Produces: `resolveBrowserInput(input: string): string`
- Produces: `isInternalBrowserUrl(input: string): boolean`
- Produces: `toExternalBrowserUrl(input: string): string | null`
- Consumes: no application state

- [ ] **Step 1: Write the failing policy tests**

```js
import { describe, expect, it } from "vitest";
import {
  isInternalBrowserUrl,
  resolveBrowserInput,
  toExternalBrowserUrl,
} from "../src/browser/browserInput.js";

describe("browser input policy", () => {
  it("keeps HTTP URLs and upgrades a domain to HTTPS", () => {
    expect(resolveBrowserInput("https://example.com/a?q=1")).toBe("https://example.com/a?q=1");
    expect(resolveBrowserInput("wikipedia.org")).toBe("https://wikipedia.org/");
  });

  it("sends every free-text input to Google", () => {
    expect(resolveBrowserInput("photosynthese einfach erklärt")).toBe(
      "https://www.google.com/search?q=photosynthese%20einfach%20erkl%C3%A4rt",
    );
  });

  it("allows only HTTP(S) internally", () => {
    expect(isInternalBrowserUrl("https://example.com")).toBe(true);
    expect(isInternalBrowserUrl("javascript:alert(1)")).toBe(false);
    expect(isInternalBrowserUrl("file:///sdcard/test.html")).toBe(false);
  });

  it("returns only safe external targets", () => {
    expect(toExternalBrowserUrl("https://example.com")).toBe("https://example.com/");
    expect(toExternalBrowserUrl("javascript:alert(1)")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npm test -- tests/browserInput.test.js`

Expected: FAIL because `src/browser/browserInput.js` does not exist.

- [ ] **Step 3: Implement the pure policy helpers**

```js
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i;
const HTTP = /^https?:$/i;

export function resolveBrowserInput(input) {
  const value = String(input ?? "").trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (HTTP.test(parsed.protocol)) return parsed.href;
    return "";
  } catch {}
  if (DOMAIN.test(value)) return new URL(`https://${value}`).href;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

export function isInternalBrowserUrl(input) {
  try { return HTTP.test(new URL(input).protocol); } catch { return false; }
}

export function toExternalBrowserUrl(input) {
  if (!isInternalBrowserUrl(input)) return null;
  return new URL(input).href;
}
```

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- tests/browserInput.test.js`

Expected: 4 tests PASS.

- [ ] **Step 5: Commit the policy**

```bash
git add src/browser/browserInput.js tests/browserInput.test.js
git commit -m "feat(browser): add safe URL and Google search policy"
```

---

### Task 2: Persistent shortcuts and 30-day history

**Files:**
- Create: `src/browser/browserRepository.js`
- Create: `tests/browserRepository.test.js`

**Interfaces:**
- Produces: `createBrowserRepository(storage, { now? })`
- Produces repository methods: `listShortcuts()`, `saveShortcut(input)`, `removeShortcut(id)`, `reorderShortcuts(ids)`, `listHistory(query?)`, `recordVisit(input)`, `clearHistory()`
- Consumes: Web Storage-compatible `{ getItem, setItem }`

- [ ] **Step 1: Write failing persistence and expiry tests**

```js
import { beforeEach, describe, expect, it } from "vitest";
import { createBrowserRepository } from "../src/browser/browserRepository.js";

const DAY = 24 * 60 * 60 * 1000;
let values;
let storage;

beforeEach(() => {
  values = new Map();
  storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
});

it("creates, edits, reorders, and deletes shortcuts", () => {
  const repo = createBrowserRepository(storage, { now: () => 1000 });
  const a = repo.saveShortcut({ title: "Google", url: "https://google.com" });
  const b = repo.saveShortcut({ title: "Wikipedia", url: "https://wikipedia.org" });
  repo.saveShortcut({ id: a.id, title: "Google Suche", url: a.url });
  repo.reorderShortcuts([b.id, a.id]);
  expect(repo.listShortcuts().map((item) => item.title)).toEqual(["Wikipedia", "Google Suche"]);
  repo.removeShortcut(b.id);
  expect(repo.listShortcuts()).toHaveLength(1);
});

it("keeps the exact boundary and prunes anything older than 30 days", () => {
  let now = 40 * DAY;
  const repo = createBrowserRepository(storage, { now: () => now });
  repo.recordVisit({ title: "boundary", url: "https://boundary.test", visitedAt: 10 * DAY });
  repo.recordVisit({ title: "old", url: "https://old.test", visitedAt: 10 * DAY - 1 });
  expect(repo.listHistory().map((item) => item.title)).toEqual(["boundary"]);
});

it("filters history and clears it without touching shortcut data", () => {
  const repo = createBrowserRepository(storage, { now: () => 40 * DAY });
  repo.saveShortcut({ title: "Docs", url: "https://docs.example" });
  repo.recordVisit({ title: "Biologie", url: "https://school.example/bio" });
  expect(repo.listHistory("bio")).toHaveLength(1);
  repo.clearHistory();
  expect(repo.listHistory()).toEqual([]);
  expect(repo.listShortcuts()).toHaveLength(1);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/browserRepository.test.js`

Expected: FAIL because the repository module does not exist.

- [ ] **Step 3: Implement a versioned single-key repository**

Use storage key `notes.browser.v1`. Parse malformed JSON as `{ shortcuts: [], history: [] }`, normalize only HTTP(S) URLs with Task 1's policy, generate IDs with `crypto.randomUUID()` and a deterministic timestamp fallback, and write after every mutation. `recordVisit` must merge only the immediately preceding identical URL and then prune with `visitedAt < now() - 30 * DAY`.

```js
import { isInternalBrowserUrl } from "./browserInput.js";

const STORAGE_KEY = "notes.browser.v1";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function createBrowserRepository(storage, { now = Date.now } = {}) {
  let sequence = 0;
  const empty = () => ({ version: 1, shortcuts: [], history: [] });
  const read = () => {
    let state = empty();
    try {
      const parsed = JSON.parse(storage?.getItem?.(STORAGE_KEY) || "null");
      if (parsed && Array.isArray(parsed.shortcuts) && Array.isArray(parsed.history)) {
        state = { version: 1, shortcuts: parsed.shortcuts, history: parsed.history };
      }
    } catch {}
    state.shortcuts = state.shortcuts.filter((item) => item?.id && isInternalBrowserUrl(item.url));
    state.history = state.history.filter(
      (item) => item?.id && isInternalBrowserUrl(item.url) && Number(item.visitedAt) >= now() - MAX_AGE_MS,
    );
    return state;
  };
  const write = (state) => storage?.setItem?.(STORAGE_KEY, JSON.stringify(state));
  const id = () => globalThis.crypto?.randomUUID?.() || `browser-${now()}-${sequence++}`;
  const normalizedUrl = (url) => {
    if (!isInternalBrowserUrl(url)) throw new TypeError("Only HTTP(S) URLs are supported");
    return new URL(url).href;
  };

  return {
    listShortcuts() { return read().shortcuts.slice().sort((a, b) => a.position - b.position); },
    saveShortcut(input) {
      const state = read();
      const existing = state.shortcuts.find((item) => item.id === input.id);
      const saved = {
        id: existing?.id || id(),
        title: String(input.title || new URL(input.url).hostname).trim(),
        url: normalizedUrl(input.url),
        createdAt: existing?.createdAt || now(),
        position: existing?.position ?? state.shortcuts.length,
      };
      state.shortcuts = existing
        ? state.shortcuts.map((item) => item.id === saved.id ? saved : item)
        : [...state.shortcuts, saved];
      write(state);
      return saved;
    },
    removeShortcut(shortcutId) {
      const state = read();
      state.shortcuts = state.shortcuts.filter((item) => item.id !== shortcutId)
        .map((item, position) => ({ ...item, position }));
      write(state);
    },
    reorderShortcuts(ids) {
      const state = read();
      const positions = new Map(ids.map((shortcutId, position) => [shortcutId, position]));
      state.shortcuts = state.shortcuts
        .sort((a, b) => (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER))
        .map((item, position) => ({ ...item, position }));
      write(state);
    },
    listHistory(query = "") {
      const state = read();
      write(state);
      const needle = String(query).trim().toLocaleLowerCase("de");
      return state.history
        .filter((item) => !needle || `${item.title} ${item.url}`.toLocaleLowerCase("de").includes(needle))
        .sort((a, b) => b.visitedAt - a.visitedAt);
    },
    recordVisit(input) {
      const state = read();
      const visit = {
        id: id(), title: String(input.title || input.url), url: normalizedUrl(input.url),
        visitedAt: Number(input.visitedAt ?? now()),
      };
      const newest = state.history.slice().sort((a, b) => b.visitedAt - a.visitedAt)[0];
      state.history = newest?.url === visit.url
        ? state.history.map((item) => item.id === newest.id ? { ...visit, id: newest.id } : item)
        : [...state.history, visit];
      state.history = state.history.filter((item) => item.visitedAt >= now() - MAX_AGE_MS);
      write(state);
      return visit;
    },
    clearHistory() {
      const state = read();
      state.history = [];
      write(state);
    },
  };
}
```

- [ ] **Step 4: Run repository and policy tests**

Run: `npm test -- tests/browserRepository.test.js tests/browserInput.test.js`

Expected: all tests PASS.

- [ ] **Step 5: Commit persistence**

```bash
git add src/browser/browserRepository.js tests/browserRepository.test.js
git commit -m "feat(browser): persist shortcuts and thirty-day history"
```

---

### Task 3: Browser bridge contract and web fallback

**Files:**
- Create: `src/browser/browserBridge.js`
- Create: `tests/browserBridge.test.js`

**Interfaces:**
- Produces: `createBrowserBridge({ Capacitor?, window? })`
- Produces bridge methods: `mount(frame)`, `setFrame(frame)`, `show()`, `hide()`, `destroy()`, `load(url)`, `back()`, `forward()`, `reload()`, `stop()`, `openExternal(url)`, `subscribe(listener)`
- Produces events shaped as `{ type: "state" | "load-start" | "load-end" | "error" | "back-at-root", url?, title?, canGoBack?, canGoForward?, message? }`
- Consumes: registered native plugin name `SidebarBrowser`; otherwise browser window APIs

- [ ] **Step 1: Write failing bridge tests with a fake native plugin**

```js
import { describe, expect, it, vi } from "vitest";
import { createBrowserBridge } from "../src/browser/browserBridge.js";

it("delegates navigation and physical-pixel frames to the native plugin", async () => {
  const plugin = {
    mount: vi.fn(), setFrame: vi.fn(), load: vi.fn(), addListener: vi.fn(() => ({ remove() {} })),
  };
  const bridge = createBrowserBridge({
    nativePlugin: plugin,
    devicePixelRatio: 2,
  });
  await bridge.mount({ x: 10, y: 20, width: 300, height: 500 });
  await bridge.load("https://example.com/");
  expect(plugin.mount).toHaveBeenCalledWith({ x: 20, y: 40, width: 600, height: 1000 });
  expect(plugin.load).toHaveBeenCalledWith({ url: "https://example.com/" });
});

it("opens safe URLs through window.open in the web fallback", async () => {
  const open = vi.fn();
  const bridge = createBrowserBridge({ nativePlugin: null, window: { open }, devicePixelRatio: 1 });
  await bridge.openExternal("https://example.com");
  expect(open).toHaveBeenCalledWith("https://example.com/", "_blank", "noopener,noreferrer");
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npm test -- tests/browserBridge.test.js`

Expected: FAIL because `browserBridge.js` does not exist.

- [ ] **Step 3: Implement the adapter without importing Android classes**

Use `registerPlugin("SidebarBrowser")` only when `Capacitor.isNativePlatform()` is true. Accept dependency injection in tests. Convert CSS-pixel frames to rounded physical pixels once in the JS adapter. The web branch stores the current URL and exposes it to `BrowserPanel`; it must never pretend an iframe can report cross-origin titles or navigation history.

```js
import { toExternalBrowserUrl } from "./browserInput.js";

export function createBrowserBridge(options = {}) {
  const ratio = options.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1;
  const plugin = options.nativePlugin ?? null;
  const listeners = new Set();
  const physical = (frame) => Object.fromEntries(
    Object.entries(frame).map(([key, value]) => [key, Math.max(0, Math.round(value * ratio))]),
  );
  return plugin ? createNativeBridge(plugin, physical, listeners) : createWebBridge(options.window ?? globalThis.window, listeners);
}

function createNativeBridge(plugin, physical, listeners) {
  let nativeHandle;
  const emit = (event) => listeners.forEach((listener) => listener(event));
  return {
    isNative: true,
    async mount(frame) {
      nativeHandle ||= await plugin.addListener("browserEvent", emit);
      return plugin.mount(physical(frame));
    },
    setFrame: (frame) => plugin.setFrame(physical(frame)),
    show: () => plugin.show(),
    hide: () => plugin.hide(),
    load: (url) => plugin.load({ url }),
    back: () => plugin.back(),
    forward: () => plugin.forward(),
    reload: () => plugin.reload(),
    stop: () => plugin.stop(),
    openExternal: (url) => plugin.openExternal({ url }),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async destroy() {
      await nativeHandle?.remove?.();
      nativeHandle = null;
      await plugin.destroy();
    },
  };
}

function createWebBridge(browserWindow, listeners) {
  let currentUrl = "";
  const emit = (event) => listeners.forEach((listener) => listener(event));
  return {
    isNative: false,
    mount: async () => {}, setFrame: async () => {}, show: async () => {}, hide: async () => {},
    destroy: async () => { listeners.clear(); },
    async load(url) {
      currentUrl = url;
      emit({ type: "state", url, canGoBack: false, canGoForward: false });
      emit({ type: "load-start", url });
    },
    back: async () => {}, forward: async () => {}, reload: async () => {
      if (currentUrl) emit({ type: "load-start", url: currentUrl });
    },
    stop: async () => {},
    async openExternal(url) {
      const safe = toExternalBrowserUrl(url);
      if (safe) browserWindow?.open?.(safe, "_blank", "noopener,noreferrer");
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
```

- [ ] **Step 4: Run the bridge tests**

Run: `npm test -- tests/browserBridge.test.js`

Expected: all tests PASS.

- [ ] **Step 5: Commit the bridge contract**

```bash
git add src/browser/browserBridge.js tests/browserBridge.test.js
git commit -m "feat(browser): add native and web bridge contract"
```

---

### Task 4: Browser panel behavior and home screen

**Files:**
- Create: `src/components/BrowserPanel.jsx`
- Create: `tests/BrowserPanel.test.jsx`
- Modify: `src/styles/main.css`

**Interfaces:**
- Consumes: `bridge`, `repository`, `active`, `initialUrl`, `navigationRequest: { id: number, url: string } | null`, `onClose`, `onFullscreenChange`
- Produces: visible toolbar and `data-testid="browser-viewport"` frame target
- Produces: callback `onCurrentPageChange({ url, title })` if supplied

- [ ] **Step 1: Write failing interaction tests**

```jsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BrowserPanel from "../src/components/BrowserPanel.jsx";

function harness() {
  const bridge = {
    mount: vi.fn(), setFrame: vi.fn(), show: vi.fn(), hide: vi.fn(), destroy: vi.fn(),
    load: vi.fn(), back: vi.fn(), forward: vi.fn(), reload: vi.fn(), stop: vi.fn(),
    openExternal: vi.fn(), subscribe: vi.fn(() => () => {}), isNative: true,
  };
  const shortcuts = [];
  const repository = {
    listShortcuts: vi.fn(() => shortcuts), listHistory: vi.fn(() => []),
    saveShortcut: vi.fn((item) => ({ ...item, id: "s1" })), removeShortcut: vi.fn(),
    reorderShortcuts: vi.fn(), recordVisit: vi.fn(), clearHistory: vi.fn(),
  };
  return { bridge, repository };
}

it("searches Google for non-URL text", () => {
  const { bridge, repository } = harness();
  render(<BrowserPanel active bridge={bridge} repository={repository} />);
  fireEvent.change(screen.getByLabelText("Adresse oder Google-Suche"), { target: { value: "zellatmung lernen" } });
  fireEvent.submit(screen.getByRole("form", { name: "Browsernavigation" }));
  expect(bridge.load).toHaveBeenCalledWith("https://www.google.com/search?q=zellatmung%20lernen");
});

it("adds the current page through the top plus dialog", () => {
  const { bridge, repository } = harness();
  render(<BrowserPanel active bridge={bridge} repository={repository} initialUrl="https://example.com/" />);
  fireEvent.click(screen.getByTitle("Zum Schnellzugriff hinzufügen"));
  fireEvent.change(screen.getByLabelText("Shortcut-Name"), { target: { value: "Beispiel" } });
  fireEvent.click(screen.getByRole("button", { name: "Shortcut speichern" }));
  expect(repository.saveShortcut).toHaveBeenCalledWith(expect.objectContaining({ title: "Beispiel", url: "https://example.com/" }));
});

it("opens the current page externally", () => {
  const { bridge, repository } = harness();
  render(<BrowserPanel active bridge={bridge} repository={repository} initialUrl="https://example.com/" />);
  fireEvent.click(screen.getByTitle("Im externen Browser öffnen"));
  expect(bridge.openExternal).toHaveBeenCalledWith("https://example.com/");
});
```

- [ ] **Step 2: Run the component test and verify it fails**

Run: `npm test -- tests/BrowserPanel.test.jsx`

Expected: FAIL because `BrowserPanel.jsx` does not exist.

- [ ] **Step 3: Implement state and bridge lifecycle**

Build explicit local states `home | page | error`, `quick | history`, `isShortcutDialogOpen`, `isFullscreen`, `address`, and `{ url, title, canGoBack, canGoForward, loading }`. Subscribe once to bridge events. Record only successful main-frame `load-end` events. A `back-at-root` event returns to `home`. A change to `navigationRequest.id` loads its validated URL even when it equals the previous URL, so clicking the same document link twice remains deterministic. Use `ResizeObserver` plus `getBoundingClientRect()` to call `mount` once and `setFrame` after layout changes. Hide the native WebView whenever `active` is false, Home, an error card, or a DOM dialog must cover its viewport; show it again only when `active` is true in `page` state. Changing `active` must not reset component state.

The toolbar uses Lucide icons `Home`, `ChevronLeft`, `ChevronRight`, `RotateCw`, `SquarePlus`, `ExternalLink`, `Maximize2/Minimize2`, and `X`. Every icon-only action has a German `title` and `aria-label`. The home view renders editable shortcut tiles and the segmented control “Schnellzugriff” / “Verlauf durchsuchen”. Each shortcut menu contains “Bearbeiten”, “Nach links”, “Nach rechts”, and “Löschen”; the move actions call `reorderShortcuts` with the new complete ID order and are disabled at their respective edges. Use buttons, not click-only divs.

- [ ] **Step 4: Add focused tests for history search, clear confirmation, shortcut edit/delete, bridge error, Home, disabled back/forward, reload, fullscreen, and cleanup**

Add assertions that `bridge.hide()` runs while the shortcut dialog is open, `bridge.destroy()` runs on unmount, errors expose both “Erneut versuchen” and “Extern öffnen”, `back-at-root` shows Home, shortcut move actions pass the complete reordered ID list, and the history list comes from `repository.listHistory(query)`.

- [ ] **Step 5: Add panel styling**

Add `.rail-browser`, `.browser-toolbar`, `.browser-address`, `.browser-home`, `.browser-segment`, `.browser-shortcut-grid`, `.browser-shortcut`, `.browser-history`, `.browser-error`, and `.browser-dialog` rules. Reuse `Manrope`, existing rail colors, 1px translucent borders, 44px minimum touch targets, and existing focus-visible treatment. Do not hard-code a nested 800px reference size; the panel must use flex sizing and independent vertical scrolling.

- [ ] **Step 6: Run focused and existing agent tests**

Run: `npm test -- tests/BrowserPanel.test.jsx tests/aiChatPanel.test.jsx`

Expected: all tests PASS.

- [ ] **Step 7: Commit the standalone panel**

```bash
git add src/components/BrowserPanel.jsx src/styles/main.css tests/BrowserPanel.test.jsx
git commit -m "feat(browser): build sidebar browser panel"
```

---

### Task 5: Merge Browser and Agent into the editor rail

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/AiChatPanel.jsx`
- Modify: `src/styles/main.css`
- Modify: `tests/App.test.jsx`
- Modify: `tests/aiChatPanel.test.jsx`

**Interfaces:**
- Produces: shared `panelMode` and a mounted `BrowserPanel` that accepts `navigationRequest`
- Consumes: `BrowserPanel`, `createBrowserBridge`, `createBrowserRepository`
- Changes `AiChatPanel` to remain mounted while inactive and accept `active: boolean`

- [ ] **Step 1: Write failing shared-rail tests**

In `tests/App.test.jsx`, open a note, then assert:

```jsx
fireEvent.click(screen.getByTitle("Browser"));
expect(screen.getByTestId("editor-sidebar")).toHaveAttribute("data-mode", "browser");
expect(screen.getByTestId("browser-panel")).toBeVisible();

fireEvent.click(screen.getByTitle("KI-Assistent"));
expect(screen.getByTestId("editor-sidebar")).toHaveAttribute("data-mode", "agent");
expect(screen.getByTestId("browser-panel")).not.toBeVisible();

fireEvent.click(screen.getByTitle("Browser"));
expect(screen.getByLabelText("Adresse oder Google-Suche")).toHaveValue("https://example.com/");
```

Also verify that clicking the active mode button closes the rail and that only one expanded panel exists.

- [ ] **Step 2: Run the tests and verify the missing Browser mode failure**

Run: `npm test -- tests/App.test.jsx tests/aiChatPanel.test.jsx`

Expected: FAIL because the editor has only `isChatOpen`.

- [ ] **Step 3: Introduce one panel-mode state in `Editor`**

Replace `isChatOpen` with `panelMode` (`closed | agent | browser`). Keep both `AiChatPanel` and `BrowserPanel` mounted after their first activation; toggle `hidden`, `aria-hidden`, and bridge visibility rather than discarding state. Add `data-testid="editor-sidebar"` and `data-mode={panelMode}`. The rail class is `panel-open` for either content mode and `browser-fullscreen` only for Browser fullscreen.

Create browser bridge and repository once with lazy refs. Add a Globe button directly beneath the Agent button. The shared close callback sets `panelMode` to `closed`. Update the title pill rule from `.chat-open` to `.panel-open`.

- [ ] **Step 4: Preserve Agent behavior while hidden**

Add an `active` prop to `AiChatPanel`; its root gets `hidden={!active}` without resetting `useAgent`. Ensure a running agent continues when Browser is selected. Update its tests to switch the prop from true to false and verify message state is preserved on rerender.

- [ ] **Step 5: Run integration and regression tests**

Run: `npm test -- tests/App.test.jsx tests/BrowserPanel.test.jsx tests/aiChatPanel.test.jsx tests/SplitLayout.test.jsx`

Expected: all tests PASS.

- [ ] **Step 6: Commit the shared rail**

```bash
git add src/App.jsx src/components/AiChatPanel.jsx src/styles/main.css tests/App.test.jsx tests/aiChatPanel.test.jsx
git commit -m "feat(editor): merge browser and agent into one rail"
```

---

### Task 6: Route links from Markdown, note objects, and PDFs

**Files:**
- Create: `src/browser/BrowserLinkContext.jsx`
- Create: `src/components/document/PdfLinkLayer.jsx`
- Create: `tests/PdfLinkLayer.test.jsx`
- Modify: `src/App.jsx`
- Modify: `src/components/Markdown.jsx`
- Modify: `src/components/document/PageObjectLayer.jsx`
- Modify: `src/components/document/DocumentPage.jsx`
- Modify: `src/components/DocumentView.jsx`
- Modify: `tests/aiChatPanel.test.jsx`
- Modify: `tests/pageObjects.test.js`

**Interfaces:**
- Produces: `<BrowserLinkProvider openLink={fn}>` and `useBrowserLink()`
- Produces in `Editor`: `openAppLink(url): void` and `navigationRequest: { id: number, url: string } | null`
- Produces: `<PdfLinkLayer page sourceHandle zoom onOpenLink />`
- Consumes: `openAppLink(url)` from Task 5 and PDF.js `page.getAnnotations()`

- [ ] **Step 1: Write failing link-routing tests**

```jsx
it("routes Markdown links through the app browser", () => {
  const openLink = vi.fn();
  render(
    <BrowserLinkProvider openLink={openLink}>
      <Markdown text="[Quelle](https://example.com)" />
    </BrowserLinkProvider>,
  );
  fireEvent.click(screen.getByRole("link", { name: "Quelle" }));
  expect(openLink).toHaveBeenCalledWith("https://example.com");
});
```

For `PdfLinkLayer`, mock `sourceHandle.document.getPage()` so
`getAnnotations()` resolves to one `{ subtype: "Link", url: "https://example.com", rect: [10, 20, 110, 50] }`, click its accessible overlay, and expect `onOpenLink` once. Add a note-object test that a normal-mode link calls the same callback while selection mode selects it instead.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- tests/PdfLinkLayer.test.jsx tests/aiChatPanel.test.jsx tests/pageObjects.test.js`

Expected: FAIL because the context and PDF link layer do not exist.

- [ ] **Step 3: Implement the safe browser-link context**

`useBrowserLink()` returns the provider callback or `null`. `BrowserLinkProvider` wraps the supplied callback so it first checks `isInternalBrowserUrl`. `Markdown` keeps `href`, `target="_blank"`, and `rel="noreferrer noopener"` as its no-provider fallback, and prevents default only when a non-null context callback handles the URL.

- [ ] **Step 4: Make note link objects clickable in normal mode**

Pass an `onOpenLink` callback through `DocumentView` → `DocumentPage` → `PageObjectLayer`. For `object.type === "link"`, render a semantic button or anchor over the existing pill. Stop propagation, reject unsafe schemes, and call `onOpenLink(object.href)` only when not in select/edit mode.

- [ ] **Step 5: Implement PDF URL annotation overlays**

`PdfLinkLayer` loads annotations with cancellation protection, filters to HTTP(S) URL links, and maps `annotation.rect` using the same PDF viewport scale as `PdfPageCanvas`. Render transparent absolute anchors with visible focus outlines, `aria-label` from annotation title or URL, and `onClick` routing. Put the layer above the background canvas but below ink and active editing handles.

- [ ] **Step 6: Connect `openAppLink` in `Editor`**

Validate the URL, increment a local request counter, set Browser's `navigationRequest` to `{ id, url }`, set `panelMode` to `browser`, and let `BrowserPanel` call `bridge.load` when the ID changes. Wrap the editor subtree in `BrowserLinkProvider`. A document link opened while the Agent is visible switches the same rail to Browser and preserves the conversation.

- [ ] **Step 7: Run document and editor regressions**

Run: `npm test -- tests/PdfLinkLayer.test.jsx tests/aiChatPanel.test.jsx tests/pageObjects.test.js tests/DocumentView.test.jsx tests/App.test.jsx`

Expected: all tests PASS.

- [ ] **Step 8: Commit internal document links**

```bash
git add src/browser/BrowserLinkContext.jsx src/components/document/PdfLinkLayer.jsx src/components/Markdown.jsx src/components/document/PageObjectLayer.jsx src/components/document/DocumentPage.jsx src/components/DocumentView.jsx src/App.jsx tests/PdfLinkLayer.test.jsx tests/aiChatPanel.test.jsx tests/pageObjects.test.js
git commit -m "feat(browser): open document links inside the app"
```

---

### Task 7: Native Android WebView plugin

**Files:**
- Create: `android/app/src/main/java/com/notes/app/browser/SidebarBrowserPlugin.java`
- Create: `android/app/src/main/java/com/notes/app/browser/SidebarBrowserView.java`
- Create: `android/app/src/androidTest/java/com/notes/app/browser/SidebarBrowserPluginTest.java`
- Modify: `android/app/src/main/java/com/notes/app/MainActivity.java`

**Interfaces:**
- Plugin name: `SidebarBrowser`
- Consumes physical-pixel `{ x, y, width, height }` frames from Task 3
- Produces plugin methods `mount`, `setFrame`, `show`, `hide`, `destroy`, `load`, `back`, `forward`, `reload`, `stop`, `openExternal`
- Emits `browserEvent` with the Task 3 event shape

- [ ] **Step 1: Add a failing Android instrumentation test**

Create the plugin under a `BridgeActivity`, call `mount` on the UI thread, and assert the Activity content contains exactly one child WebView with the requested `FrameLayout.LayoutParams`. Call `hide`/`show` and assert visibility, then `destroy` and assert removal. Add a separate test that `javascript:`, `file:`, and `content:` loads are rejected while `https:` is accepted.

Run: `cd android && .\gradlew.bat connectedDebugAndroidTest`

Expected: compilation FAIL because the plugin classes do not exist. If no emulator/device is attached, record that environmental block and still run the compile gate in Step 6.

- [ ] **Step 2: Implement the native view host**

`SidebarBrowserView` owns one Android `WebView`, attaches it to the same root `FrameLayout` that contains Capacitor's bridge view, and applies physical-pixel margins and dimensions on the UI thread. Enable JavaScript, DOM storage, cookies, third-party cookies where Android requires them for login, and safe browsing. Disable file/content access and universal file URL access. Do not call `addJavascriptInterface`.

- [ ] **Step 3: Implement navigation and events**

Use a `WebViewClient` that keeps HTTP(S) requests internal, routes `mailto:`/`tel:` through an Android `ACTION_VIEW` intent, rejects other schemes, and calls `handler.cancel()` in `onReceivedSslError`. Emit main-frame load and error events only. Use a `WebChromeClient` for title updates and route `onCreateWindow` back into the same WebView. Downloads use `ACTION_VIEW` or Android's external handler; do not add storage permissions or a download queue. Install an enabled `OnBackPressedCallback` while the view is visible: call `goBack()` when possible, otherwise disable/hide the native view and emit `back-at-root`; when hidden, leave Android's normal back handling untouched.

- [ ] **Step 4: Implement plugin methods and lifecycle cleanup**

Annotate with `@CapacitorPlugin(name = "SidebarBrowser")`. Each `@PluginMethod` validates inputs, switches to `getActivity().runOnUiThread`, and resolves or rejects its `PluginCall` exactly once. `destroy` must `stopLoading`, detach, clear clients, call `destroy()`, and null the reference. `handleOnPause` hides the view; `handleOnResume` shows it only when React last requested visible.

- [ ] **Step 5: Register the plugin**

```java
package com.notes.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.notes.app.browser.SidebarBrowserPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(SidebarBrowserPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
```

- [ ] **Step 6: Compile and run available Android tests**

Run: `cd android && .\gradlew.bat testDebugUnitTest assembleDebug`

Expected: BUILD SUCCESSFUL.

Run when a device/emulator is attached: `cd android && .\gradlew.bat connectedDebugAndroidTest`

Expected: instrumentation tests PASS.

- [ ] **Step 7: Commit the native plugin**

```bash
git add android/app/src/main/java/com/notes/app/MainActivity.java android/app/src/main/java/com/notes/app/browser/SidebarBrowserPlugin.java android/app/src/main/java/com/notes/app/browser/SidebarBrowserView.java android/app/src/androidTest/java/com/notes/app/browser/SidebarBrowserPluginTest.java
git commit -m "feat(android): embed native sidebar webview"
```

---

### Task 8: Responsive polish, browser acceptance, and full verification

**Files:**
- Modify: `src/styles/main.css`
- Modify as failures require: `src/App.jsx`, `src/components/BrowserPanel.jsx`, `src/browser/browserBridge.js`
- Create: `docs/superpowers/verification/2026-09-03-integrated-sidebar-browser-results.md`

**Interfaces:**
- Consumes all prior task interfaces
- Produces a verified responsive UI and recorded Android/manual limitations

- [ ] **Step 1: Add the responsive acceptance rules**

At tablet widths keep the rail 400–430 px wide. Below the point where the rail plus document leaves a usable canvas, use `.editor-sidebar.panel-open { width: calc(100vw - 16px); }` while retaining the 72px tool column. Browser fullscreen uses the available editor viewport, not browser fullscreen APIs. Add safe-area padding and ensure browser content owns its vertical scroll.

- [ ] **Step 2: Run the complete JavaScript suite and production build**

Run: `npm test`

Expected: all tests PASS.

Run: `npm run build`

Expected: Vite build succeeds without unresolved imports or warnings introduced by this feature.

- [ ] **Step 3: Run Android build verification**

Run: `npx cap sync android`

Expected: Capacitor sync succeeds and retains the local plugin sources.

Run: `cd android && .\gradlew.bat testDebugUnitTest assembleDebug`

Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Capture and inspect browser UI states**

Run the Vite app and capture at least:

- Tablet: closed rail, Agent, Browser quick access, live/fallback page, shortcut dialog, history, error, fullscreen.
- Narrow viewport: Browser closed and open, plus one stress width 5–15% narrower.
- Focused crops: toolbar/address row, shortcut grid, Agent/Browser rail junction, dialog, and error actions.

Verify no horizontal overflow, clipped icons/text, hidden close/external buttons, native viewport overlap, or focusable hidden controls. Check one keyboard-focus state and one selected segmented-control state. The web iframe may show a blocked-site limitation card; do not report that as Android behavior.

- [ ] **Step 5: Perform Android device acceptance**

On an attached Android tablet/device verify: a free-text Google search, domain completion, login/cookie retention, Back/Forward/Reload, `target=_blank` staying internal, one note link, one PDF link annotation, external opening, 30-day pruning with seeded storage, Agent ↔ Browser state retention, rotation, keyboard, docked/fullscreen transitions, and SSL-error rejection using a known invalid certificate test endpoint in a controlled test environment.

- [ ] **Step 6: Record exact evidence and remaining environmental gaps**

Write `docs/superpowers/verification/2026-09-03-integrated-sidebar-browser-results.md` with commands, exit codes, tested viewport sizes, screenshot paths, Android device/API level, each manual scenario result, and any test that could not run. Do not describe unrun device checks as passing.

- [ ] **Step 7: Commit final polish and verification**

```bash
git add src/styles/main.css src/App.jsx src/components/BrowserPanel.jsx src/browser/browserBridge.js docs/superpowers/verification/2026-09-03-integrated-sidebar-browser-results.md
git commit -m "test(browser): verify integrated sidebar experience"
```
