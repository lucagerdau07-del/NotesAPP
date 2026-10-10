# Drag Images from the Internal Browser into a Note — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user long-press an image inside the internal browser panel (e.g. a Google Images result) and drag it onto the note canvas, where it is inserted as a page object at the drop point.

**Architecture:** The internal browser is a real native `android.webkit.WebView` (`SidebarBrowserView`) layered on top of the Capacitor WebView — it is not part of the note's DOM, so this cannot be a plain HTML5 drag-and-drop. On long-press over an `<img>`, native code reads the image URL via `WebView.HitTestResult` and starts Android's native `View.startDragAndDrop`. A drag listener on the Capacitor WebView (which spans the whole screen, underneath the browser panel) accepts the drop, downloads the image bytes natively (no CORS concerns off the main JS thread), base64-encodes it into a `data:` URL, and emits it through the existing `SidebarBrowser` Capacitor plugin event channel with the drop's CSS-pixel coordinates. The JS side already has everything needed to place an object at a point — `DocumentView`'s `insertObject`/`mapViewportPoint` pipeline, used today for click-placed shapes — so the new code there is small: an optional anchor point plus a small data-URL variant of the existing image loader.

**Tech Stack:** React 19 + Vite + Vitest/RTL (JS), Capacitor 8 Android plugin in Java + plain JUnit (native).

**Spec:** No separate spec doc — brainstormed and planned in one pass at the user's request. This plan's Architecture section and Global Constraints below are the spec.

## Global Constraints

- Native-Android-only feature. The dev/web fallback (`bridge.isNative === false`, plain `<iframe>`) is explicitly out of scope — it has no native WebView to hook drag events into.
- Inserted images are always embedded as `data:` URLs in the ink document, never live remote URLs — matches the existing convention and MAX_EDGE=1400 re-encoding in `src/ink/imageObject.js`.
- No new npm packages or Gradle dependencies.
- No new UI copy or toasts: a successful drop silently inserts the image; a failed download silently inserts nothing — mirrors the existing `handleImageFile` behavior in `src/components/DocumentView.jsx` ("A file the browser cannot decode simply inserts nothing").
- Native image download uses `HttpURLConnection` with a 10s connect/read timeout and a browser-like `User-Agent` + `Referer: https://www.google.com/` header, since some image CDNs 403 requests that don't look like a browser.
- Scoped to regular notes (`DocumentView`). Whiteboard-kind documents (`WhiteboardEditor`) already have their own separate image-insert flow and are not touched by this plan — the same prop could be threaded into `WhiteboardEditor` later using the identical pattern if wanted.

---

## File Structure

- Modify: `src/ink/imageObject.js` — add a data-URL entry point, share the fit/encode logic with the existing file-based one.
- Create: `tests/imageObject.test.js`
- Modify: `src/components/DocumentView.jsx` — `insertObject` accepts an optional anchor point; a new effect consumes an incoming drop request.
- Modify: `tests/DocumentView.test.jsx` — one new test.
- Modify: `src/components/SplitLayout.jsx` — thread the drop request prop through to `DocumentView`.
- Modify: `src/App.jsx` — subscribe to the browser bridge for `"image-drop"` events, own the pending-drop state.
- Create: `android/app/src/main/java/com/notes/app/browser/ImageDropHandler.java` — pure helpers (URL scheme check, coordinate conversion, native HTTP download → data URL).
- Create: `android/app/src/test/java/com/notes/app/browser/ImageDropHandlerTest.java`
- Modify: `android/app/src/main/java/com/notes/app/browser/SidebarBrowserView.java` — long-press-on-image starts a native drag.
- Modify: `android/app/src/main/java/com/notes/app/browser/SidebarBrowserPlugin.java` — accepts the drop on the Capacitor WebView, downloads, emits the event.

---

### Task 1: Data-URL entry point for image insertion

**Files:**
- Modify: `src/ink/imageObject.js`
- Test: `tests/imageObject.test.js` (create)

**Interfaces:**
- Produces: `readImageObjectSourceFromDataUrl(dataUrl: string) => Promise<{ src: string, width: number, height: number }>` — same contract as the existing `readImageObjectSource(file)`, but starting from a data URL instead of a `File`.

- [ ] **Step 1: Write the failing tests**

