// Top-down SVG drawing for `bun run gen-audit`: street nets, city districts and race laps on one
// contact sheet, annotated with what the metrics measure (corner radius/angle, gates, grid, seals,
// sectors, speed, elevation, building height). Plain SVG strings; scripts/gen-audit.ts rasterizes them.
import type { CircuitAnalysis, DetectedCorner } from "../packages/core/src/roads/circuitMetrics";
import type { PlanPoint } from "../packages/core/src/roads/streetMetrics";

export const LEVEL_COLOR: Record<string, string> = { boulevard: "#c0392b", avenue: "#e67e22", street: "#6c7a89", lane: "#b9a37a" };
const CORNER_COLOR: Record<DetectedCorner["kind"], string> = {
  hairpin: "#c0392b",
  "right-angle": "#e67e22",
  tight: "#d35400",
  medium: "#d4ac0d",
  sweeper: "#27ae60",
  kink: "#3498db",
};
const CLASS_COLOR: Record<string, string> = {
  tower: "#2c3e50",
  slab: "#8e44ad",
  shop: "#e74c3c",
  rowhouse: "#d35400",
  house: "#f1c40f",
  mansion: "#16a085",
  farmhouse: "#a0522d",
  barn: "#7b241c",
  silo: "#95a5a6",
};
const BLOCK_FILL: Record<string, string> = { buildable: "#ece6da", park: "#a9d18e", plaza: "#d9c9a3", field: "#d4e09b", buffer: "#c8e0b4" };

/** Viridis-like ramp, t in 0..1. */
export function ramp(t: number): string {
  const stops = [
    [68, 1, 84],
    [59, 82, 139],
    [33, 145, 140],
    [94, 201, 98],
    [253, 231, 37],
  ];
  const x = Math.max(0, Math.min(0.9999, Number.isFinite(t) ? t : 0)) * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  return `rgb(${a.map((v, k) => Math.round(v + (b[k]! - v) * f)).join(",")})`;
}

export function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Pixels above a panel's map for its caption, and below it for its key. */
export const PANEL_HEADER = 48;
export const PANEL_FOOTER = 30;

/**
 * One square map panel mapping a world XZ window onto SVG pixels (x right, z down). The map is clipped
 * to its square; the caption sits in a strip above it and the colour key in a strip below.
 */
