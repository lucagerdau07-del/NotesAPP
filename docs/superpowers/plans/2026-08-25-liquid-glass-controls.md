# Liquid Glass Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simulated CSS surface on exactly five Library controls with real `@ybouane/liquidglass` WebGL refraction while preserving behavior and a safe fallback.

**Architecture:** A single Library scene root owns one LiquidGlass instance. A dedicated scene child supplies the capturable reeded background, while the five enhanced controls are direct children of the root as required by the library; a focused hook owns initialization, failure state, and teardown.

**Tech Stack:** React 19, Vite 8, Vitest 4, Testing Library, `@ybouane/liquidglass` 1.0.3, WebGL 1, CSS progressive enhancement

**Spec:** `docs/superpowers/specs/2026-08-25-liquid-glass-controls-design.md`

## Global Constraints

- Enhance exactly the navigation rail, Ask AI pill, reset circle, view/sort pill, and agent circle.
- Do not enhance New Note, subject cards, note cards, the agent panel, editor UI, or settings UI.
- Use one LiquidGlass instance and one WebGL context.
- Keep all five enhanced elements as direct children of the LiquidGlass root.
- Keep the existing CSS glass treatment as the pre-init and error fallback.
- Do not enable floating or drag behavior.
- Preserve keyboard behavior, accessible labels, focus visibility, pointer targets, and existing interactions.
- Do not mark broad content wrappers `data-dynamic`.
- The verified rollback archive is `backups/pre-liquidglass-web-20260825-182044.zip`.

---

### Task 1: Add a lifecycle-safe LiquidGlass adapter

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/liquidGlass/controlGlass.js`
- Create: `src/hooks/useLiquidGlass.js`
- Create: `tests/useLiquidGlass.test.jsx`

**Interfaces:**
- Consumes: `LiquidGlass.init({ root, glassElements, defaults })` from `@ybouane/liquidglass`.
- Produces: `CONTROL_GLASS_SELECTOR`, `collectControlGlassElements(root)`, `CONTROL_GLASS_DEFAULTS`, and `useLiquidGlass(rootRef, invalidateKey)`.
- Root state contract: `data-liquid-glass-state="loading|enhanced|fallback"`.

- [ ] **Step 1: Install the exact dependency**

Run: `npm install @ybouane/liquidglass@1.0.3`

Expected: `package.json` and `package-lock.json` record version `1.0.3`; no unrelated dependency changes.

- [ ] **Step 2: Write failing selection and lifecycle tests**

Create `tests/useLiquidGlass.test.jsx` with a hoisted `LiquidGlass.init` mock and a small harness:

```jsx
import React, { useRef } from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { init } = vi.hoisted(() => ({ init: vi.fn() }))
vi.mock('@ybouane/liquidglass', () => ({ LiquidGlass: { init } }))

import { collectControlGlassElements } from '../src/liquidGlass/controlGlass'
import useLiquidGlass from '../src/hooks/useLiquidGlass'

function Harness({ invalidateKey = 'all' }) {
  const rootRef = useRef(null)
  useLiquidGlass(rootRef, invalidateKey)
  return (
    <div ref={rootRef} data-testid="root">
      {Array.from({ length: 5 }, (_, index) => (
        <button key={index} data-liquid-glass-control={`control-${index}`} />
      ))}
      <button data-testid="plain" />
    </div>
  )
}