Create `tests/imageObject.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { readImageObjectSource, readImageObjectSourceFromDataUrl } from '../src/ink/imageObject.js';

function stubImage(naturalWidth, naturalHeight) {
  const OriginalImage = globalThis.Image;
  class MockImage {
    set src(_value) {
      this.naturalWidth = naturalWidth;
      this.naturalHeight = naturalHeight;
      queueMicrotask(() => this.onload?.());
    }
  }
  globalThis.Image = MockImage;
  return () => {
    globalThis.Image = OriginalImage;
  };
}

describe('readImageObjectSourceFromDataUrl', () => {
  it('passes a data URL through unchanged when it already fits inside MAX_EDGE', async () => {
    const restore = stubImage(200, 100);
    try {
      const original = 'data:image/png;base64,AAAA';
      const result = await readImageObjectSourceFromDataUrl(original);
      expect(result).toEqual({ src: original, width: 200, height: 100 });
    } finally {
      restore();
    }
  });

  it('downscales an oversized PNG and re-encodes it as PNG through canvas', async () => {
    const restore = stubImage(2000, 1000);
    try {
      const original = 'data:image/png;base64,AAAA';
      const toDataURL = HTMLCanvasElement.prototype.toDataURL;
      const result = await readImageObjectSourceFromDataUrl(original);
      expect(result.width).toBe(1400);
      expect(result.height).toBe(700);
      expect(toDataURL).toHaveBeenCalledWith('image/png', 0.85);
    } finally {
      restore();
    }
  });

  it('downscales an oversized non-PNG and re-encodes it as JPEG', async () => {
    const restore = stubImage(2000, 1000);
    try {
      const toDataURL = HTMLCanvasElement.prototype.toDataURL;
      await readImageObjectSourceFromDataUrl('data:image/jpeg;base64,AAAA');
      expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
    } finally {
      restore();
    }
  });
});

describe('readImageObjectSource (existing file path, unchanged behavior)', () => {
  it('still reads a File and fits it inside MAX_EDGE', async () => {
    const restore = stubImage(50, 50);
    try {
      const file = new File(['abc'], 'a.png', { type: 'image/png' });
      const result = await readImageObjectSource(file);
      expect(result.width).toBe(50);
      expect(result.height).toBe(50);
      expect(result.src.startsWith('data:')).toBe(true);
    } finally {
      restore();
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/imageObject.test.js`
Expected: FAIL — `readImageObjectSourceFromDataUrl is not a function` (not exported yet).

- [ ] **Step 3: Refactor `imageObject.js` to add the shared helper and the new export**

Replace the whole file with:

```js
// Notes persist through localStorage, so a phone photo pasted at full size
// fills the quota after a handful of images. Everything inserted is re-encoded
// to fit inside MAX_EDGE first.
export const MAX_EDGE = 1400;

export function fitInside(width, height, maxEdge = MAX_EDGE) {
  const longest = Math.max(width, height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Bild konnte nicht gelesen werden"));
    image.src = url;
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
    reader.readAsDataURL(file);
  });
}

// PNG keeps transparency for screenshots and diagrams; photos would only bloat
// as PNG, so anything not already a PNG comes back as JPEG.
async function fitAndEncode(original, preferPng) {
  const image = await loadImage(original);
  const size = fitInside(image.naturalWidth, image.naturalHeight);
  if (size.width === image.naturalWidth && size.height === image.naturalHeight)
    return { src: original, ...size };

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) return { src: original, ...size };
  context.drawImage(image, 0, 0, size.width, size.height);
  const type = preferPng ? "image/png" : "image/jpeg";
  return { src: canvas.toDataURL(type, 0.85), ...size };
}

export async function readImageObjectSource(file) {
  const original = await readAsDataUrl(file);
  return fitAndEncode(original, file.type === "image/png");
}

// For images that already arrive as a data URL (e.g. downloaded natively from
// the internal browser) — same fit/encode pipeline, minus the FileReader step.
export async function readImageObjectSourceFromDataUrl(dataUrl) {
  return fitAndEncode(dataUrl, /^data:image\/png/i.test(dataUrl));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/imageObject.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ink/imageObject.js tests/imageObject.test.js
git commit -m "feat(ink): add data-URL image source for non-file image inserts"
```

---

### Task 2: `DocumentView` accepts a point-anchored image drop

