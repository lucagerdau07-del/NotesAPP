# Image Background Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to remove the background of images in notes with a single tap on the image toolbar using client-side AI (`@imgly/background-removal`), fully running locally on-device.

**Architecture:** A standalone background removal utility (`src/ink/imageBackground.js`) wraps `@imgly/background-removal`, providing image preprocessing (resizing to max 1024px for mobile efficiency), conversion between data URLs / blobs, and caching. The floating toolbar in `src/components/document/PageObjectLayer.jsx` renders a magic wand action button (`Wand2` / `Undo2`) with loading spinner (`Loader2`) when an image object is selected. `src/components/DocumentView.jsx` coordinates the background removal async operation, updates the page object in the note document via `inkController.updateObject`, stores `originalSrc` for full undo/revert capability, and displays error toast notifications if needed.

**Tech Stack:** React 19, `@imgly/background-removal`, `onnxruntime-web`, `lucide-react`, Vitest, Vite.

## Global Constraints
- Runs 100% client-side / local on-device without external API keys or server backends.
- Retains original image source in `originalSrc` to allow one-click restoration.
- Mobile/tablet friendly: non-blocking async execution, loading indicator on button and image, proper error handling.
- After every change or fix, commit changes to git ("git savestate").

---

### Task 1: Install `@imgly/background-removal` and peer dependencies

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `@imgly/background-removal` and `onnxruntime-web` npm packages installed in `node_modules`.

- [ ] **Step 1: Install packages via npm**

Run command:
```powershell
npm install @imgly/background-removal onnxruntime-web
```

- [ ] **Step 2: Verify installation in package.json**

Inspect `package.json` to verify dependencies contain `@imgly/background-removal`.

- [ ] **Step 3: Commit**

```powershell
git add package.json package-lock.json; git commit -m "chore: add @imgly/background-removal dependency"
```

---

### Task 2: Implement Image Background Removal Service (`src/ink/imageBackground.js`)

**Files:**
- Create: `src/ink/imageBackground.js`
- Test: `tests/ink/imageBackground.test.js`

**Interfaces:**
- Produces:
  - `removeImageBackground(imageSource: string | Blob): Promise<string>`: takes an image data URL or blob, scales if needed, runs background removal, and returns a PNG data URL.
  - `blobToDataUrl(blob: Blob): Promise<string>`: helper to convert a Blob to base64 data URL.

- [ ] **Step 1: Write the failing unit tests for `imageBackground.js`**

Create `tests/ink/imageBackground.test.js`:
```javascript
import { describe, it, expect, vi } from "vitest";
import { blobToDataUrl, removeImageBackground } from "../../src/ink/imageBackground.js";

vi.mock("@imgly/background-removal", () => ({
  removeBackground: vi.fn(async (input) => {
    return new Blob(["fake-png-data"], { type: "image/png" });
  }),
}));

describe("imageBackground", () => {
  it("converts a blob to data URL", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const dataUrl = await blobToDataUrl(blob);
    expect(dataUrl).toMatch(/^data:text\/plain;base64,/);
  });

  it("calls removeBackground and returns a png data URL", async () => {
    const fakeDataUrl = "data:image/jpeg;base64,1234";
    const result = await removeImageBackground(fakeDataUrl);
    expect(result).toMatch(/^data:image\/png;base64,/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ink/imageBackground.test.js`
Expected: FAIL (Cannot find module `../../src/ink/imageBackground.js`)

- [ ] **Step 3: Implement `src/ink/imageBackground.js`**

Create `src/ink/imageBackground.js`:
```javascript
import { removeBackground } from "@imgly/background-removal";

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Removes background from an image using client-side AI.
 * @param {string | Blob} imageSource - Data URL or Blob of the image.
 * @param {object} [options] - Optional configuration overrides.
 * @returns {Promise<string>} Transparent PNG data URL.
 */
export async function removeImageBackground(imageSource, options = {}) {
  const config = {
    model: "small",
    output: {
      format: "image/png",
      quality: 0.9,
    },
    ...options,
  };

  const outputBlob = await removeBackground(imageSource, config);
  return await blobToDataUrl(outputBlob);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ink/imageBackground.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add src/ink/imageBackground.js tests/ink/imageBackground.test.js; git commit -m "feat(ink): implement imageBackground service with unit tests"
```

---

### Task 3: Add Magic Wand & Restore Background Toolbar to `PageObjectLayer.jsx`

**Files:**
- Modify: `src/components/document/PageObjectLayer.jsx`
- Test: `tests/components/PageObjectLayerBackground.test.jsx`

**Interfaces:**
- Consumes:
  - `onRemoveBackground?(object: object): void`
  - `onRestoreBackground?(object: object): void`
  - `processingObjectId?: string | null`
- Produces:
  - Magic wand icon button (`Wand2`) rendered in the floating toolbar when an image is selected.
  - Undo icon button (`Undo2`) when the image already has `originalSrc`.
  - Loading spinner (`Loader2` with `spin` animation) displayed when `processingObjectId === object.id`.

- [ ] **Step 1: Write test for `PageObjectLayer` background action button**

