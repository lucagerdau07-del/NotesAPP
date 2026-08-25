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
})