**Files:**
- Modify: `src/components/DocumentView.jsx`
- Test: `tests/DocumentView.test.jsx`

**Interfaces:**
- Consumes: `readImageObjectSourceFromDataUrl` from Task 1 (`src/ink/imageObject.js`); `mapViewportPoint` (already imported from `src/ink/pageCoordinates.js`).
- Produces: `DocumentView` accepts two new optional props: `imageDropRequest: { id: string, dataUrl: string, x: number, y: number } | null` and `onImageDropHandled: (id: string) => void`. When `imageDropRequest` changes, it inserts an image object anchored at `(x, y)` (viewport CSS px, same space as a `PointerEvent`'s `clientX/clientY` relative to the app root) and then calls `onImageDropHandled(id)`.

- [ ] **Step 1: Write the failing test**

Add to `tests/DocumentView.test.jsx` (after the existing tests, same file — it already has `createControllerDouble`, `toolState`, and `mockRect` helpers):

```js
test('drops a browser image at the point it lands on the page', async () => {
  const OriginalImage = globalThis.Image;
  class MockImage {
    set src(_value) {
      this.naturalWidth = 200;
      this.naturalHeight = 100;
      queueMicrotask(() => this.onload?.());
    }
  }
  globalThis.Image = MockImage;

  const addObject = vi.fn();
  const controller = createControllerDouble({ addObject });
  const { rerender } = render(
    <DocumentView inkController={controller} toolbarState={toolState()} />,
  );
  const page = screen.getByTestId('document-page');
  mockRect(page, { left: 0, top: 0, width: 800, height: 1200 });

  rerender(
    <DocumentView
      inkController={controller}
      toolbarState={toolState()}
      imageDropRequest={{ id: 'drop-1', dataUrl: 'data:image/png;base64,AA==', x: 100, y: 100 }}
    />,
  );

  await vi.waitFor(() => expect(addObject).toHaveBeenCalledTimes(1));
  expect(addObject.mock.calls[0][0]).toEqual(expect.objectContaining({
    type: 'image',
    pageId: 'page-1',
    src: 'data:image/png;base64,AA==',
    x: 0,
    y: 50,
    width: 200,
    height: 100,
  }));

  globalThis.Image = OriginalImage;
});

test('reports the drop as handled once the image is inserted', async () => {
  globalThis.Image = class {
    set src(_value) {
      this.naturalWidth = 40;
      this.naturalHeight = 40;
      queueMicrotask(() => this.onload?.());
    }
  };

  const onImageDropHandled = vi.fn();
  const controller = createControllerDouble({ addObject: vi.fn() });
  const { rerender } = render(
    <DocumentView inkController={controller} toolbarState={toolState()} />,
  );
  mockRect(screen.getByTestId('document-page'), { left: 0, top: 0, width: 800, height: 1200 });

  rerender(
    <DocumentView
      inkController={controller}
      toolbarState={toolState()}
      imageDropRequest={{ id: 'drop-2', dataUrl: 'data:image/png;base64,BB==', x: 10, y: 10 }}
      onImageDropHandled={onImageDropHandled}
    />,
  );

  await vi.waitFor(() => expect(onImageDropHandled).toHaveBeenCalledWith('drop-2'));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/DocumentView.test.jsx`
Expected: FAIL — `addObject` never called / `imageDropRequest` prop not recognized (no crash, just times out waiting).

- [ ] **Step 3: Add the import**

In `src/components/DocumentView.jsx`, change:

```js
import { readImageObjectSource } from "../ink/imageObject";
```

to:

```js
import { readImageObjectSource, readImageObjectSourceFromDataUrl } from "../ink/imageObject";
```

- [ ] **Step 4: Accept the two new props**

In the `DocumentView` signature (currently `note, sourceHandle, sourceLoading, sourceError, retrySource, inkController, focusBoxState, toolbarState, onBack, railSlot, onCurrentPageChange, isImmersive`), add the two new ones:

```js
export default function DocumentView({
  note,
  sourceHandle,
  sourceLoading,
  sourceError,
  retrySource,
  inkController,
  focusBoxState,
  toolbarState,
  onBack,
  railSlot,
  onCurrentPageChange,
  isImmersive,
  imageDropRequest,
  onImageDropHandled,
}) {
```

- [ ] **Step 5: Let `insertObject` take an optional anchor**

Replace:

```js
  const insertObject = (type, size, extra = {}) => {
    const anchor = viewportCenterOnPage();
    if (!anchor) return null;
    const object = {
      id: globalThis.crypto?.randomUUID?.() || `object-${Date.now()}`,
      type,
      pageId: anchor.pageId,
      x: anchor.x - size.width / 2,
      y: anchor.y - size.height / 2,
      width: size.width,
      height: size.height,
      color: penColor || "#3E7BD8",
      strokeWidth: rawLineWidth ?? lineWidth ?? 3,
      ...extra,
    };
    inkController?.addObject?.(object);
    setSelectedObjectId(object.id);
    return object;
  };
```

with:

```js
  const insertObject = (type, size, extra = {}, anchor = null) => {
    const point = anchor || viewportCenterOnPage();
    if (!point) return null;
    const object = {
      id: globalThis.crypto?.randomUUID?.() || `object-${Date.now()}`,
      type,
      pageId: point.pageId,
      x: point.x - size.width / 2,
      y: point.y - size.height / 2,
      width: size.width,
      height: size.height,
      color: penColor || "#3E7BD8",
      strokeWidth: rawLineWidth ?? lineWidth ?? 3,
      ...extra,
    };
    inkController?.addObject?.(object);
    setSelectedObjectId(object.id);
    return object;
  };
```

- [ ] **Step 6: Consume an incoming drop request**

Right after that `insertObject` definition, add:

```js
  // A drop from the internal browser arrives as a plain {id, dataUrl, x, y} —
  // x/y are already viewport CSS px, the same space a PointerEvent's
  // clientX/clientY would be in, so the same relativePoint+mapViewportPoint
  // pipeline that places click-dragged shapes places this too.
  useEffect(() => {
    if (!imageDropRequest) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { src, width, height } = await readImageObjectSourceFromDataUrl(
          imageDropRequest.dataUrl,
        );
        if (cancelled) return;
        const maxWidth = Math.min(baseWidth * 0.8, width);
        const scale = maxWidth / width;
        const point = mapViewportPoint(
          pageLayout,
          relativePoint(containerRef.current, {
            clientX: imageDropRequest.x,
            clientY: imageDropRequest.y,
          }),
        );
        insertObject(
          "image",
          { width: maxWidth, height: height * scale },
          { src },
          point,
        );
      } catch {
        // An image the browser cannot decode simply inserts nothing.
      } finally {
        if (!cancelled) onImageDropHandled?.(imageDropRequest.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageDropRequest]);
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/DocumentView.test.jsx`
Expected: PASS (all tests in the file, including the 2 new ones).

- [ ] **Step 8: Run the full JS suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — no other suite touches `insertObject`'s signature or `imageObject.js` in a way this should break.

- [ ] **Step 9: Commit**

```bash
git add src/components/DocumentView.jsx tests/DocumentView.test.jsx
git commit -m "feat(document): insert dropped browser images at the drop point"
```

---

### Task 3: Wire the browser bridge's drop event to `DocumentView`

**Files:**
- Modify: `src/components/SplitLayout.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `DocumentView`'s `imageDropRequest`/`onImageDropHandled` props from Task 2; `browserBridge.subscribe(listener)` (already exists, already forwards any event shape verbatim — see `tests/browserBridge.test.js`).
- Produces: nothing new for later tasks — this is the last JS piece, it just closes the loop from bridge event to canvas.

This is thin plumbing (subscribe → setState → pass a prop down → clear on a callback), not new decision logic, so there's no new unit test for it — the behavior it wires together is already covered by Task 2's test, and the transport (arbitrary event types passing through `bridge.subscribe`) is already covered by the existing "forwards native browser events to subscribers" test in `tests/browserBridge.test.js`. It's verified here by the full suite staying green plus the on-device check in Task 7.

- [ ] **Step 1: Thread the props through `SplitLayout`**

In `src/components/SplitLayout.jsx`, add `imageDropRequest` and `onImageDropHandled` to the component's props and pass them to `DocumentView`:

```js
export default function SplitLayout({
  activeTab,
  onBack,
  documentId: propDocumentId,
  note,
  railSlot,
  onPageCountChange,
  onCurrentPageChange,
  isImmersive,
  inkControllerRef,
  imageDropRequest,
  onImageDropHandled,
}) {
```

and, in the `smartCanvas` branch:

```js
        <DocumentView
          note={note}
          sourceHandle={sourceHandle}
          sourceLoading={sourceLoading}
          sourceError={sourceError}
          retrySource={retrySource}
          inkController={inkController}
          toolState={toolState}
          focusBoxState={focusBoxState}
          toolbarState={toolState}
          onBack={onBack}
          railSlot={railSlot}
          onCurrentPageChange={onCurrentPageChange}
          isImmersive={isImmersive}
          imageDropRequest={imageDropRequest}
          onImageDropHandled={onImageDropHandled}
        />
```

- [ ] **Step 2: Own the pending drop in `App.jsx`'s `Editor` and subscribe to the bridge**

In `src/App.jsx`, right after the existing `browserRepository` declaration:

```js
  const browserRepository = useMemo(
    () => createBrowserRepository(globalThis.localStorage),
    [],
  );
  const [imageDropRequest, setImageDropRequest] = useState(null);
  useEffect(() => {
    return browserBridge.subscribe((event) => {
      if (event.type !== "image-drop") return;
      setImageDropRequest({
        id: `${Date.now()}-${Math.random()}`,
        dataUrl: event.dataUrl,
        x: event.x,
        y: event.y,
      });
    });
  }, [browserBridge]);
```

- [ ] **Step 3: Pass the state and the clear-callback down to `SplitLayout`**

In the `<SplitLayout ... />` usage inside `Editor`'s JSX (the one with `inkControllerRef={inkControllerRef}`), add:

```js
        <SplitLayout
          activeTab="smartCanvas"
          note={activeNote}
          documentId={activeNote.id}
          onBack={onBack}
          railSlot={railSlot}
          onPageCountChange={setPageCount}
          onCurrentPageChange={setCurrentPage}
          isImmersive={isImmersive}
          inkControllerRef={inkControllerRef}
          imageDropRequest={imageDropRequest}
          onImageDropHandled={(id) =>
            setImageDropRequest((current) => (current?.id === id ? null : current))
          }
        />
```

- [ ] **Step 4: Run the full JS suite**

Run: `npx vitest run`
Expected: PASS — `App.test.jsx` doesn't exercise `bridge.isNative === true`, so this new subscription stays dormant (web fallback never emits `"image-drop"`) and shouldn't change any existing assertion.

- [ ] **Step 5: Commit**

```bash
git add src/components/SplitLayout.jsx src/App.jsx
git commit -m "feat(editor): forward browser image-drop events to the note canvas"
```

---

### Task 4: Native pure helpers for the image drop (Android)

**Files:**
- Create: `android/app/src/main/java/com/notes/app/browser/ImageDropHandler.java`
- Test: `android/app/src/test/java/com/notes/app/browser/ImageDropHandlerTest.java` (create)

**Interfaces:**
- Produces: `ImageDropHandler.isDataUrl(String url) -> boolean`, `ImageDropHandler.toCssPixels(float physicalPixels, float density) -> double`, `ImageDropHandler.downloadAsDataUrl(String imageUrl) -> String | null` (blocking; caller runs it off the main thread).

Only `isDataUrl` and `toCssPixels` are plain JUnit-testable — `downloadAsDataUrl` touches `android.util.Base64` and the network, which need a real device/emulator (this project has no Robolectric dependency, and adding one just for this is out of scope). That method is exercised manually in Task 7.

- [ ] **Step 1: Write the failing test**

Create `android/app/src/test/java/com/notes/app/browser/ImageDropHandlerTest.java`:

```java
package com.notes.app.browser;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ImageDropHandlerTest {
  @Test
  public void recognizesDataUrls() {
    assertTrue(ImageDropHandler.isDataUrl("data:image/png;base64,AAAA"));
    assertTrue(ImageDropHandler.isDataUrl("DATA:image/png;base64,AAAA"));
    assertFalse(ImageDropHandler.isDataUrl("https://example.com/a.png"));
    assertFalse(ImageDropHandler.isDataUrl(null));
  }

  @Test
  public void convertsPhysicalPixelsToCssPixelsUsingDensity() {
    assertEquals(150.0, ImageDropHandler.toCssPixels(300f, 2f), 0.0001);
    assertEquals(300.0, ImageDropHandler.toCssPixels(300f, 1f), 0.0001);
  }

  @Test
  public void treatsAZeroOrNegativeDensityAsOne() {
    assertEquals(100.0, ImageDropHandler.toCssPixels(100f, 0f), 0.0001);
    assertEquals(100.0, ImageDropHandler.toCssPixels(100f, -1f), 0.0001);
  }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from the repo root): `android\gradlew.bat :app:testDebugUnitTest --tests "com.notes.app.browser.ImageDropHandlerTest"`
Expected: FAIL to compile — `ImageDropHandler` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `android/app/src/main/java/com/notes/app/browser/ImageDropHandler.java`:

```java
package com.notes.app.browser;

import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Pure/side-effect helpers for turning a dragged-out browser image into a data URL. */
final class ImageDropHandler {
  private static final String USER_AGENT =
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36";
  private static final String REFERER = "https://www.google.com/";
  private static final int TIMEOUT_MS = 10000;

  private ImageDropHandler() {}

  static boolean isDataUrl(String url) {
    return url != null && url.regionMatches(true, 0, "data:", 0, 5);
  }

  /** WebView hands us physical/device pixels; the note canvas works in CSS px. */
  static double toCssPixels(float physicalPixels, float density) {
    float safeDensity = density > 0 ? density : 1f;
    return physicalPixels / safeDensity;
  }

  /**
   * Downloads {@code imageUrl} and returns it as a "data:<mime>;base64,..." string, or null on
   * any failure. Already-a-data-URL input is returned unchanged. Blocking — call off the main
   * thread.
   */
  static String downloadAsDataUrl(String imageUrl) {
    if (isDataUrl(imageUrl)) return imageUrl;
    HttpURLConnection connection = null;
    try {
      connection = (HttpURLConnection) new URL(imageUrl).openConnection();
      connection.setConnectTimeout(TIMEOUT_MS);
      connection.setReadTimeout(TIMEOUT_MS);
      connection.setRequestProperty("User-Agent", USER_AGENT);
      connection.setRequestProperty("Referer", REFERER);
      int status = connection.getResponseCode();
      if (status < 200 || status >= 300) return null;
      String mime = contentTypeOf(connection);
      byte[] bytes = readAll(connection.getInputStream());
      String encoded = Base64.encodeToString(bytes, Base64.NO_WRAP);
      return "data:" + mime + ";base64," + encoded;
    } catch (IOException | RuntimeException error) {
      return null;
    } finally {
      if (connection != null) connection.disconnect();
    }
  }

  private static String contentTypeOf(HttpURLConnection connection) {
    String mime = connection.getContentType();
    if (mime == null || !mime.startsWith("image/")) return "image/jpeg";
    int semicolon = mime.indexOf(';');
    return semicolon >= 0 ? mime.substring(0, semicolon).trim() : mime;
  }

  private static byte[] readAll(InputStream input) throws IOException {
    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
    byte[] chunk = new byte[8192];
    int read;
    while ((read = input.read(chunk)) != -1) buffer.write(chunk, 0, read);
    return buffer.toByteArray();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `android\gradlew.bat :app:testDebugUnitTest --tests "com.notes.app.browser.ImageDropHandlerTest"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/notes/app/browser/ImageDropHandler.java android/app/src/test/java/com/notes/app/browser/ImageDropHandlerTest.java
git commit -m "feat(android): add pure helpers for downloading a dropped browser image"
```

---

### Task 5: Long-press an image in the browser panel to start a native drag

**Files:**
- Modify: `android/app/src/main/java/com/notes/app/browser/SidebarBrowserView.java`

**Interfaces:**
- Produces: while the sidebar WebView is mounted, long-pressing an `<img>` (or an image wrapped in a link, as Google Images results are) starts a system drag carrying the image URL as plain text, labeled `SidebarBrowserView.IMAGE_DRAG_LABEL`. Task 6 reads that label and URL.

No unit test here — this is a real touch gesture wired through `WebView.HitTestResult` and `View.startDragAndDrop`, both of which need a live `WebView` attached to an `Activity` (instrumentation, not plain JUnit). Verified manually in Task 7. `SidebarBrowserPluginTest.java` (existing, `androidTest`) already only covers `isSafeWebUrl` for the same reason — this plugin has never had instrumented WebView-interaction tests.

- [ ] **Step 1: Add the drag label constant and the import**

In `SidebarBrowserView.java`, add to the imports:

```java
import android.content.ClipData;
```

and add this constant next to the class's other fields:

```java
  /** Marks a drag as "one of our images", so the drop side ignores unrelated system drags. */
  static final String IMAGE_DRAG_LABEL = "notes-app-image";
```

- [ ] **Step 2: Start a drag on long-press of an image**

In `mount()`, right after `webView.setDownloadListener(...)` and before `root.addView(webView)`, add:

```java
      webView.setOnLongClickListener(v -> {
        WebView.HitTestResult result = webView.getHitTestResult();
        int type = result.getType();
        if (type != WebView.HitTestResult.IMAGE_TYPE
            && type != WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE) {
          return false;
        }
        String imageUrl = result.getExtra();
        if (imageUrl == null) return false;
        ClipData clip = ClipData.newPlainText(IMAGE_DRAG_LABEL, imageUrl);
        return webView.startDragAndDrop(clip, new ImageDragShadow(webView), null, 0);
      });
```

- [ ] **Step 3: Add a simple drag shadow**

The default `View.DragShadowBuilder(webView)` would drag a shadow the size of the whole sidebar WebView, which looks broken. Add a small fixed-size placeholder shadow instead — a private static inner class in the same file, right after the `Chrome` class:

```java
  // ponytail: a plain rounded square, not a thumbnail of the actual dragged
  // image — decoding the image synchronously on long-press would delay drag
  // start. Upgrade path: decode a small thumbnail bitmap once HitTestResult
  // gives us the URL, if the plain square ever feels wrong in practice.
  private static final class ImageDragShadow extends View.DragShadowBuilder {
    private static final int SIZE_DP = 72;
    private final int sizePx;

    ImageDragShadow(View view) {
      super(view);
      sizePx = Math.round(SIZE_DP * view.getResources().getDisplayMetrics().density);
    }

    @Override
    public void onProvideShadowMetrics(android.graphics.Point outShadowSize, android.graphics.Point outShadowTouchPoint) {
      outShadowSize.set(sizePx, sizePx);
      outShadowTouchPoint.set(sizePx / 2, sizePx / 2);
    }

    @Override
    public void onDrawShadow(android.graphics.Canvas canvas) {
      android.graphics.Paint paint = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
      paint.setColor(Color.argb(200, 62, 123, 216));
      float radius = sizePx * 0.18f;
      canvas.drawRoundRect(new android.graphics.RectF(0, 0, sizePx, sizePx), radius, radius, paint);
    }
  }
```

(`Color` is already imported in this file.)

- [ ] **Step 4: Build to verify it compiles**

Run: `android\gradlew.bat :app:compileDebugJavaWithJavac`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/notes/app/browser/SidebarBrowserView.java
git commit -m "feat(android): long-press an image in the browser panel to start a drag"
```

---

### Task 6: Accept the drop on the note canvas and emit it to JS

**Files:**
- Modify: `android/app/src/main/java/com/notes/app/browser/SidebarBrowserPlugin.java`

**Interfaces:**
- Consumes: `ImageDropHandler.isDataUrl/toCssPixels/downloadAsDataUrl` (Task 4); `SidebarBrowserView.IMAGE_DRAG_LABEL` (Task 5).
- Produces: a `"browserEvent"` notification with `{ type: "image-drop", dataUrl, x, y }`, which `src/App.jsx`'s subscription (Task 3) already listens for.

No unit test here either — it needs a live `Bridge`/`WebView`/`DragEvent`, i.e. instrumentation. Verified manually in Task 7.

- [ ] **Step 1: Add the imports**

In `SidebarBrowserPlugin.java`, add:

```java
import android.content.ClipDescription;
import android.view.DragEvent;
import android.view.View;
```

- [ ] **Step 2: Install the drag listener once the plugin loads**

Add this override (anywhere among the other methods):

```java
  @Override
  public void load() {
    super.load();
    getActivity().runOnUiThread(() -> getBridge().getWebView().setOnDragListener(this::handleDrag));
  }
```

- [ ] **Step 3: Handle the drag/drop and download the image off the main thread**

Add:

```java
  private boolean handleDrag(View view, DragEvent event) {
    switch (event.getAction()) {
      case DragEvent.ACTION_DRAG_STARTED: {
        ClipDescription description = event.getClipDescription();
        return description != null
            && SidebarBrowserView.IMAGE_DRAG_LABEL.equals(description.getLabel());
      }
      case DragEvent.ACTION_DROP: {
        if (event.getClipData() == null || event.getClipData().getItemCount() == 0) return false;
        String imageUrl = event.getClipData().getItemAt(0).getText().toString();
        float density = getActivity().getResources().getDisplayMetrics().density;
        double x = ImageDropHandler.toCssPixels(event.getX(), density);
        double y = ImageDropHandler.toCssPixels(event.getY(), density);
        new Thread(() -> {
          String dataUrl = ImageDropHandler.downloadAsDataUrl(imageUrl);
          if (dataUrl == null) return;
          getActivity().runOnUiThread(() -> emitImageDrop(dataUrl, x, y));
        }).start();
        return true;
      }
      default:
        return true;
    }
  }

  private void emitImageDrop(String dataUrl, double x, double y) {
    JSObject data = new JSObject();
    data.put("type", "image-drop");
    data.put("dataUrl", dataUrl);
    data.put("x", x);
    data.put("y", y);
    notifyListeners("browserEvent", data);
  }
```

- [ ] **Step 4: Build to verify it compiles**

Run: `android\gradlew.bat :app:compileDebugJavaWithJavac`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/notes/app/browser/SidebarBrowserPlugin.java
git commit -m "feat(android): download a dropped browser image and hand it to the note canvas"
```

---

### Task 7: End-to-end verification on the tablet

**Files:** none (manual verification only).

No source changes — this task confirms Tasks 1–6 actually work together on the real device, since Tasks 5/6 have no automated coverage.

- [ ] **Step 1: Build and install the debug APK on the tablet**

Use the project's existing `update-tablet-app` flow (builds the app and pushes it to the connected tablet, `R9WN915W5FJ`, via ADB) rather than a bare `gradlew` install, so the JS bundle is rebuilt and synced too, not just the native code.

- [ ] **Step 2: Manual test — happy path**

1. Open a note, open the browser rail, search Google Images for anything.
2. Long-press one of the result thumbnails and drag it onto the note canvas (not releasing until the finger is over the page, not over the browser rail).
3. Release.
4. Expected: the image appears on the page roughly under the drop point, selected, sized to fit (long edge ≤ 1400px, and ≤ 80% of the page width).

- [ ] **Step 3: Manual test — drop outside any page**

1. Repeat the drag, but release over the gray area outside the page (if visible at the current zoom), or over the rail itself.
2. Expected: no crash. The image lands at the current viewport center (the same fallback `insertObject` already uses for toolbar-inserted objects) rather than being lost — since `mapViewportPoint` returns `null` off-page and `insertObject` falls back to `viewportCenterOnPage()`.

- [ ] **Step 4: Manual test — image the server refuses to serve**

1. Find a site that blocks hotlinking (or throttle/disconnect network mid-drag) and drop one of its images.
2. Expected: no crash, nothing is inserted (matches the existing silent-failure convention for undecodable images).

- [ ] **Step 5: Manual test — non-image long-press still works as before**

1. Long-press a link (not an image) and a plain text paragraph in the browser panel.
2. Expected: unchanged from current behavior (whatever WebView already does for text/links — this plan only intercepts `IMAGE_TYPE`/`SRC_IMAGE_ANCHOR_TYPE` hits and returns `false` for everything else, letting the default long-press handling proceed).

- [ ] **Step 6: Note any follow-ups**

If anything above doesn't hold, fix it in the relevant task's file before considering the feature done — this task has no commit of its own, it's a gate on Tasks 1–6.

---

## Notes for the implementer

- Tasks 1–3 (JS) can be built and fully verified with `npx vitest run` alone, no Android toolchain needed — do these first for fast feedback.
- Tasks 4–6 (Android) need the Android SDK/Gradle set up locally to even compile-check; Task 4's test needs no device, Tasks 5–6's `gradlew.bat :app:compileDebugJavaWithJavac` only proves it compiles, not that the gesture works.
- Task 7 needs the physical tablet (or another Android device) connected — the `SidebarBrowser` native WebView path has no emulator-free shortcut, same as every other feature in this plugin.