describe('LiquidGlass control adapter', () => {
  beforeEach(() => init.mockReset())

  it('collects only direct marked controls', () => {
    const root = document.createElement('div')
    root.innerHTML = '<button data-liquid-glass-control="one"></button><div><button data-liquid-glass-control="nested"></button></div>'
    expect(collectControlGlassElements(root)).toHaveLength(1)
  })

  it('initializes one instance for five controls and destroys it on unmount', async () => {
    const destroy = vi.fn(), markChanged = vi.fn()
    init.mockResolvedValue({ destroy, markChanged })
    const view = render(<Harness />)
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1))
    expect(init.mock.calls[0][0].glassElements).toHaveLength(5)
    expect(view.getByTestId('root')).toHaveAttribute('data-liquid-glass-state', 'enhanced')
    view.unmount()
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('invalidates without reinitializing when the captured theme changes', async () => {
    const instance = { destroy: vi.fn(), markChanged: vi.fn() }
    init.mockResolvedValue(instance)
    const view = render(<Harness invalidateKey="all" />)
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1))
    view.rerender(<Harness invalidateKey="mathe" />)
    expect(init).toHaveBeenCalledTimes(1)
    expect(instance.markChanged).toHaveBeenCalled()
  })

  it('keeps fallback state when initialization rejects', async () => {
    init.mockRejectedValue(new Error('WebGL unavailable'))
    const view = render(<Harness />)
    await waitFor(() => expect(view.getByTestId('root')).toHaveAttribute('data-liquid-glass-state', 'fallback'))
  })

  it('destroys an instance that resolves after unmount', async () => {
    let resolveInit
    const destroy = vi.fn()
    init.mockReturnValue(new Promise(resolve => { resolveInit = resolve }))
    const view = render(<Harness />)
    view.unmount()
    await act(async () => resolveInit({ destroy, markChanged: vi.fn() }))
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: Run the new test and verify RED**

Run: `npm test -- --reporter=dot tests/useLiquidGlass.test.jsx`

Expected: FAIL because `controlGlass.js` and `useLiquidGlass.js` do not exist.

- [ ] **Step 4: Implement the selector and restrained defaults**

Create `src/liquidGlass/controlGlass.js`:

```js
export const CONTROL_GLASS_SELECTOR = ':scope > [data-liquid-glass-control]'

export const CONTROL_GLASS_DEFAULTS = Object.freeze({
  blurAmount: 0.22,
  refraction: 0.58,
  chromAberration: 0.018,
  edgeHighlight: 0.12,
  specular: 0.08,
  fresnel: 0.72,
  distortion: 0.015,
  opacity: 0.96,
  saturation: -0.08,
  tintStrength: 0.08,
  shadowOpacity: 0.34,
  shadowSpread: 12,
  shadowOffsetY: 2,
  floating: false,
})

export function collectControlGlassElements(root) {
  if (!root) return []
  return Array.from(root.querySelectorAll(CONTROL_GLASS_SELECTOR))
}
```

- [ ] **Step 5: Implement safe asynchronous initialization and cleanup**

Create `src/hooks/useLiquidGlass.js`:

```js
import { useEffect, useRef } from 'react'
import { LiquidGlass } from '@ybouane/liquidglass'
import { collectControlGlassElements, CONTROL_GLASS_DEFAULTS } from '../liquidGlass/controlGlass'

export default function useLiquidGlass(rootRef, invalidateKey) {
  const instanceRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    let cancelled = false
    let instance = null
    root.dataset.liquidGlassState = 'loading'

    const start = async () => {
      try {
        await document.fonts?.ready
        const glassElements = collectControlGlassElements(root)
        if (glassElements.length !== 5) throw new Error(`Expected 5 Liquid Glass controls, found ${glassElements.length}`)
        const created = await LiquidGlass.init({ root, glassElements, defaults: CONTROL_GLASS_DEFAULTS })
        if (cancelled) {
          created.destroy()
          return
        }
        instance = created
        instanceRef.current = created
        root.dataset.liquidGlassState = 'enhanced'
      } catch (error) {
        if (!cancelled) {
          root.dataset.liquidGlassState = 'fallback'
          if (import.meta.env.DEV) console.warn('[liquid-glass] Falling back to CSS glass.', error)
        }
      }
    }

    start()
    return () => {
      cancelled = true
      instanceRef.current = null
      instance?.destroy()
    }
  }, [rootRef])

  useEffect(() => {
    instanceRef.current?.markChanged()
  }, [invalidateKey])
}
```

- [ ] **Step 6: Run adapter tests and verify GREEN**

Run: `npm test -- --reporter=dot tests/useLiquidGlass.test.jsx`

Expected: 5 tests pass with no unhandled rejection.

- [ ] **Step 7: Commit the adapter**

```bash
git add package.json package-lock.json src/liquidGlass/controlGlass.js src/hooks/useLiquidGlass.js tests/useLiquidGlass.test.jsx
git commit -m "feat: add liquid glass lifecycle adapter"
```

---

### Task 2: Restructure the Library scene around exactly five controls

**Files:**
- Modify: `src/components/Library.jsx`
- Modify: `tests/App.test.jsx`

**Interfaces:**
- Consumes: `useLiquidGlass(rootRef, invalidateKey)` from Task 1.
- Produces: one root with `data-testid="liquid-glass-root"`, one `liquid-glass-scene` child, and five direct children marked with unique `data-liquid-glass-control` values.

- [ ] **Step 1: Write a failing Library structure test**

Mock the external library at the top of `tests/App.test.jsx`, then add:

```jsx
vi.mock('@ybouane/liquidglass', () => ({
  LiquidGlass: { init: vi.fn(() => Promise.resolve({ destroy: vi.fn() })) },
}))

it('marks exactly five direct Library controls for WebGL glass', () => {
  render(<App />)
  const root = screen.getByTestId('liquid-glass-root')
  const controls = root.querySelectorAll(':scope > [data-liquid-glass-control]')
  expect([...controls].map(node => node.dataset.liquidGlassControl)).toEqual([
    'navigation', 'search', 'reset', 'view-sort', 'agent',
  ])
  expect(screen.getByTestId('new-note-btn')).not.toHaveAttribute('data-liquid-glass-control')
})
```

- [ ] **Step 2: Run the structure test and verify RED**

Run: `npm test -- --reporter=dot tests/App.test.jsx`

Expected: FAIL because the root and markers do not exist.

- [ ] **Step 3: Introduce the scene root and hook**

In `Library.jsx`, retain its existing `useRef` import and add `useLiquidGlass`. Create `const liquidGlassRootRef = useRef(null)`, call `useLiquidGlass(liquidGlassRootRef, selectedSubject?.id || 'all')`, and attach the ref plus `data-testid="liquid-glass-root"` to the outer Library element. Add `<div className="liquid-glass-scene" aria-hidden="true" />` as its first child and keep the ambient lighting overlay as a direct non-glass sibling. The selected-subject key triggers `markChanged()` without recreating the WebGL instance.

- [ ] **Step 4: Make only the five targets direct children**

Preserve the existing children, callbacks, labels, and test IDs while adding these exact attributes and classes to the existing element nodes:

| Element | Added class | `data-liquid-glass-control` | `data-config` value |
| --- | --- | --- | --- |
| Navigation rail | `liquid-control liquid-control-navigation` | `navigation` | `JSON.stringify({ cornerRadius: 30, zRadius: 24 })` |
| Ask AI pill | `liquid-control liquid-control-search` | `search` | `JSON.stringify({ cornerRadius: 26, zRadius: 24 })` |
| Reset button | `liquid-control liquid-control-reset` | `reset` | `JSON.stringify({ cornerRadius: 26, zRadius: 26, button: true })` |
| View/sort pill | `liquid-control liquid-control-view-sort` | `view-sort` | `JSON.stringify({ cornerRadius: 26, zRadius: 24 })` |
| Agent button | `liquid-control liquid-control-agent` | `agent` | `JSON.stringify({ cornerRadius: 26, zRadius: 26, button: true })` |

Remove the two positioning wrappers that currently nest search/reset and view-sort/New Note. Keep New Note as an unmarked direct sibling with `data-testid="new-note-btn"`. Keep the closed-state agent button mounted as the marked element; hide it accessibly while the agent panel is open instead of conditionally unmounting it, so the LiquidGlass instance retains exactly five elements.

- [ ] **Step 5: Run existing Library interaction and structure tests**

Run: `npm test -- --reporter=dot tests/App.test.jsx`

Expected: all App tests pass, including subject selection, view switching, agent open/close, New Note, and the new exact-five assertion.

- [ ] **Step 6: Commit the structural integration**

```bash
git add src/components/Library.jsx tests/App.test.jsx
git commit -m "feat: wire library controls to liquid glass root"
```

---

### Task 3: Replace the five CSS surfaces with WebGL-enhanced styling

**Files:**
- Modify: `src/styles/main.css`
- Modify: `tests/backgroundStyle.test.js`

**Interfaces:**
- Consumes: root state `data-liquid-glass-state` and five `data-liquid-glass-control` attributes.
- Produces: capturable `.liquid-glass-scene`, stable absolute layout classes, fallback surfaces, and enhanced-state surface removal.

- [ ] **Step 1: Extend the CSS contract test and verify RED**

Add assertions to `tests/backgroundStyle.test.js`:

```js
expect(mainCss).toContain('.liquid-glass-scene')
expect(mainCss).toContain('[data-liquid-glass-state="enhanced"] > [data-liquid-glass-control]')
expect(mainCss).toContain('background: transparent')
expect(mainCss).toContain('@media (prefers-reduced-motion: reduce)')
```

Run: `npm test -- --reporter=dot tests/backgroundStyle.test.js`

Expected: FAIL because enhanced-state and scene rules do not exist.

- [ ] **Step 2: Add the capturable scene and stable positioning**

Add CSS that duplicates the current global reeded background and blue overlays inside `.liquid-glass-scene`, positioned at `inset: 0; z-index: 0; pointer-events: none`. Add explicit absolute-position classes for navigation, search, reset, view-sort, New Note, and agent controls. Use `data-agent-open` or a root CSS variable to preserve the existing right-side shift without nesting controls.

- [ ] **Step 3: Preserve fallback and remove it only after enhancement**

Keep existing `.lib-glass`, `.liquid-glass-pill`, and `.liquid-glass-circle` backgrounds for `loading` and `fallback`. Add an enhanced selector:

```css
[data-liquid-glass-state="enhanced"] > [data-liquid-glass-control] {
  background: transparent !important;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border-color: transparent;
  box-shadow: none;
}

[data-liquid-glass-state="enhanced"] > [data-liquid-glass-control] > canvas:first-child {
  pointer-events: none;
}
```

Keep focus-visible outlines and selected inner button states above the injected canvas. Under reduced motion, disable nonessential transform and transition animation on the five controls.

- [ ] **Step 4: Run CSS and App tests**

Run: `npm test -- --reporter=dot tests/backgroundStyle.test.js tests/App.test.jsx tests/useLiquidGlass.test.jsx`

Expected: all targeted tests pass.

- [ ] **Step 5: Commit presentation and fallback behavior**

```bash
git add src/styles/main.css tests/backgroundStyle.test.js
git commit -m "style: render library controls with webgl glass"
```

---

### Task 4: Browser acceptance, performance check, and final verification

**Files:**
- Modify only if a verified defect is found: `src/components/Library.jsx`, `src/hooks/useLiquidGlass.js`, `src/liquidGlass/controlGlass.js`, `src/styles/main.css`, and their matching tests.

**Interfaces:**
- Consumes: the completed LiquidGlass integration.
- Produces: evidence that the five controls are enhanced, all other surfaces are excluded, and fallback remains usable.

- [ ] **Step 1: Run the full automated suite**

Run: `npm test -- --reporter=dot`

Expected: all test files pass with zero failures.

- [ ] **Step 2: Build the production bundle**

Run: `npm run build`

Expected: Vite exits 0 and emits the LiquidGlass dependency without unresolved imports.

- [ ] **Step 3: Verify WebGL enhancement in the in-app browser**

At `http://localhost:5173/`, reload and confirm:

- root state becomes `enhanced`;
- exactly five direct marked controls exist;
- each marked control contains the library-injected canvas;
- New Note, subject cards, note cards, and agent panel contain no LiquidGlass canvas;
- the reeded background visibly refracts through the five controls;
- search, reset, view/sort, sidebar settings, and agent open/close still work;
- resizing does not duplicate canvases or create additional instances;
- no console errors or repeated fallback warnings appear.

- [ ] **Step 4: Verify graceful fallback**

Temporarily mock or block `LiquidGlass.init` in the automated harness and confirm `data-liquid-glass-state="fallback"`, visible CSS surfaces, and working controls. Do not ship any manual failure switch.

- [ ] **Step 5: Inspect runtime cost**

During an idle Library screen, read the single instance's exposed FPS and confirm that no broad wrapper is marked `data-dynamic`. Interact with all five controls and resize once; reject the implementation if interaction becomes visibly delayed or if more than one WebGL context is created.

- [ ] **Step 6: Review the final diff and commit verified fixes**

Run: `git diff --check` and `git diff -- src/components/Library.jsx src/hooks/useLiquidGlass.js src/liquidGlass/controlGlass.js src/styles/main.css tests package.json package-lock.json`

Expected: no whitespace errors, no unrelated file changes, and no enhancement markers outside the five approved controls.

If Task 4 required a verified correction, stage only the complete allowed source and test path set; unchanged paths are harmless and Git omits them:

```bash
git add src/components/Library.jsx src/hooks/useLiquidGlass.js src/liquidGlass/controlGlass.js src/styles/main.css tests/App.test.jsx tests/useLiquidGlass.test.jsx tests/backgroundStyle.test.js
git commit -m "fix: harden liquid glass control enhancement"
```

If no correction was needed, do not create an empty commit.
