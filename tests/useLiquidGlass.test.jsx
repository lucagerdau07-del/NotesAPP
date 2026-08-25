import React, { useRef } from 'react'
import '@testing-library/jest-dom'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  beforeEach(() => {
    init.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

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
    init.mockImplementation(async () => { throw new Error('WebGL unavailable') })
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
