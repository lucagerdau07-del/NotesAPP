export const PAGE_FORMATS = {
  'a4-portrait': { width: 800, height: 800 * 1.414 },
  'a4-landscape': { width: 800 * 1.414, height: 800 },
  square: { width: 900, height: 900 },
};

export const BACKGROUND_PRESETS = [
  {
    id: 'dark',
    label: 'Dunkel',
    css: 'linear-gradient(170deg, rgba(26,26,31,0.97) 0%, rgba(14,14,18,0.98) 40%, rgba(7,7,10,0.99) 100%)',
    linesRgb: '255,255,255',
    inkColor: '#EFECE4',
  },
  { id: 'white', label: 'Weiß', css: '#FFFFFF', linesRgb: '0,0,0', inkColor: '#1A1A1A', lineOpacity: 0.16, gridOpacity: 0.14 },
  { id: 'beige', label: 'Beige', css: '#EFECE4', linesRgb: '0,0,0', inkColor: '#1A1A1A' },
  { id: 'gray', label: 'Grau', css: '#3A3A3E', linesRgb: '255,255,255', inkColor: '#EFECE4' },
];

export const RULING_PRESETS = ['blank', 'lined', 'grid', 'dotted'];

const DEFAULT_FORMAT = 'a4-portrait';
const DEFAULT_BACKGROUND = 'dark';
const DEFAULT_RULING = 'lined';

export function resolvePageStyle(options = {}) {
  const { pageKind, format, background, ruling } = options || {};

  if (pageKind === 'whiteboard') {
    const backgroundPreset =
      BACKGROUND_PRESETS.find((preset) => preset.id === background) ||
      BACKGROUND_PRESETS.find((preset) => preset.id === DEFAULT_BACKGROUND);
    return {
      kind: 'whiteboard',
      background: backgroundPreset.css,
      inkColor: backgroundPreset.inkColor,
    };
  }

  const formatPreset = PAGE_FORMATS[format] || PAGE_FORMATS[DEFAULT_FORMAT];
  const backgroundPreset =
    BACKGROUND_PRESETS.find((preset) => preset.id === background) ||
    BACKGROUND_PRESETS.find((preset) => preset.id === DEFAULT_BACKGROUND);
  const resolvedRuling = RULING_PRESETS.includes(ruling) ? ruling : DEFAULT_RULING;

  return {
    kind: 'page',
    width: formatPreset.width,
    height: formatPreset.height,
    background: backgroundPreset.css,
    ruling: resolvedRuling,
    linesRgb: backgroundPreset.linesRgb,
    lineOpacity: backgroundPreset.lineOpacity ?? 0.07,
    gridOpacity: backgroundPreset.gridOpacity ?? 0.065,
    inkColor: backgroundPreset.inkColor,
  };
}

export function isLightBackground(background, kind) {
  if (kind === 'imported') return true;
  if (!background) return false;
  const bgStr = String(background).trim().toLowerCase();
  if (bgStr === 'white' || bgStr === 'beige' || bgStr === '#fff' || bgStr === '#ffffff') return true;
  if (bgStr === 'dark' || bgStr === 'gray' || bgStr === '#000' || bgStr === '#000000') return false;

  const hexMatch = bgStr.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    const val = parseInt(hex, 16);
    const r = (val >> 16) & 255;
    const g = (val >> 8) & 255;
    const b = val & 255;
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    return lum > 140;
  }

  const channels = [...bgStr.matchAll(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/gi)];
  if (channels.length > 0) {
    const avg = channels.reduce(
      (acc, [, r, g, b]) => acc + Number(r) * 0.299 + Number(g) * 0.587 + Number(b) * 0.114,
      0,
    ) / channels.length;
    return avg > 140;
  }

  return false;
}
