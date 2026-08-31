import React, { useRef } from 'react'
import '@testing-library/jest-dom'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { init, prewarm, prepareScene, checkSizes, captureContent, FakeLiquidGlass } = vi.hoisted(() => {
  const init = vi.fn()
  const prewarm = vi.fn()
  const prepareScene = vi.fn()
  const checkSizes = vi.fn()
  const captureContent = vi.fn()
  class FakeLiquidGlass {}
  FakeLiquidGlass.init = init
  FakeLiquidGlass.prototype._prewarmStaticCaptures = prewarm
  FakeLiquidGlass.prototype._prepareSceneCanvas = prepareScene
  FakeLiquidGlass.prototype._checkGlassSizeChanges = checkSizes
  FakeLiquidGlass.prototype._captureGlassContent = captureContent
  return { init, prewarm, prepareScene, checkSizes, captureContent, FakeLiquidGlass }
})
vi.mock('@ybouane/liquidglass', () => ({ LiquidGlass: FakeLiquidGlass }))

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
  const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts')

  beforeEach(() => {
    init.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve() },
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts)
    else delete document.fonts
  })

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
    expect(markChanged).toHaveBeenCalledTimes(1)
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

  it('neutralizes the library static-capture prewarm that blocks first glass paint', async () => {
    init.mockResolvedValue({ destroy: vi.fn(), markChanged: vi.fn() })
    render(<Harness />)
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1))
    const patched = FakeLiquidGlass.prototype._prewarmStaticCaptures
    expect(patched).not.toBe(prewarm)
    await patched()
    expect(prewarm).not.toHaveBeenCalled()
  })

  it('repaints the scene base in the page background so an unfilled scene is not white', async () => {
    document.body.style.backgroundColor = 'rgb(8, 8, 10)'
    init.mockResolvedValue({ destroy: vi.fn(), markChanged: vi.fn() })
    render(<Harness />)
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1))

    const patched = FakeLiquidGlass.prototype._prepareSceneCanvas
    expect(patched).not.toBe(prepareScene)

    const sceneCtx = { fillStyle: '', fillRect: vi.fn() }
    patched.call({ _sceneCtx: sceneCtx }, 120, 80)

    expect(prepareScene).toHaveBeenCalledWith(120, 80)
    expect(sceneCtx.fillStyle).toBe('rgb(8, 8, 10)')
    expect(sceneCtx.fillRect).toHaveBeenCalledWith(0, 0, 120, 80)
  })

  it('repaints a resized control and postpones its content re-capture', async () => {
    captureContent.mockClear()
    init.mockResolvedValue({ destroy: vi.fn(), markChanged: vi.fn() })
    render(<Harness />)
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1))

    const patchedCheck = FakeLiquidGlass.prototype._checkGlassSizeChanges
    const patchedCapture = FakeLiquidGlass.prototype._captureGlassContent
    const rail = document.createElement('div')
    const instance = { _glassContentDirty: new Set(), _globalDirty: false }

    // Mid-transition. Resizing a control's canvas clears it, so the frame that
    // resized it has to be marked dirty or the panel is left blank; and the
    // content re-capture is postponed, staying queued for a later frame.
    checkSizes.mockReturnValue(true)
    patchedCheck.call(instance)
    expect(instance._globalDirty).toBe(true)
    await patchedCapture.call(instance, new Set([rail]))
    expect(captureContent).not.toHaveBeenCalled()
    expect(instance._glassContentDirty.has(rail)).toBe(true)

    // Transition finished: no forced repaint, and the queued capture runs.
    instance._globalDirty = false
    checkSizes.mockReturnValue(false)
    patchedCheck.call(instance)
    expect(instance._globalDirty).toBe(false)
    await patchedCapture.call(instance, new Set([rail]))
    expect(captureContent).toHaveBeenCalledTimes(1)

    // The init/resize pass over every control is never postponed.
    checkSizes.mockReturnValue(true)
    patchedCheck.call(instance)
    await patchedCapture.call(instance)
    expect(captureContent).toHaveBeenCalledTimes(2)
  })

  it('holds the CSS glass fallback until the scene capture pipeline goes idle', async () => {
    // One capture lands, a second starts a few frames later: the old
    // quiet-timer readiness flipped in that gap and showed the empty scene.
    const inFlight = new Set(['first'])
    const capture = { _capturing: inFlight, cache: new Map() }
    init.mockResolvedValue({ destroy: vi.fn(), markChanged: vi.fn(), capture })
    const view = render(<Harness />)
    const root = view.getByTestId('root')

    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)) })
    expect(root).toHaveAttribute('data-liquid-glass-state', 'loading')

    await act(async () => {
      inFlight.clear()
      capture.cache.set('a', 1)
      await new Promise(resolve => setTimeout(resolve, 30))
      inFlight.add('second')
      await new Promise(resolve => setTimeout(resolve, 60))
    })
    expect(root).toHaveAttribute('data-liquid-glass-state', 'loading')

    await act(async () => { inFlight.clear() })
    await waitFor(() =>
      expect(root).toHaveAttribute('data-liquid-glass-state', 'enhanced'),
    )
  })

  it('stops waiting when no capture is ever queued', async () => {
    const capture = { _capturing: new Set(), cache: new Map() }
    init.mockResolvedValue({ destroy: vi.fn(), markChanged: vi.fn(), capture })
    const view = render(<Harness />)
    await waitFor(
      () => expect(view.getByTestId('root')).toHaveAttribute('data-liquid-glass-state', 'enhanced'),
      { timeout: 4000 },
    )
  })

  it('keeps fallback state when initialization rejects', async () => {
    init.mockImplementation(async () => { throw new Error('WebGL unavailable') })
    const view = render(<Harness />)
    await waitFor(() => expect(view.getByTestId('root')).toHaveAttribute('data-liquid-glass-state', 'fallback'))
  })

  it('destroys an instance that resolves after unmount', async () => {
    let resolveInit
    const destroy = vi.fn()
    init.mockReturnValue(new Promise(resolve => { resolveInit = resolve }))
    const view = render(<Harness />)
    await waitFor(() => expect(init).toHaveBeenCalledTimes(1))
    view.unmount()
    await act(async () => resolveInit({ destroy, markChanged: vi.fn() }))
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('does not initialize when unmounted while fonts are still loading', async () => {
    let resolveFonts
    const previousFonts = Object.getOwnPropertyDescriptor(document, 'fonts')
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: new Promise(resolve => { resolveFonts = resolve }) },
    })
    try {
      const view = render(<Harness />)
      view.unmount()
      await act(async () => resolveFonts())
      expect(init).not.toHaveBeenCalled()
    } finally {
      if (previousFonts) Object.defineProperty(document, 'fonts', previousFonts)
      else delete document.fonts
    }
  })
})
