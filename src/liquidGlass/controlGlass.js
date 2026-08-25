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