export class Panel {
  readonly parts: string[] = [];
  readonly chrome: string[] = [];
  constructor(
    readonly x0: number,
    readonly y0: number,
    readonly size: number,
    readonly minX: number,
    readonly minZ: number,
    readonly span: number,
  ) {}
  get scale(): number {
    return this.size / this.span;
  }
  X(x: number): number {
    return this.x0 + (x - this.minX) * this.scale;
  }
  Y(z: number): number {
    return this.y0 + (z - this.minZ) * this.scale;
  }
  private pts(points: readonly PlanPoint[]): string {
    return points.map((p) => `${this.X(p[0]).toFixed(1)},${this.Y(p[1]).toFixed(1)}`).join(" ");
  }
  /** A polyline `widthM` metres wide (never thinner than 0.5 px). */
  line(points: readonly PlanPoint[], color: string, widthM: number, extra = ""): void {
    if (points.length < 2) return;
    this.parts.push(`<polyline points="${this.pts(points)}" fill="none" stroke="${color}" stroke-width="${Math.max(0.5, widthM * this.scale).toFixed(2)}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`);
  }
  /** A polyline a fixed number of pixels wide. */
  linePx(points: readonly PlanPoint[], color: string, px: number, extra = ""): void {
    if (points.length < 2) return;
    this.parts.push(`<polyline points="${this.pts(points)}" fill="none" stroke="${color}" stroke-width="${px}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`);
  }
  poly(points: readonly PlanPoint[], fill: string, stroke = "none", strokePx = 0.5, extra = ""): void {
    if (points.length < 3) return;
    this.parts.push(`<polygon points="${this.pts(points)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokePx}" ${extra}/>`);
  }
  dot(p: PlanPoint, rPx: number, fill: string, extra = ""): void {
    this.parts.push(`<circle cx="${this.X(p[0]).toFixed(1)}" cy="${this.Y(p[1]).toFixed(1)}" r="${rPx}" fill="${fill}" ${extra}/>`);
  }
  /** A haloed label at a world point, nudged `dx`/`dy` pixels. */
  text(p: PlanPoint, text: string, sizePx = 9, fill = "#111", dx = 0, dy = 0, anchor = "start"): void {
    this.parts.push(
      `<text x="${(this.X(p[0]) + dx).toFixed(1)}" y="${(this.Y(p[1]) + dy).toFixed(1)}" font-size="${sizePx}" fill="${fill}" font-family="monospace" text-anchor="${anchor}" stroke="#fff" stroke-width="2.5" paint-order="stroke">${esc(text)}</text>`,
    );
  }
  /** Caption lines in the strip above the map. */
  caption(lines: readonly string[], sizePx = 10): void {
    lines.slice(0, 3).forEach((line, i) =>
      this.chrome.push(`<text x="${this.x0 + 2}" y="${this.y0 - PANEL_HEADER + 12 + i * (sizePx + 4)}" font-size="${sizePx}" font-family="monospace" fill="#111">${esc(line)}</text>`),
    );
  }
  /** Colour key in the strip below the map, wrapping onto a second row. */
  legend(entries: readonly [string, string][]): void {
    const rows: [string, string][][] = [[]];
    let used = 0;
    for (const entry of entries) {
      const w = 18 + entry[1].length * 5.6;
      if (used + w > this.size && rows.at(-1)!.length > 0) {
        rows.push([]);
        used = 0;
      }
      rows.at(-1)!.push(entry);
      used += w;
    }
    rows.slice(0, 2).forEach((row, r) => {
      let x = this.x0 + 2;
      const y = this.y0 + this.size + 12 + r * 13;
      for (const [color, label] of row) {
        this.chrome.push(`<rect x="${x}" y="${y - 8}" width="10" height="8" fill="${color}"/>`);
        this.chrome.push(`<text x="${x + 13}" y="${y}" font-size="9" font-family="monospace" fill="#111">${esc(label)}</text>`);
        x += 18 + label.length * 5.6;
      }
    });
  }
  /** Ramp key (min..max with a unit) in the strip below the map. */
  rampKey(label: string, lo: number, hi: number, unit: string, note = ""): void {
    const y = this.y0 + this.size + 5;
    for (let i = 0; i < 20; i += 1) this.chrome.push(`<rect x="${this.x0 + 2 + i * 6}" y="${y}" width="6" height="9" fill="${ramp(i / 19)}"/>`);
    this.chrome.push(`<text x="${this.x0 + 128}" y="${y + 8}" font-size="9" font-family="monospace">${esc(`${label} ${lo.toFixed(0)}..${hi.toFixed(0)} ${unit}${note}`)}</text>`);
  }
  /** Scale bar (metres) in the bottom-right corner. */
  scaleBar(): void {
    const target = this.span / 5;
    const nice = [10, 20, 50, 100, 200, 500, 1000, 2000].find((m) => m >= target) ?? 5000;
    const px = nice * this.scale;
    const x1 = this.x0 + this.size - 8;
    const y = this.y0 + this.size - 8;
    this.parts.push(`<line x1="${x1 - px}" y1="${y}" x2="${x1}" y2="${y}" stroke="#111" stroke-width="2"/>`);
    this.parts.push(`<text x="${x1 - px}" y="${y - 4}" font-size="9" font-family="monospace">${nice} m</text>`);
  }
  frame(background = "#f4f1ea"): void {
    this.parts.unshift(`<rect x="${this.x0}" y="${this.y0}" width="${this.size}" height="${this.size}" fill="${background}" stroke="#999"/>`);
    this.parts.unshift(`<clipPath id="c${this.x0}_${this.y0}"><rect x="${this.x0}" y="${this.y0}" width="${this.size}" height="${this.size}"/></clipPath>`);
  }
  toString(): string {
    return `<g clip-path="url(#c${this.x0}_${this.y0})">${this.parts.join("\n")}</g>${this.chrome.join("\n")}`;
  }
}

