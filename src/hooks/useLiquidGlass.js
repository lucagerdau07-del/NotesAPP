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
