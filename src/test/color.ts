// What a browser makes of the colours of src/app.css, for the contrast test (src/lib/contrast.test.ts): its tokens read
// from the stylesheet, `var()` put in, then hex, rgb(a), named colours, oklch, `oklch(from … l c h / a)` and
// `color-mix(in oklch, …)` (premultiplied, the shorter hue) resolved as CSS Color 4 says, out-of-gamut colours clipped to
// sRGB as Chromium draws them, and layers composited in sRGB to 8 bits, as a canvas does.

/** A colour: sRGB components from 0 to 1, and its alpha. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface Lch {
  l: number;
  c: number;
  /** None for an achromatic colour: its hue is powerless. */
  h: number | null;
  a: number;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clip = (c: number) => Math.min(1, Math.max(0, c));

function toLch({ r, g, b, a }: Rgba): Lch {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B);
  // Chromium takes the hue of a colour this grey as powerless when it mixes it (#1b1c20: none; #101420: its own).
  return { l: L, c, h: c < 0.02 ? null : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360, a };
}

function fromLch({ l: L, c, h, a }: Lch): Rgba {
  const hr = ((h ?? 0) * Math.PI) / 180;
  const [A, B] = [c * Math.cos(hr), c * Math.sin(hr)];
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return { r: clip(toGamma(r)), g: clip(toGamma(g)), b: clip(toGamma(b)), a };
}

/** Splits `s` at its top-level commas (or spaces), leaving what is inside brackets whole. */
function split(s: string, by: ',' | ' '): string[] {
  const out: string[] = [];
  let depth = 0;
  let at = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && (by === ',' ? ch === ',' : /\s/.test(ch))) {
      out.push(s.slice(at, i));
      at = i + 1;
    }
  }
  out.push(s.slice(at));
  return out.map((x) => x.trim()).filter(Boolean);
}

const NAMED: Record<string, Rgba> = {
  white: { r: 1, g: 1, b: 1, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
};

const num = (s: string, scale = 1) => (s.endsWith('%') ? (parseFloat(s) / 100) * scale : parseFloat(s));

/** Puts the values of the tokens in for each `var(--x)` (its fallback when it has none). */
export function substitute(css: string, tokens: Record<string, string>, depth = 0): string {
  if (depth > 20) throw new Error(`var() loop in ${css}`);
  const at = css.indexOf('var(');
  if (at < 0) return css;
  let depthB = 0;
  let end = at + 4;
  for (; end < css.length; end++) {
    if (css[end] === '(') depthB++;
    else if (css[end] === ')') {
      if (depthB === 0) break;
      depthB--;
    }
  }
  const [name, fallback] = split(css.slice(at + 4, end), ',');
  const value = tokens[name] ?? fallback;
  if (value === undefined) throw new Error(`no token ${name}`);
  return substitute(css.slice(0, at) + substitute(value, tokens, depth + 1) + css.slice(end + 1), tokens, depth + 1);
}

/** A colour of CSS, its `var()` already put in. */
export function parse(css: string): Rgba {
  return read(css).rgb;
}

/** A colour, and its oklch as written when it was (its hue kept, however grey). */
function read(css: string): { rgb: Rgba; lch?: Lch } {
  const s = css.trim();
  if (NAMED[s]) return { rgb: NAMED[s] };
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    const full = hex.length <= 4 ? [...hex].map((x) => x + x).join('') : hex;
    const [r, g, b, a = 255] = full.match(/../g)!.map((x) => parseInt(x, 16));
    return { rgb: { r: r / 255, g: g / 255, b: b / 255, a: a / 255 } };
  }
  const fn = s.match(/^([a-z-]+)\((.*)\)$/s);
  if (!fn) throw new Error(`not a colour: ${s}`);
  const [, name, body] = fn;
  if (name === 'rgb' || name === 'rgba') {
    const [r, g, b, a = '1'] = body.includes(',') ? split(body, ',') : split(body.replace('/', ' '), ' ');
    return { rgb: { r: num(r, 255) / 255, g: num(g, 255) / 255, b: num(b, 255) / 255, a: num(a) } };
  }
  if (name === 'oklch') {
    const [main, alpha] = split(body, ' ').join(' ').split('/');
    const parts = split(main, ' ');
    if (parts[0] === 'from') {
      // `oklch(from <colour> l c h / a)`: the colour, another alpha.
      const from = read(parts[1]);
      const base = from.lch ?? toLch(from.rgb);
      const lch = { ...base, a: alpha === undefined ? base.a : num(alpha.trim()) };
      return { rgb: fromLch(lch), lch };
    }
    const [l, c, h] = parts;
    const lch = { l: num(l), c: num(c, 0.4), h: parseFloat(h), a: alpha === undefined ? 1 : num(alpha.trim()) };
    return { rgb: fromLch(lch), lch };
  }
  if (name === 'color-mix') {
    const [space, ...colours] = split(body, ',');
    if (space !== 'in oklch') throw new Error(`color-mix ${space}`);
    const mixed = colours.map((c) => {
      const parts = split(c, ' ');
      const pct = parts.length > 1 && parts.at(-1)!.endsWith('%') ? parseFloat(parts.pop()!) / 100 : null;
      const c2 = read(parts.join(' '));
      return { lch: c2.lch ?? toLch(c2.rgb), pct };
    });
    const [x, y] = mixed;
    const px = x.pct ?? (y.pct === null ? 0.5 : 1 - y.pct);
    const py = y.pct ?? 1 - px;
    const lch = mix(x.lch, y.lch, px / (px + py));
    return { rgb: fromLch(lch), lch };
  }
  throw new Error(`colour function ${name}`);
}

/** CSS Color 4's interpolation in oklch: premultiplied by alpha, the shorter way round the hue. */
function mix(x: Lch, y: Lch, p: number): Lch {
  const a = x.a * p + y.a * (1 - p);
  if (a === 0) return { l: 0, c: 0, h: null, a: 0 };
  const pre = (u: number, v: number) => (u * x.a * p + v * y.a * (1 - p)) / a;
  let h: number | null;
  if (x.h === null || y.h === null) h = x.h ?? y.h;
  else {
    let d = y.h - x.h;
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    h = (x.h + d * (1 - p) + 360) % 360;
  }
  return { l: pre(x.l, y.l), c: pre(x.c, y.c), h, a };
}

const byte = (c: number) => Math.round(clip(c) * 255);

/** Layers painted one over the other, the first on black, in sRGB to 8 bits, as a canvas does: the colour seen. */
export function paint(layers: Rgba[]): [number, number, number] {
  let out = [0, 0, 0];
  for (const l of layers) out = [l.r, l.g, l.b].map((c, i) => byte(c * l.a + (out[i] / 255) * (1 - l.a)));
  return out as [number, number, number];
}

/** WCAG's contrast ratio of two colours seen. */
export function ratio(x: [number, number, number], y: [number, number, number]): number {
  const lum = (c: [number, number, number]) => {
    const [r, g, b] = c.map((v) => toLinear(v / 255));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(x), lum(y)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
}

/** The custom properties a rule of `css` declares, by its selector (`:root`, `:root[data-theme='light']`). */
export function tokensOf(css: string, selector: string): Record<string, string> {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no rule ${selector}`);
  const open = css.indexOf('{', at);
  const body = css.slice(open + 1, css.indexOf('}', open));
  const out: Record<string, string> = {};
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g))
    out[m[1]] = m[2].replace(/\s+/g, ' ').trim();
  return out;
}