/** Lay panels out as a grid of `columns` and wrap them in one SVG with a title. */
export function contactSheet(title: string, subtitle: string, rows: readonly (readonly Panel[])[]): string {
  const width = Math.max(...rows.map((row) => Math.max(0, ...row.map((p) => p.x0 + p.size)))) + 10;
  const height = Math.max(...rows.map((row) => Math.max(0, ...row.map((p) => p.y0 + p.size)))) + PANEL_FOOTER + 6;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(height)}" viewBox="0 0 ${Math.ceil(width)} ${Math.ceil(height)}"><rect width="100%" height="100%" fill="#fff"/><text x="10" y="20" font-size="15" font-family="monospace" font-weight="bold">${esc(title)}</text><text x="10" y="38" font-size="11" font-family="monospace" fill="#444">${esc(subtitle)}</text>${rows.flat().map(String).join("\n")}</svg>`;
}

/** A street the drawing reads (a generated `Street` or a `CityStreet`). */
export interface DrawStreet {
  readonly points: readonly PlanPoint[];
  readonly width: number;
  readonly level: string;
  readonly heights?: readonly number[];
  readonly bulb?: PlanPoint;
  readonly surface?: string;
  readonly sidewalks?: { readonly left: readonly PlanPoint[]; readonly right: readonly PlanPoint[] };
}

/** Streets by level (or road height), bridges, tunnels, interior dead ends; optional terrain underlay. */
export function drawStreets(
  panel: Panel,
  net: {
    readonly streets: readonly DrawStreet[];
    readonly bridges?: readonly { readonly points: readonly PlanPoint[]; readonly width: number }[];
    readonly tunnels?: readonly { readonly points: readonly PlanPoint[]; readonly width: number }[];
    readonly deadEnds?: readonly { readonly x: number; readonly z: number }[];
  },
  options: { elevation?: boolean; heightAt?: (x: number, z: number) => number; muted?: boolean; legend?: boolean } = {},
): void {
  if (options.heightAt !== undefined) {
    const cell = panel.span / 50;
    const samples: number[] = [];
    for (let i = 0; i < 50; i += 1) for (let k = 0; k < 50; k += 1) samples.push(options.heightAt(panel.minX + (i + 0.5) * cell, panel.minZ + (k + 0.5) * cell));
    const lo = Math.min(...samples);
    const hi = Math.max(...samples);
    for (let i = 0; i < 50; i += 1) {
      for (let k = 0; k < 50; k += 1) {
        const x = panel.minX + i * cell;
        const z = panel.minZ + k * cell;
        panel.poly(
          [
            [x, z],
            [x + cell, z],
            [x + cell, z + cell],
            [x, z + cell],
          ],
          ramp((samples[i * 50 + k]! - lo) / Math.max(1e-9, hi - lo)),
          "none",
          0,
          'fill-opacity="0.35"',
        );
      }
    }
  }
  const order = ["lane", "street", "avenue", "boulevard"];
  const streets = [...net.streets].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  let lo = Infinity;
  let hi = -Infinity;
  if (options.elevation) for (const s of streets) for (const h of s.heights ?? []) (lo = Math.min(lo, h)), (hi = Math.max(hi, h));
  const elevated = options.elevation === true && Number.isFinite(lo);
  if (!elevated && !options.muted) for (const s of streets) if (s.sidewalks) for (const side of [s.sidewalks.left, s.sidewalks.right]) panel.line(side, "#d6d0c4", 1.4);
  for (const s of streets) {
    if (elevated && s.heights !== undefined) {
      for (let i = 0; i + 1 < s.points.length; i += 1) panel.line([s.points[i]!, s.points[i + 1]!], ramp(((s.heights[i]! + s.heights[i + 1]!) / 2 - lo) / Math.max(1e-9, hi - lo)), s.width);
    } else {
      const color = options.muted ? "#d0d0d0" : s.surface === "gravel" ? "#c2a878" : (LEVEL_COLOR[s.level] ?? "#777");
      panel.line(s.points, color, s.width);
    }
    if (s.bulb) panel.dot(s.bulb, Math.max(1.2, s.width * 0.9 * panel.scale), options.muted ? "#d0d0d0" : (LEVEL_COLOR[s.level] ?? "#777"));
  }
  if (options.muted) return;
  for (const b of net.bridges ?? []) panel.line(b.points, "#2e86de", b.width * 1.4, 'stroke-opacity="0.6"');
  for (const t of net.tunnels ?? []) panel.line(t.points, "#222", t.width * 1.4, 'stroke-dasharray="4 3" stroke-opacity="0.7"');
  for (const d of net.deadEnds ?? []) panel.dot([d.x, d.z], 2, "#000");
  if (options.legend === false) return;
  if (elevated) panel.rampKey("road height", lo, hi, "m", options.heightAt ? "  (underlay: terrain, light = high)" : "");
  else
    panel.legend([
      [LEVEL_COLOR["boulevard"]!, "boulevard"],
      [LEVEL_COLOR["avenue"]!, "avenue"],
      [LEVEL_COLOR["street"]!, "street"],
      [LEVEL_COLOR["lane"]!, "lane"],
      ["#000", "dead end"],
      ["#2e86de", "bridge"],
    ]);
}

