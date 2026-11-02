// Palette contract: palette.roles = { accent, accentText, bg, bgNav, text, textMuted, line }.
const kebab = (k) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

// Perceived brightness of a #rgb / #rrggbb colour, 0..255. Non-hex input counts as light.
function brightness(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return 255;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Starlight `head` entry that defines the --palette-* tokens on :root. */
export function paletteHead(palette) {
  const roles = palette?.roles;
  if (!roles) throw new Error('paletteHead: palette.roles is missing');
  const decls = Object.entries(roles).map(([k, v]) => `--palette-${kebab(k)}:${v}`);
  decls.push(`color-scheme:${brightness(roles.bg) < 128 ? 'dark' : 'light'}`);
  return { tag: 'style', content: `:root{${decls.join(';')}}` };
}

/** Swatches for <PaletteSwatches>: palette.swatches when present, else the roles. */
export function paletteSwatches(palette) {
  return { ...(palette?.swatches ?? palette?.roles ?? {}) };
}
