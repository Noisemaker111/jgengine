/**
 * Parsers for computed CSS values, as a browser serializes them, into the plain
 * numbers the Rune CSS box takes. Everything here is string in, numbers out,
 * with no DOM: lengths, colours, gradients, shadows, grid tracks, transforms.
 */

/** A length for the wire: points, `"N%"`, or `"auto"`. `null` means it could not be expressed. */
/** Points, `"40%"`, `"auto"`, or a calc: `[points, fraction]` / `[points, fraction, other points, other fraction, mode]` (mode 1 `min()`, 2 `max()`; mode 3 `clamp()`, where the other two are its low and high ends in points). */
export type WireDim = number | string | number[];

const colorCache = new Map<string, number>();

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function pack(r: number, g: number, b: number, a: number): number {
  const byte = (v: number) => Math.round(clamp01(v) * 255);
  return ((byte(r) << 24) | (byte(g) << 16) | (byte(b) << 8) | byte(a)) >>> 0;
}

function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function oklabToSrgb(l: number, a: number, b: number): [number, number, number] {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;
  return [
    linearToSrgb(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S),
    linearToSrgb(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S),
    linearToSrgb(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S),
  ];
}

function numberOrPercent(token: string, percentScale: number): number {
  if (token === "none") return 0;
  return token.endsWith("%") ? (parseFloat(token) / 100) * percentScale : parseFloat(token);
}

/** A computed colour as `0xRRGGBBAA`; `null` when the form is not one a browser computes to. */
export function parseColor(text: string): number | null {
  const cached = colorCache.get(text);
  if (cached !== undefined) return cached;
  const value = parseColorUncached(text.trim());
  if (value !== null && colorCache.size < 4096) colorCache.set(text, value);
  return value;
}

function parseColorUncached(text: string): number | null {
  if (text === "transparent") return 0;
  const open = text.indexOf("(");
  if (open === -1 || !text.endsWith(")")) {
    if (text.startsWith("#")) {
      const h = text.slice(1);
      const full = h.length <= 4 ? [...h].map((c) => c + c).join("") : h;
      const n = Number.parseInt(full.padEnd(8, "f"), 16);
      return Number.isNaN(n) ? null : n >>> 0;
    }
    return null;
  }
  const fn = text.slice(0, open);
  const parts = text.slice(open + 1, -1).replace(/[,/]/g, " ").split(/\s+/).filter((p) => p !== "");
  const alpha = (index: number) => (parts[index] === undefined ? 1 : numberOrPercent(parts[index], 1));
  if (fn === "rgb" || fn === "rgba") {
    if (parts.length < 3) return null;
    return pack(numberOrPercent(parts[0] as string, 255) / 255, numberOrPercent(parts[1] as string, 255) / 255, numberOrPercent(parts[2] as string, 255) / 255, alpha(3));
  }
  if (fn === "color") {
    const space = parts[0];
    if (parts.length < 4) return null;
    const r = numberOrPercent(parts[1] as string, 1);
    const g = numberOrPercent(parts[2] as string, 1);
    const b = numberOrPercent(parts[3] as string, 1);
    if (space === "srgb") return pack(r, g, b, alpha(4));
    if (space === "srgb-linear") return pack(linearToSrgb(r), linearToSrgb(g), linearToSrgb(b), alpha(4));
    return null;
  }
  if (fn === "oklab") {
    if (parts.length < 3) return null;
    const [r, g, b] = oklabToSrgb(numberOrPercent(parts[0] as string, 1), numberOrPercent(parts[1] as string, 0.4), numberOrPercent(parts[2] as string, 0.4));
    return pack(r, g, b, alpha(3));
  }
  if (fn === "oklch") {
    if (parts.length < 3) return null;
    const chroma = numberOrPercent(parts[1] as string, 0.4);
    const hue = (parseFloat(parts[2] as string) * Math.PI) / 180 || 0;
    const [r, g, b] = oklabToSrgb(numberOrPercent(parts[0] as string, 1), chroma * Math.cos(hue), chroma * Math.sin(hue));
    return pack(r, g, b, alpha(3));
  }
  return null;
}

export function colorAlpha(color: number): number {
  return (color & 0xff) / 255;
}