/** A lot the city drawing reads (a `CityLot`). */
export interface DrawLot {
  readonly center: readonly [number, number];
  readonly rotationY: number;
  readonly class: string;
  readonly landmark?: string;
  readonly pieces: readonly {
    readonly role: string;
    readonly shape: string;
    readonly offset: readonly [number, number, number];
    readonly size: readonly [number, number, number];
    readonly rotationY: number;
  }[];
}

function pieceRing(lot: DrawLot, piece: DrawLot["pieces"][number]): PlanPoint[] {
  const c = Math.cos(lot.rotationY);
  const s = Math.sin(lot.rotationY);
  const pc = Math.cos(piece.rotationY);
  const ps = Math.sin(piece.rotationY);
  const hw = piece.size[0] / 2;
  const hd = piece.size[2] / 2;
  return (
    [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ] as const
  ).map(([x, z]) => {
    const lx = piece.offset[0] + x * pc + z * ps;
    const lz = piece.offset[2] - x * ps + z * pc;
    return [lot.center[0] + lx * c + lz * s, lot.center[1] - lx * s + lz * c] as PlanPoint;
  });
}

/** Blocks, parks, streets and buildings coloured by class (`use`) or by roof height (`height`). */
export function drawCity(
  panel: Panel,
  city: {
    readonly blocks: readonly { readonly kind: string; readonly polygon: readonly PlanPoint[]; readonly curb: readonly PlanPoint[] }[];
    readonly parks: readonly { readonly type: string; readonly polygon?: readonly PlanPoint[] }[];
    readonly parcels: readonly { readonly polygon: readonly PlanPoint[] }[];
    readonly streets: readonly DrawStreet[];
    readonly lots: readonly DrawLot[];
    readonly trees: readonly { readonly x: number; readonly z: number; readonly scale: number }[];
  },
  mode: "use" | "height",
  maxHeight: number,
): void {
  for (const b of city.blocks) panel.poly(b.curb, "#d8d2c6");
  for (const b of city.blocks) panel.poly(b.polygon, BLOCK_FILL[b.kind] ?? "#eee");
  for (const p of city.parks) if (p.polygon && p.type !== "buffer") panel.poly(p.polygon, "#a9d18e");
  for (const p of city.parcels) panel.poly(p.polygon, "none", "#b5ad9e", 0.4);
  drawStreets(panel, { streets: city.streets }, { muted: mode === "height", legend: false });
  for (const t of city.trees) panel.dot([t.x, t.z], Math.max(0.7, 2 * t.scale * panel.scale), "#3e7d32", 'fill-opacity="0.6"');
  const landmarks: { at: PlanPoint; name: string }[] = [];
  for (const lot of city.lots) {
    const top = Math.max(0, ...lot.pieces.map((p) => p.offset[1] + p.size[1]));
    const fill = mode === "use" ? (CLASS_COLOR[lot.class] ?? "#000") : ramp(Math.sqrt(top / Math.max(1, maxHeight)));
    for (const piece of lot.pieces) {
      if (piece.role !== "wall") continue;
      panel.poly(pieceRing(lot, piece), fill, lot.landmark ? "#ff00aa" : "#222", lot.landmark ? 2 : 0.3);
    }
    if (lot.landmark) landmarks.push({ at: [lot.center[0], lot.center[1]], name: lot.landmark });
  }
  for (const l of landmarks) panel.text(l.at, `★ ${l.name}`, 10, "#a0006e");
  if (mode === "height") panel.rampKey("roof height", 0, maxHeight, "m", "  (square-root scale)");
  else panel.legend(Object.entries(CLASS_COLOR).map(([name, color]) => [color, name] as [string, string]));
}

