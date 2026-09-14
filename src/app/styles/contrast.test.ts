import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Fill colour at pixel (16,16) of each Kenney tile used as a text background (sampled once with Pillow:
// Image.open(tile).getpixel((16, 16))). Update this table if a tile role changes in tokens.css.
const FILLS = {
  panelLight: '#fff1d2', // tile_0000, also cards (0013)
  panelDark: '#647685', // tile_0003, also dark cards (0016) and the transparent dark secondary button (0008)
  greyBlue: '#94afc6', // tile_0002 (inputs, toasts, light secondary / dark primary buttons), badges (0033/0034), danger (0069)
  brown: '#a3703a', // tile_0001 (light primary button)
  ribbon: '#e2665b', // tile_0044
};
const DARK_ERROR_BACKDROP_ALPHA = 0.45; // rgba(0,0,0,0.45) behind dark-theme error text (base.css)

function tokens(css: string, block: 'light' | 'dark'): Record<string, string> {
  const start = block === 'light' ? css.indexOf(':root {') : css.indexOf(":root[data-theme='dark'] {");
  const end = css.indexOf('}', start);
  const out: Record<string, string> = {};
  for (const [, name, value] of css.slice(start, end).matchAll(/--([a-z-]+): (#[0-9a-f]{6});/g)) out[name] = value;
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function darken(hex: string, alpha: number): string {
  const c = [1, 3, 5].map((i) => Math.round(Number.parseInt(hex.slice(i, i + 2), 16) * (1 - alpha)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// The app Vitest project sets css: false, so read the stylesheet from disk (cwd is the repo root under Vitest).
const css = readFileSync(resolve(process.cwd(), 'src/app/styles/tokens.css'), 'utf-8');
const light = tokens(css, 'light');
const dark = { ...light, ...tokens(css, 'dark') };

// WCAG 2.1 AA: 4.5:1 for text, 3:1 for large text, UI components and focus indicators.
describe('theme contrast (tokens.css against the Kenney tile fills)', () => {
  it.each([
    ['fg', light.fg, FILLS.panelLight, 4.5],
    ['muted', light.muted, FILLS.panelLight, 4.5],
    ['accent (error text)', light.accent, FILLS.panelLight, 4.5],
    ['focus ring', light.focus, FILLS.panelLight, 3],
    ['cell X mark', light['cell-x'], FILLS.panelLight, 3],
    ['cell O mark', light['cell-o'], FILLS.panelLight, 3],
    ['input text', light['input-fg'], FILLS.greyBlue, 4.5],
    ['toast text', light['toast-fg'], FILLS.greyBlue, 4.5],
    ['badge text', light['badge-fg'], FILLS.greyBlue, 3],
    ['secondary button text', light['btn-secondary-fg'], FILLS.greyBlue, 4.5],
    ['primary button text', light['btn-primary-fg'], FILLS.brown, 3],
    ['ribbon text', light['ribbon-fg'], FILLS.ribbon, 3],
  ])('light: %s', (_name, color, fill, min) => {
    expect(contrast(color, fill)).toBeGreaterThanOrEqual(min);
  });

  it.each([
    ['fg', dark.fg, FILLS.panelDark, 4.5],
    ['muted', dark.muted, FILLS.panelDark, 4.5],
    ['accent (error text on its backdrop)', dark.accent, darken(FILLS.panelDark, DARK_ERROR_BACKDROP_ALPHA), 4.5],
    ['focus ring', dark.focus, FILLS.panelDark, 3],
    ['cell X mark', dark['cell-x'], FILLS.panelDark, 3],
    ['cell O mark', dark['cell-o'], FILLS.panelDark, 3],
    ['toast text', dark['toast-fg'], FILLS.panelDark, 4.5],
    ['secondary button text', dark['btn-secondary-fg'], FILLS.panelDark, 4.5],
    ['primary button text', dark['btn-primary-fg'], FILLS.greyBlue, 4.5],
  ])('dark: %s', (_name, color, fill, min) => {
    expect(contrast(color, fill)).toBeGreaterThanOrEqual(min);
  });
});