/** Splits on top-level commas (or spaces), leaving anything in parentheses whole. */
export function splitTop(text: string, separator: "," | " "): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c === 40) depth += 1;
    else if (c === 41) depth -= 1;
    else if (depth === 0 && (separator === "," ? c === 44 : c === 32)) {
      if (i > start) out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (start < text.length) {
    const last = text.slice(start).trim();
    if (last !== "") out.push(last);
  }
  return out;
}

/** A computed length: points, a percentage, or `auto`; `null` for a form with no number (calc of mixed units, content keywords). */
export function parseDim(text: string): WireDim | null {
  if (text === "auto" || text === "none" || text === "normal") return "auto";
  if (text.endsWith("px")) {
    const v = parseFloat(text);
    return Number.isNaN(v) ? null : v;
  }
  if (text.endsWith("%")) {
    const v = parseFloat(text);
    return Number.isNaN(v) || text.includes("(") ? null : `${v}%`;
  }
  if (text === "0") return 0;
  const pick = /^(min|max)\((.*)\)$/.exec(text);
  if (pick !== null) {
    const parts = splitTop(pick[2] ?? "", ",").map((part) => parseLengthPercent(part));
    const first = parts[0];
    const other = parts[1];
    if (parts.length !== 2 || first === null || first === undefined || other === null || other === undefined) return null;
    return [first[0], first[1], other[0], other[1], pick[1] === "min" ? 1 : 2];
  }
  // `clamp(low, value, high)` with fixed ends, as written or inside the `calc(0px + ...)` a custom property leaves.
  const clamp = /^calc\(0px \+ clamp\((.*)\)\)$/.exec(text) ?? /^clamp\((.*)\)$/.exec(text);
  if (clamp !== null) {
    const parts = splitTop(clamp[1] ?? "", ",").map((part) => parseLengthPercent(part));
    const [low, value, high] = parts;
    if (parts.length === 3 && low !== null && low !== undefined && value !== null && value !== undefined && high !== null && high !== undefined && low[1] === 0 && high[1] === 0) {
      return [value[0], value[1], low[0], high[0], 3];
    }
    return null;
  }
  if (text.startsWith("calc(")) return parseLengthPercent(text);
  return null;
}

/**
 * A length that mixes points and a share of the box: `[points, fraction]` for `12px`, `40%`,
 * `calc(100% - 10px)` and sums of those; `null` for anything else.
 */
export function parseLengthPercent(text: string): [number, number] | null {
  let body = text.trim();
  if (body.startsWith("calc(") && body.endsWith(")")) body = body.slice(5, -1);
  if (body.includes("(") || body.includes("*") || body.includes("/")) return null;
  let px = 0;
  let fraction = 0;
  let sign = 1;
  for (const token of body.split(/\s+/)) {
    if (token === "+") sign = 1;
    else if (token === "-") sign = -1;
    else {
      const value = parseFloat(token);
      if (Number.isNaN(value)) return null;
      if (token.endsWith("%")) fraction += (sign * value) / 100;
      else if (token.endsWith("px") || value === 0) px += sign * value;
      else return null;
      sign = 1;
    }
  }
  return [px, fraction];
}

/**
 * A `clip-path` polygon or inset as corner points, each `[x points, x fraction, y points, y fraction]`
 * of the box; `null` for a shape with curves (`circle`, `ellipse`, `path`, a rounded inset).
 */
export function parseClipPath(text: string): number[][] | null {
  const shape = /^(polygon|inset)\((.*)\)(?:\s+[a-z-]+)?$/.exec(text.trim());
  if (shape === null) return null;
  const body = shape[2] ?? "";
  if (shape[1] === "inset") {
    if (body.includes("round")) return null;
    const sides = splitTop(body, " ").map(parseLengthPercent);
    if (sides.length === 0 || sides.some((side) => side === null)) return null;
    const top = sides[0] as [number, number];
    const right = (sides[1] ?? top) as [number, number];
    const bottom = (sides[2] ?? top) as [number, number];
    const left = (sides[3] ?? right) as [number, number];
    return [
      [left[0], left[1], top[0], top[1]],
      [-right[0], 1 - right[1], top[0], top[1]],
      [-right[0], 1 - right[1], -bottom[0], 1 - bottom[1]],
      [left[0], left[1], -bottom[0], 1 - bottom[1]],
    ];
  }
  const points: number[][] = [];
  for (const part of splitTop(body, ",")) {
    const trimmed = part.trim();
    if (trimmed === "nonzero" || trimmed === "evenodd") continue;
    const pair = splitTop(trimmed, " ");
    const x = parseLengthPercent(pair[0] ?? "");
    const y = parseLengthPercent(pair[1] ?? "");
    if (pair.length !== 2 || x === null || y === null) return null;
    points.push([x[0], x[1], y[0], y[1]]);
  }
  return points.length >= 3 ? points : null;
}