/** The race dressing the circuit drawing reads (a `CircuitRoute` or a city's `ResolvedRace`). */
export interface DrawRace {
  readonly checkpoints?: readonly { readonly id: string; readonly center: readonly [number, number, number] }[];
  readonly start?: { readonly line: readonly [PlanPoint, PlanPoint]; readonly distance: number };
  readonly grid?: readonly { readonly x: number; readonly z: number }[];
  readonly seals?: readonly { readonly x: number; readonly z: number; readonly heading: number; readonly width: number }[];
  readonly sectors?: readonly number[];
  readonly length?: number;
}

/**
 * A lap three ways: `detail` (corners by kind with radius/angle labels, straights, gates, grid, seals,
 * sectors, start line, pit lanes, overtaking spots), `speed` (point-mass sim speed with braking
 * zones) and `elevation` (road height).
 */
export function drawCircuit(
  panel: Panel,
  analysis: CircuitAnalysis,
  race: DrawRace,
  mode: "detail" | "speed" | "elevation",
  context: { streets?: readonly DrawStreet[]; pits?: readonly (readonly PlanPoint[])[] } = {},
): void {
  const pts = analysis.samples;
  const n = pts.length;
  const width = Math.max(4, ...analysis.widths);
  if (context.streets) drawStreets(panel, { streets: context.streets }, { muted: true });
  const loop = [...pts, pts[0]!];
  if (mode === "speed") {
    const speeds = analysis.sim.speeds;
    const lo = Math.min(...speeds);
    const hi = Math.max(...speeds);
    for (let i = 0; i < n; i += 1) panel.line([pts[i]!, pts[(i + 1) % n]!], ramp((speeds[i]! - lo) / Math.max(1e-9, hi - lo)), width);
    for (const zone of analysis.sim.brakingZones) {
      const seg: PlanPoint[] = [];
      for (let i = zone.start; seg.length <= n; i = (i + 1) % n) {
        seg.push(pts[i]!);
        if (i === zone.end) break;
      }
      panel.linePx(seg, "#e01e1e", 2.2);
    }
    for (const spot of analysis.overtakingSpots) panel.text(pts[spot.brakeAt]!, `OT ${Math.round(spot.straight)}m -${Math.round(spot.deltaKph)}kph`, 9, "#b00");
    panel.rampKey("sim speed", lo * 3.6, hi * 3.6, "km/h", "  red: braking, OT: overtaking spot");
    return;
  }
  if (mode === "elevation") {
    const h = analysis.heights ?? pts.map(() => 0);
    const lo = Math.min(...h);
    const hi = Math.max(...h);
    for (let i = 0; i < n; i += 1) panel.line([pts[i]!, pts[(i + 1) % n]!], ramp((h[i]! - lo) / Math.max(1e-9, hi - lo)), width);
    panel.rampKey("lap height", lo, hi, "m");
    return;
  }
  panel.line(loop, "#3a3a3a", width);
  for (const pit of context.pits ?? []) panel.line(pit, "#17a2b8", 6, 'stroke-opacity="0.85"');
  for (const straight of analysis.straights) {
    if (straight.length < 80) continue;
    const seg: PlanPoint[] = [];
    for (let i = straight.start; seg.length <= n; i = (i + 1) % n) {
      seg.push(pts[i]!);
      if (i === straight.end) break;
    }
    panel.linePx(seg, "#9be15d", 1.6);
    panel.text(seg[Math.floor(seg.length / 2)]!, `${Math.round(straight.length)} m`, 9, "#2d6a0c");
  }
  let cx = 0;
  let cz = 0;
  for (const p of pts) (cx += p[0] / n), (cz += p[1] / n);
  analysis.corners.forEach((corner, index) => {
    const seg: PlanPoint[] = [];
    for (let i = corner.entry; seg.length <= n; i = (i + 1) % n) {
      seg.push(pts[i]!);
      if (i === corner.exit) break;
    }
    panel.linePx(seg, CORNER_COLOR[corner.kind], 3);
    // Label outside the lap: push it away from the lap's centroid past the road edge.
    const apex = pts[corner.apex]!;
    const ox = apex[0] - cx;
    const oz = apex[1] - cz;
    const ol = Math.hypot(ox, oz) || 1;
    // Flip inward when the outward spot would leave the panel.
    const push = (width / 2) * panel.scale + 6;
    const outX = panel.X(apex[0]) + (ox / ol) * push;
    const outY = panel.Y(apex[1]) + (oz / ol) * push;
    const fits = outX > panel.x0 + 70 && outX < panel.x0 + panel.size - 70 && outY > panel.y0 + 10 && outY < panel.y0 + panel.size - 4;
    const sign = fits ? 1 : -1;
    const label = `T${index + 1} R${Math.round(corner.radius)} ${Math.round(corner.angleDeg)}°`;
    panel.text(apex, label, 9, "#111", sign * (ox / ol) * push, sign * (oz / ol) * push + 3, sign * ox < 0 ? "end" : "start");
  });
  for (const seal of race.seals ?? []) {
    const ax = Math.cos(seal.heading);
    const az = -Math.sin(seal.heading);
    const half = seal.width * 0.6;
    panel.linePx(
      [
        [seal.x - ax * half, seal.z - az * half],
        [seal.x + ax * half, seal.z + az * half],
      ],
      "#8e44ad",
      3,
    );
  }
  for (const gate of race.checkpoints ?? []) panel.dot([gate.center[0], gate.center[2]], 3, gate.id === "finish" ? "#000" : "#2980b9");
  if (race.start) {
    panel.linePx(race.start.line, "#fff", 4);
    panel.linePx(race.start.line, "#000", 2, 'stroke-dasharray="2 2"');
  }
  for (const slot of race.grid ?? []) {
    let best = 0;
    let bd = Infinity;
    pts.forEach((p, i) => {
      const d = Math.hypot(p[0] - slot.x, p[1] - slot.z);
      if (d < bd) (bd = d), (best = i);
    });
    panel.dot([slot.x, slot.z], 2.2, analysis.radii[best]! < 150 ? "#ff0000" : "#16a085");
  }
  const length = race.length ?? analysis.distances.at(-1)! + analysis.step;
  for (const fraction of (race.sectors ?? []).slice(1)) {
    const d = ((((race.start?.distance ?? 0) / length + fraction) % 1) + 1) % 1;
    panel.dot(pts[Math.floor(d * n) % n]!, 6, "none", 'stroke="#f39c12" stroke-width="2.5"');
  }
  panel.legend([
    [CORNER_COLOR.hairpin, "hairpin"],
    [CORNER_COLOR["right-angle"], "90°"],
    [CORNER_COLOR.tight, "tight"],
    [CORNER_COLOR.medium, "medium"],
    [CORNER_COLOR.sweeper, "sweeper"],
    [CORNER_COLOR.kink, "kink"],
    ["#9be15d", "straight≥80 m"],
    ["#8e44ad", "seal"],
    ["#2980b9", "gate"],
    ["#16a085", "grid"],
    ["#f39c12", "sector"],
    ["#17a2b8", "pit"],
  ]);
}