Create `tests/components/PageObjectLayerBackground.test.jsx`:
```javascript
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PageObjectLayer from "../../src/components/document/PageObjectLayer.jsx";

describe("PageObjectLayer image background toolbar", () => {
  const mockImageObject = {
    id: "img-1",
    pageId: "page-1",
    type: "image",
    src: "data:image/png;base64,aaa",
    x: 50,
    y: 50,
    width: 200,
    height: 150,
  };

  const pageLayout = {
    pageWidth: 800,
    pageHeight: 1100,
    zoom: 1,
  };

  it("renders 'Hintergrund entfernen' button when an image is selected", () => {
    const onRemoveBackground = vi.fn();
    render(
      <PageObjectLayer
        objects={[mockImageObject]}
        selectedId="img-1"
        pageLayout={pageLayout}
        onRemoveBackground={onRemoveBackground}
      />
    );

    const wandBtn = screen.getByTitle("Hintergrund entfernen");
    expect(wandBtn).toBeInTheDocument();
    fireEvent.click(wandBtn);
    expect(onRemoveBackground).toHaveBeenCalledWith(mockImageObject);
  });

  it("renders 'Original wiederherstellen' button when image has originalSrc", () => {
    const onRestoreBackground = vi.fn();
    const objectWithOriginal = { ...mockImageObject, originalSrc: "data:image/jpeg;base64,bbb" };
    render(
      <PageObjectLayer
        objects={[objectWithOriginal]}
        selectedId="img-1"
        pageLayout={pageLayout}
        onRestoreBackground={onRestoreBackground}
      />
    );

    const restoreBtn = screen.getByTitle("Original wiederherstellen");
    expect(restoreBtn).toBeInTheDocument();
    fireEvent.click(restoreBtn);
    expect(onRestoreBackground).toHaveBeenCalledWith(objectWithOriginal);
  });

  it("displays loading spinner and disables button when processing", () => {
    render(
      <PageObjectLayer
        objects={[mockImageObject]}
        selectedId="img-1"
        pageLayout={pageLayout}
        processingObjectId="img-1"
      />
    );

    const wandBtn = screen.getByTitle("Hintergrund wird entfernt...");
    expect(wandBtn).toBeInTheDocument();
    expect(wandBtn).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/PageObjectLayerBackground.test.jsx`
Expected: FAIL (button with title "Hintergrund entfernen" not found)

- [ ] **Step 3: Modify `src/components/document/PageObjectLayer.jsx`**

Import `Wand2`, `Undo2`, `Loader2` from `lucide-react`.
Add `onRemoveBackground`, `onRestoreBackground`, and `processingObjectId` to component props.
In the floating toolbar (lines ~480-505), add:
```jsx
{object.type === "image" && (
  object.originalSrc ? (
    <IconButton
      label="Original wiederherstellen"
      onClick={() => onRestoreBackground?.(object)}
      disabled={processingObjectId === object.id}
    >
      <Undo2 size={14} />
    </IconButton>
  ) : (
    <IconButton
      label={processingObjectId === object.id ? "Hintergrund wird entfernt..." : "Hintergrund entfernen"}
      onClick={() => onRemoveBackground?.(object)}
      disabled={processingObjectId === object.id}
    >
      {processingObjectId === object.id ? (
        <Loader2 size={14} className="spin" />
      ) : (
        <Wand2 size={14} />
      )}
    </IconButton>
  )
)}
```
Add opacity/pulse style to the image if `processingObjectId === object.id`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/PageObjectLayerBackground.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add src/components/document/PageObjectLayer.jsx tests/components/PageObjectLayerBackground.test.jsx; git commit -m "feat(document): add background removal and restore buttons to PageObjectLayer toolbar"
```

---

### Task 4: Integrate Background Removal & Restore in `DocumentView.jsx`

**Files:**
- Modify: `src/components/DocumentView.jsx`

**Interfaces:**
- Consumes: `removeImageBackground` from `../ink/imageBackground`
- Connects:
  - `processingObjectId` state
  - `handleRemoveBackground(object)`
  - `handleRestoreBackground(object)`
  - Passes handlers down to `PageObjectLayer` instances.

- [ ] **Step 1: Wire up state and handlers in `DocumentView.jsx`**

1. Import `removeImageBackground` from `../ink/imageBackground`.
2. Add `const [processingImageId, setProcessingImageId] = useState(null);`
3. Implement `handleRemoveBackground`:
```javascript
const handleRemoveBackground = async (object) => {
  if (!object || !object.src || processingImageId === object.id) return;
  setProcessingImageId(object.id);
  try {
    const transparentDataUrl = await removeImageBackground(object.src);
    inkController?.updateObject?.(object.id, {
      src: transparentDataUrl,
      originalSrc: object.originalSrc || object.src,
    });
  } catch (error) {
    console.error("Failed to remove background:", error);
    // Optional toast or notification if available
  } finally {
    setProcessingImageId(null);
  }
};

const handleRestoreBackground = (object) => {
  if (!object || !object.originalSrc) return;
  inkController?.updateObject?.(object.id, {
    src: object.originalSrc,
    originalSrc: null,
  });
};
```
4. Pass `processingObjectId={processingImageId}`, `onRemoveBackground={handleRemoveBackground}`, and `onRestoreBackground={handleRestoreBackground}` to `<PageObjectLayer>` in `DocumentView.jsx`.

- [ ] **Step 2: Run all tests to verify integration**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```powershell
git add src/components/DocumentView.jsx; git commit -m "feat(document): connect background removal actions to inkController in DocumentView"
```

---

### Task 5: End-to-End Verification & Walkthrough

- [ ] **Step 1: Build test**

Run: `npm run build`
Expected: Clean Vite production build without syntax or bundling errors.

- [ ] **Step 2: Run complete test suite**

Run: `npm test`
Expected: All test suites pass.

- [ ] **Step 3: Create Walkthrough documentation**

Document results and usage in `walkthrough.md`.

- [ ] **Step 4: Final commit**

```powershell
git status; git commit -m "chore: complete image background removal integration"
```