export function parsePx(text: string): number {
  const v = parseFloat(text);
  return Number.isNaN(v) ? 0 : v;
}

export function parseAngle(text: string): number | null {
  const v = parseFloat(text);
  if (Number.isNaN(v)) return null;
  if (text.endsWith("deg")) return (v * Math.PI) / 180;
  if (text.endsWith("grad")) return (v * Math.PI) / 200;
  if (text.endsWith("turn")) return v * Math.PI * 2;
  if (text.endsWith("rad")) return v;
  return v === 0 ? 0 : null;
}

export interface WireLayer {
  /** 0 linear, 1 radial, 2 conic (`a` is where it starts, stops are fractions of a turn). */
  g: 0 | 1 | 2;
  a?: number;
  cx?: number;
  cy?: number;
  /** Radii as fractions of the box (`rf`) until the box size is known. */
  rx?: number;
  ry?: number;
  rf?: [number, number] | "corner" | "side";
  circle?: boolean;
  st: [number, number][];
  /** A repeating linear gradient: the length of one repeat in points, and where the first starts. */
  per?: number;
  off?: number;
  /** A layer drawn once: its size and where it sits (`placeLayer`). */
  bs?: number[];
  bp?: number[];
}

const SIDE_ANGLES: Record<string, number> = {
  "to top": 0,
  "to right": Math.PI / 2,
  "to bottom": Math.PI,
  "to left": Math.PI * 1.5,
  "to top right": Math.PI / 4,
  "to right top": Math.PI / 4,
  "to bottom right": Math.PI * 0.75,
  "to right bottom": Math.PI * 0.75,
  "to bottom left": Math.PI * 1.25,
  "to left bottom": Math.PI * 1.25,
  "to top left": Math.PI * 1.75,
  "to left top": Math.PI * 1.75,
};

interface RawStop {
  color: number;
  at: number | null;
  px: boolean;
}

function parseStops(parts: string[]): RawStop[] | null {
  const stops: RawStop[] = [];
  for (const part of parts) {
    const tokens = splitTop(part, " ");
    const color = parseColor(tokens[0] ?? "");
    if (color === null) return null;
    if (tokens.length === 1) stops.push({ color, at: null, px: false });
    for (let i = 1; i < tokens.length; i += 1) {
      const token = tokens[i] as string;
      const px = token.endsWith("px");
      const at = px ? parseFloat(token) : token.endsWith("%") ? parseFloat(token) / 100 : Number.NaN;
      if (Number.isNaN(at)) return null;
      stops.push({ color, at, px });
    }
  }
  return stops;
}

