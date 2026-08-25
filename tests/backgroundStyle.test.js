import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mainCss = readFileSync('src/styles/main.css', 'utf8')

describe('global app background', () => {
  it('adds the reference blue as a restrained tint over the glass texture', () => {
    expect(mainCss).toContain('rgba(138, 212, 255, 0.18)')
    expect(mainCss).toContain('rgba(138, 212, 255, 0.08)')
  })
})

describe('liquid glass control surfaces', () => {
  it('defines a capturable scene backdrop and enhanced-state canvas takeover', () => {
    expect(mainCss).toContain('.liquid-glass-scene')
    expect(mainCss).toContain('[data-liquid-glass-state="enhanced"] > [data-liquid-glass-control]')
    expect(mainCss).toContain('background: transparent')
    expect(mainCss).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('resets the .lib-glass !important fallback chrome with matching !important overrides', () => {
    const enhancedBlock = mainCss.match(
      /\[data-liquid-glass-state="enhanced"\] > \[data-liquid-glass-control\] \{[^}]*\}/
    )[0]
    expect(enhancedBlock).toMatch(/backdrop-filter:\s*none\s*!important/)
    expect(enhancedBlock).toMatch(/-webkit-backdrop-filter:\s*none\s*!important/)
    expect(enhancedBlock).toMatch(/border-color:\s*transparent\s*!important/)
    expect(enhancedBlock).toMatch(/box-shadow:\s*none\s*!important/)
  })

  it('gives enhanced controls a visible focus ring since the flattened border/shadow no longer show one', () => {
    expect(mainCss).toContain('[data-liquid-glass-state="enhanced"] > [data-liquid-glass-control]:focus-within')
  })

  it('matches any direct canvas child, not just the first one', () => {
    expect(mainCss).not.toContain('> canvas:first-child')
  })
})
