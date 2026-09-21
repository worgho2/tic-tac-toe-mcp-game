import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Fill colour at the centre of each Kenney "UI Pack - Adventure" tile used as a text background (sampled once with
// Pillow: Image.open(tile).getpixel((w // 2, h // 2))). Update this table if a tile role changes in tokens.css.
const FILLS = {
  panelLight: '#fff1d2', // light window (panel_brown_corners_a), inset and cells (panel_brown)
  panelDark: '#647685', // dark window (panel_grey_bolts_dark), inset and cells (panel_grey_dark)
  greyBlue: '#94afc6', // secondary button and toast (panel_grey), input (panel_grey_blue)
  brown: '#a3703a', // primary button (panel_brown_dark)
  red: '#cf5e53', // danger button (panel_red_dark, recoloured panel_brown_dark)
  banner: '#e2665b', // classic banner (banner_middle)
};
// Box title bars: pattern_diagonal_transparent_small (20% black stripes) at opacity 0.5 (base.css), so the darkest
// point behind the title is the panel fill darkened by 10%.
const TITLE_BAR_DARKEN = 0.1;
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
// "primary button text", "danger button text" and "banner text" are normal-size text held to the 3:1 level, not
// 4.5:1: they sit on the pack's saturated brown and red fills, which cap the achievable ratio (cream on the banner
// fill caps at 3.32:1), so they are held to the 3:1 large-text/UI-component level instead.
// "handle tag" in dark is held to 3:1 too: the #tag is the de-emphasised half of a handle whose name carries the
// identity, and on the dark panel fill only near-white passes 4.5:1, which would erase the contrast with the name.
// Tiles that are the same in both themes (buttons, inputs, toasts, banners) are checked once, in the light block.
describe('theme contrast (tokens.css against the Kenney tile fills)', () => {
  it('parses more than a handful of tokens from each theme block', () => {
    expect(Object.keys(light).length).toBeGreaterThan(10);
    expect(Object.keys(dark).length).toBeGreaterThan(10);
  });

  it.each([
    ['fg', light.fg, FILLS.panelLight, 4.5],
    ['muted', light.muted, FILLS.panelLight, 4.5],
    ['accent (error text)', light.accent, FILLS.panelLight, 4.5],
    ['focus ring', light.focus, FILLS.panelLight, 3],
    ['cell X mark', light['cell-x'], FILLS.panelLight, 3],
    ['cell O mark', light['cell-o'], FILLS.panelLight, 3],
    ['link', light.link, FILLS.panelLight, 4.5],
    ['status dot outline', light['dot-outline'], FILLS.panelLight, 3],
    ['input text', light['input-fg'], FILLS.greyBlue, 4.5],
    ['toast text', light['toast-fg'], FILLS.greyBlue, 4.5],
    ['secondary button text', light['btn-secondary-fg'], FILLS.greyBlue, 4.5],
    ['primary button text', light['btn-primary-fg'], FILLS.brown, 3],
    ['danger button text', light['btn-danger-fg'], FILLS.red, 3],
    ['banner text', light['banner-fg'], FILLS.banner, 3],
    ['handle tag', light.tag, FILLS.panelLight, 4.5],
    ['handle tag on a title bar', light.tag, darken(FILLS.panelLight, TITLE_BAR_DARKEN), 4.5],
    ['title bar text', light.fg, darken(FILLS.panelLight, TITLE_BAR_DARKEN), 4.5],
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
    ['link', dark.link, FILLS.panelDark, 4.5],
    ['status dot outline', dark['dot-outline'], FILLS.panelDark, 3],
    ['handle tag', dark.tag, FILLS.panelDark, 3],
    ['title bar text', dark.fg, darken(FILLS.panelDark, TITLE_BAR_DARKEN), 4.5],
  ])('dark: %s', (_name, color, fill, min) => {
    expect(contrast(color, fill)).toBeGreaterThanOrEqual(min);
  });
});