function spreadStops(stops: RawStop[]): [number, number][] {
  const n = stops.length;
  const at = stops.map((s) => s.at);
  if (at[0] === null || at[0] === undefined) at[0] = 0;
  if (at[n - 1] === null || at[n - 1] === undefined) at[n - 1] = 1;
  let i = 0;
  while (i < n) {
    if (at[i] !== null) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < n && at[j] === null) j += 1;
    const from = at[i - 1] as number;
    const to = at[j] as number;
    for (let k = i; k < j; k += 1) at[k] = from + ((to - from) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  let floor = 0;
  return stops.map((s, index) => {
    floor = Math.max(floor, at[index] as number);
    return [floor, s.color];
  });
}

function oklabOf(color: number): [number, number, number, number] {
  const linear = (byte: number): number => {
    const value = byte / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  const r = linear((color >>> 24) & 255);
  const g = linear((color >>> 16) & 255);
  const b = linear((color >>> 8) & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s, (color & 255) / 255];
}

function oklabStops(stops: [number, number][]): [number, number][] {
  const result: [number, number][] = [];
  for (let index = 0; index < stops.length; index += 1) {
    const current = stops[index];
    if (current === undefined) continue;
    const previous = stops[index - 1];
    if (previous !== undefined && current[0] > previous[0]) {
      const from = oklabOf(previous[1]);
      const to = oklabOf(current[1]);
      for (let step = 1; step < 16; step += 1) {
        const fraction = step / 16;
        const alpha = from[3] + (to[3] - from[3]) * fraction;
        const mix = (a: number, b: number): number => alpha === 0 ? 0 : (a * from[3] * (1 - fraction) + b * to[3] * fraction) / alpha;
        const [r, g, b] = oklabToSrgb(mix(from[0], to[0]), mix(from[1], to[1]), mix(from[2], to[2]));
        result.push([previous[0] + (current[0] - previous[0]) * fraction, pack(r, g, b, alpha)]);
      }
    }
    result.push(current);
  }
  return result;
}

/** A repeating gradient whose period is a few pixels reads as its average colour. */
function averageOfRepeat(stops: RawStop[]): number | null {
  if (stops.length < 2 || stops.some((s) => s.at === null)) return null;
  const end = stops[stops.length - 1]?.at ?? 0;
  const start = stops[0]?.at ?? 0;
  const period = end - start;
  if (!(period > 0)) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (let i = 1; i < stops.length; i += 1) {
    const p = stops[i - 1] as RawStop;
    const q = stops[i] as RawStop;
    const span = ((q.at as number) - (p.at as number)) / period;
    if (span <= 0) continue;
    for (const c of [p.color, q.color]) {
      const alpha = (c & 0xff) / 255;
      r += (((c >>> 24) & 0xff) / 255) * alpha * span * 0.5;
      g += (((c >>> 16) & 0xff) / 255) * alpha * span * 0.5;
      b += (((c >>> 8) & 0xff) / 255) * alpha * span * 0.5;
      a += alpha * span * 0.5;
    }
  }
  if (a <= 0) return 0;
  return pack(r / a, g / a, b / a, a);
}

/** The colour a gradient averages to: what a small repeated tile of it reads as. */
export function averageOfStops(stops: [number, number][]): number {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  const add = (color: number, share: number): void => {
    const alpha = (color & 0xff) / 255;
    r += (((color >>> 24) & 0xff) / 255) * alpha * share;
    g += (((color >>> 16) & 0xff) / 255) * alpha * share;
    b += (((color >>> 8) & 0xff) / 255) * alpha * share;
    a += alpha * share;
  };
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (first === undefined || last === undefined) return 0;
  add(first[1], Math.max(0, first[0]));
  for (let i = 1; i < stops.length; i += 1) {
    const p = stops[i - 1] as [number, number];
    const q = stops[i] as [number, number];
    const span = Math.min(1, q[0]) - Math.max(0, p[0]);
    if (span <= 0) continue;
    add(p[1], span * 0.5);
    add(q[1], span * 0.5);
  }
  add(last[1], Math.max(0, 1 - last[0]));
  if (a <= 0) return 0;
  return pack(r / a, g / a, b / a, a);
}

/**
 * A background layer with its `background-size`, `background-position` and `background-repeat`
 * applied: unchanged when it covers the box, placed (`bs`, `bp`) when it is one sized piece, and
 * its average colour when it is a small tile repeated across the box.
 */
export function placeLayer<L extends WireLayer | { flat: number }>(layer: L, size: string, position: string, repeat: string): L | { flat: number } | (L & { bs: number[]; bp: number[] }) {
  const sizes = splitTop(size.trim(), " ");
  if (sizes.length === 0 || sizes[0] === "auto" || sizes[0] === "cover" || sizes[0] === "contain" || sizes[0] === "") return layer;
  const w = parseLengthPercent(sizes[0] ?? "");
  const h = sizes[1] === undefined || sizes[1] === "auto" ? ([0, 1] as [number, number]) : parseLengthPercent(sizes[1]);
  if (w === null || h === null) return layer;
  if (w[0] === 0 && w[1] === 1 && h[0] === 0 && h[1] === 1) return layer;
  if (!repeat.includes("no-repeat")) {
    // A tile that still spans the box one way is drawn once; a small one reads as its average.
    if ("flat" in layer) return layer;
    return { flat: averageOfStops(layer.st) };
  }
  const at = splitTop(position.trim(), " ");
  const x = parseLengthPercent(at[0] ?? "0%") ?? [0, 0];
  const y = parseLengthPercent(at[1] ?? "0%") ?? [0, 0];
  return { ...layer, bs: [w[0], w[1], h[0], h[1]], bp: [x[0], x[1], y[0], y[1]] };
}

/** One computed `background-image` layer; `null` when it is not a gradient this painter draws. */
export function parseGradient(text: string): WireLayer | { flat: number } | null {
  const open = text.indexOf("(");
  if (open === -1) return null;
  const fn = text.slice(0, open);
  const args = splitTop(text.slice(open + 1, -1), ",");
  const interpolation = /\bin\s+(\S+)/.exec(args[0] ?? "");
  if (interpolation !== null && interpolation[1] !== "oklab" && interpolation[1] !== "srgb") return null;
  if (interpolation !== null) args[0] = (args[0] ?? "").replace(interpolation[0], "").trim();
  const spread = (stops: RawStop[]): [number, number][] => interpolation?.[1] === "oklab" ? oklabStops(spreadStops(stops)) : spreadStops(stops);
  const repeating = fn.startsWith("repeating-");
  const kind = repeating ? fn.slice(10) : fn;
  if (kind === "linear-gradient") {
    let angle = Math.PI;
    let first = 0;
    const head = args[0] ?? "";
    if (head === "" && interpolation !== null) first = 1;
    else if (head.startsWith("to ")) {
      angle = SIDE_ANGLES[head] ?? Math.PI;
      first = 1;
    } else {
      const parsed = /^-?[\d.]+(deg|rad|grad|turn)$/.test(head) ? parseAngle(head) : null;
      if (parsed !== null) {
        angle = parsed;
        first = 1;
      }
    }
    const stops = parseStops(args.slice(first));
    if (stops === null || stops.length === 0) return null;
    if (repeating) {
      // Stripes wide enough to see are drawn as stripes; finer ones read as their average colour.
      const from = stops[0]?.at ?? null;
      const to = stops[stops.length - 1]?.at ?? null;
      if (from !== null && to !== null && to - from >= 3 && stops.every((s) => s.at === null || s.px)) {
        const period = to - from;
        const scaled = stops.map((s) => ({ ...s, at: s.at === null ? null : (s.at - from) / period, px: false }));
        return { g: 0, a: angle, st: spread(scaled), per: period, off: from };
      }
      const flat = averageOfRepeat(stops);
      return flat === null ? null : { flat };
    }
    if (stops.some((s) => s.px)) return null;
    return { g: 0, a: angle, st: spread(stops) };
  }
  if (kind === "conic-gradient" && !repeating) {
    let from = 0;
    let cx = 0.5;
    let cy = 0.5;
    let first = 0;
    const head = args[0] ?? "";
    if (parseColor(splitTop(head, " ")[0] ?? "") === null) {
      first = 1;
      const [turn = "", position = ""] = head.split("at ");
      if (turn.startsWith("from ")) from = parseAngle(turn.slice(5).trim()) ?? 0;
      const [x, y] = splitTop(position.trim(), " ");
      const fraction = (token: string | undefined, fallback: number): number =>
        token === undefined || token === "" ? fallback : token === "left" || token === "top" ? 0 : token === "right" || token === "bottom" ? 1 : token === "center" ? 0.5 : token.endsWith("%") ? parseFloat(token) / 100 : Number.NaN;
      cx = fraction(x, 0.5);
      cy = fraction(y, x === undefined || x === "" ? 0.5 : cx);
      if (Number.isNaN(cx) || Number.isNaN(cy)) return null;
    }
    // Stops sit at angles; as fractions of the turn they read like any other stop list.
    const parts = args.slice(first).map((part) =>
      splitTop(part, " ")
        .map((token) => (/^-?[\d.]+(deg|rad|grad|turn)$/.test(token) ? `${((parseAngle(token) ?? 0) / (Math.PI * 2)) * 100}%` : token))
        .join(" "),
    );
    const stops = parseStops(parts);
    if (stops === null || stops.length === 0 || stops.some((s) => s.px)) return null;
    return { g: 2, a: from, cx, cy, st: spread(stops) };
  }
  if (kind === "radial-gradient") {
    let cx = 0.5;
    let cy = 0.5;
    let rf: WireLayer["rf"] = "corner";
    let circle = false;
    let first = 0;
    let spotAt: string[] = [];
    const head = args[0] ?? "";
    if (parseColor(splitTop(head, " ")[0] ?? "") === null) {
      first = 1;
      const [shape = "", position = ""] = head.split(" at ");
      spotAt = splitTop(position.trim(), " ");
      const sizes = shape.trim().split(/\s+/).filter((p) => p !== "");
      circle = sizes.includes("circle");
      const lengths = sizes.filter((p) => p.endsWith("%") || p.endsWith("px"));
      if (lengths.length === 2 && lengths.every((p) => p.endsWith("%"))) rf = [parseFloat(lengths[0] as string) / 100, parseFloat(lengths[1] as string) / 100];
      else if (sizes.includes("closest-side") || sizes.includes("farthest-side")) rf = "side";
      else if (lengths.length > 0) return null;
      const at = position.trim().split(/\s+/).filter((p) => p !== "");
      const axis = (token: string | undefined, fallback: number) =>
        token === undefined ? fallback : token === "center" ? 0.5 : token === "left" || token === "top" ? 0 : token === "right" || token === "bottom" ? 1 : token.endsWith("%") ? parseFloat(token) / 100 : fallback;
      cx = axis(at[0], 0.5);
      cy = axis(at[1], 0.5);
    }
    const stops = parseStops(args.slice(first));
    if (stops === null || stops.length === 0) return null;
    if (repeating) {
      const flat = averageOfRepeat(stops);
      return flat === null ? null : { flat };
    }
    if (stops.some((s) => s.px)) {
      // A spot: a circle a few points across that ends in clear (a rivet, a dot, a lamp). It is
      // drawn once on a square just large enough to hold it, placed where the gradient is centred.
      const reach = stops[stops.length - 1];
      const radius = reach?.at ?? 0;
      if (!circle || reach === undefined || !reach.px || !(radius > 0) || colorAlpha(reach.color) !== 0) return null;
      if (stops.some((s) => s.at !== null && !s.px && s.at !== 0)) return null;
      const keyword = (token: string): string => (token === "left" || token === "top" ? "0%" : token === "right" || token === "bottom" ? "100%" : token === "center" ? "50%" : token);
      const x = parseLengthPercent(keyword(spotAt[0] ?? "50%"));
      const y = parseLengthPercent(keyword(spotAt[1] ?? "50%"));
      if (x === null || y === null) return null;
      const scaled = stops.map((s) => ({ ...s, at: s.at === null ? null : s.at / radius, px: false }));
      const side = radius * 2;
      return {
        g: 1,
        cx: 0.5,
        cy: 0.5,
        circle: true,
        rx: radius,
        ry: radius,
        st: spread(scaled),
        bs: [side, 0, side, 0],
        bp: [x[0] - radius + x[1] * side, x[1], y[0] - radius + y[1] * side, y[1]],
      };
    }
    return { g: 1, cx, cy, rf, circle, st: spread(stops) };
  }
  return null;
}

export type WireShadow = [[number, number, number, number, number], number];

/** Computed `box-shadow`: `rgb(..) x y blur spread [inset], ...`. */
export function parseShadows(text: string): WireShadow[] {
  if (text === "none" || text === "") return [];
  const out: WireShadow[] = [];
  for (const part of splitTop(text, ",")) {
    const tokens = splitTop(part, " ");
    let color: number | null = null;
    let inset = 0;
    const lengths: number[] = [];
    for (const token of tokens) {
      if (token === "inset") inset = 1;
      else if (/^-?[\d.]/.test(token)) lengths.push(parseFloat(token));
      else color = parseColor(token);
    }
    if (color === null || colorAlpha(color) === 0) continue;
    out.push([[lengths[0] ?? 0, lengths[1] ?? 0, lengths[2] ?? 0, lengths[3] ?? 0, inset], color]);
  }
  return out;
}

export type WireTextShadow = [number, number, number, number];

export function parseTextShadows(text: string): WireTextShadow[] {
  if (text === "none" || text === "") return [];
  const out: WireTextShadow[] = [];
  for (const part of splitTop(text, ",")) {
    let color: number | null = null;
    const lengths: number[] = [];
    for (const token of splitTop(part, " ")) {
      if (/^-?[\d.]/.test(token)) lengths.push(parseFloat(token));
      else color = parseColor(token);
    }
    if (color === null || colorAlpha(color) === 0) continue;
    out.push([lengths[0] ?? 0, lengths[1] ?? 0, lengths[2] ?? 0, color]);
  }
  return out;
}

export type WireTrack = [number, number, number, number];

function trackSide(token: string): [number, number] | null {
  if (token === "auto") return [0, 0];
  if (token === "min-content") return [4, 0];
  if (token === "max-content") return [5, 0];
  if (token.endsWith("fr")) return [3, parseFloat(token)];
  if (token.endsWith("px")) return [1, parseFloat(token)];
  if (token.endsWith("%")) return [2, parseFloat(token)];
  if (token === "0") return [1, 0];
  return null;
}

function oneTrack(token: string): WireTrack | null {
  if (token.startsWith("minmax(")) {
    const [min = "", max = ""] = splitTop(token.slice(7, -1), ",");
    const a = trackSide(min);
    const b = trackSide(max);
    if (a === null || b === null) return null;
    // A flexible minimum is not a thing; CSS treats `minmax(1fr, x)` as auto.
    return [a[0] === 3 ? 0 : a[0], a[1], b[0], b[1]];
  }
  if (token.startsWith("fit-content(")) return [0, 0, 5, 0];
  const side = trackSide(token);
  if (side === null) return null;
  // `1fr` is `minmax(auto, 1fr)`; a length is both its minimum and its maximum.
  return side[0] === 3 ? [0, 0, 3, side[1]] : [side[0], side[1], side[0], side[1]];
}

/** Computed `grid-template-columns`/`rows` or `grid-auto-*`; `null` when a track is not expressible. */
export function parseTracks(text: string): WireTrack[] | null {
  if (text === "none" || text === "" || text === "auto") return [];
  const out: WireTrack[] = [];
  for (const token of splitTop(text, " ")) {
    if (token.startsWith("[")) continue;
    if (token.startsWith("repeat(")) {
      const [count = "", ...rest] = splitTop(token.slice(7, -1), ",");
      const auto = count.trim() === "auto-fill" ? 10 : count.trim() === "auto-fit" ? 20 : 0;
      const n = auto === 0 ? Number.parseInt(count, 10) : 1;
      if (Number.isNaN(n)) return null;
      const inner = parseTracks(rest.join(" "));
      if (inner === null) return null;
      // As many as fit: the layout engine counts them, told by 10 (`auto-fill`) or 20 (`auto-fit`) added to the kind.
      if (auto !== 0) for (const track of inner) track[0] += auto;
      for (let i = 0; i < n; i += 1) out.push(...inner);
      continue;
    }
    const track = oneTrack(token);
    if (track === null) return null;
    out.push(track);
  }
  return out;
}

/** `grid-column-start`/`-end` pair as `[start kind, start, end kind, end]`. */
export function parsePlacement(start: string, end: string): [number, number, number, number] | null {
  const one = (text: string): [number, number] => {
    if (text === "auto") return [0, 0];
    if (text.startsWith("span")) return [2, Number.parseInt(text.slice(4), 10) || 1];
    const n = Number.parseInt(text, 10);
    return Number.isNaN(n) ? [0, 0] : [1, n];
  };
  const a = one(start);
  const b = one(end);
  return a[0] === 0 && b[0] === 0 ? null : [a[0], a[1], b[0], b[1]];
}

export interface WireTransform {
  /** Translate in points. */
  x: number;
  y: number;
  /** Translate as a fraction of the element's own size. */
  fx: number;
  fy: number;
  rotate: number;
  scale: number;
  /** Horizontal skew as the tangent of its angle: the box is drawn as a parallelogram. */
  skew: number;
  /** A part that could not be expressed (vertical skew, 3D, non-uniform scale). */
  lost: string | null;
}

function addTranslate(out: WireTransform, token: string | undefined, axis: "x" | "y"): void {
  if (token === undefined) return;
  if (token.endsWith("%")) {
    if (axis === "x") out.fx += parseFloat(token) / 100;
    else out.fy += parseFloat(token) / 100;
  } else if (axis === "x") out.x += parsePx(token);
  else out.y += parsePx(token);
}

/** The computed `translate`, `rotate`, `scale` and `transform` of one element, combined. */
export function parseTransform(translate: string, rotate: string, scale: string, transform: string): WireTransform | null {
  if ((translate === "none" || translate === "") && (rotate === "none" || rotate === "") && (scale === "none" || scale === "") && (transform === "none" || transform === "")) return null;
  const out: WireTransform = { x: 0, y: 0, fx: 0, fy: 0, rotate: 0, scale: 1, skew: 0, lost: null };
  if (translate !== "none" && translate !== "") {
    const [x, y] = splitTop(translate, " ");
    addTranslate(out, x, "x");
    addTranslate(out, y, "y");
  }
  if (rotate !== "none" && rotate !== "") out.rotate += parseAngle(rotate) ?? 0;
  if (scale !== "none" && scale !== "") {
    const [sx = "1", sy = sx] = splitTop(scale, " ");
    if (parseFloat(sx) !== parseFloat(sy)) out.lost = `scale: ${scale}`;
    out.scale *= parseFloat(sx) || 1;
  }
  if (transform !== "none" && transform !== "") {
    for (const part of splitTop(transform, " ")) {
      const open = part.indexOf("(");
      const fn = part.slice(0, open);
      const args = splitTop(part.slice(open + 1, -1), ",");
      if (fn === "translate") {
        addTranslate(out, args[0], "x");
        addTranslate(out, args[1], "y");
      } else if (fn === "translateX") addTranslate(out, args[0], "x");
      else if (fn === "translateY") addTranslate(out, args[0], "y");
      else if (fn === "translate3d") {
        addTranslate(out, args[0], "x");
        addTranslate(out, args[1], "y");
      } else if (fn === "translateZ") continue;
      else if (fn === "rotate" || fn === "rotateZ") out.rotate += parseAngle(args[0] ?? "") ?? 0;
      else if (fn === "scale") {
        const sx = parseFloat(args[0] ?? "1");
        const sy = parseFloat(args[1] ?? args[0] ?? "1");
        if (sx !== sy) out.lost = part;
        out.scale *= sx;
      } else if (fn === "skewX" || (fn === "skew" && (args.length === 1 || parseAngle(args[1] ?? "") === 0))) {
        out.skew += Math.tan(parseAngle(args[0] ?? "") ?? 0);
      } else if (fn === "matrix" && Math.abs(parseFloat(args[0] ?? "1") - 1) < 0.001 && Math.abs(parseFloat(args[1] ?? "0")) < 0.001 && Math.abs(parseFloat(args[3] ?? "1") - 1) < 0.001 && Math.abs(parseFloat(args[2] ?? "0")) > 0.001) {
        out.skew += parseFloat(args[2] ?? "0");
        out.x += parseFloat(args[4] ?? "0");
        out.y += parseFloat(args[5] ?? "0");
      } else if (fn === "matrix") {
        const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = args.map(parseFloat);
        const sx = Math.hypot(a, b);
        const sy = Math.hypot(c, d);
        if (Math.abs(sx - sy) > 0.001 || Math.abs(a * c + b * d) > 0.001) out.lost = part;
        out.scale *= sx;
        out.rotate += Math.atan2(b, a);
        out.x += e;
        out.y += f;
      } else if ((/^rotate[XYZ]$|^rotate3d$/.test(fn) && parseFloat(args[args.length - 1] ?? "0") === 0) || (/^scale[XYZ]$/.test(fn) && parseFloat(args[0] ?? "1") === 1)) {
        // A turn of nothing or a scale of one changes nothing.
      } else out.lost = part;
    }
  }
  return out;
}

const ALIGN: Record<string, number> = {
  start: 1,
  "flex-start": 1,
  "self-start": 1,
  left: 1,
  end: 2,
  "flex-end": 2,
  "self-end": 2,
  right: 2,
  center: 3,
  stretch: 4,
  baseline: 5,
  "first baseline": 5,
  "last baseline": 5,
  "space-between": 6,
  "space-around": 7,
  "space-evenly": 8,
};

/** An alignment keyword as the wire's small integer; 0 is the property's own default. */
export function parseAlign(text: string): number {
  return ALIGN[text.replace(/^(safe|unsafe) /, "")] ?? 0;
}

/** A corner radius: `"12px"`, `"12px 20px"` (elliptical, averaged) or a percentage (as large as fits). */
export function parseRadius(text: string): number {
  const [a = "0", b = a] = text.split(" ");
  const one = (token: string) => (token.endsWith("%") ? (parseFloat(token) >= 50 ? 9999 : -parseFloat(token) / 100) : parsePx(token));
  const x = one(a);
  const y = one(b);
  return x === y ? x : x >= 9999 || y >= 9999 ? Math.min(x, y) : (x + y) / 2;
}
