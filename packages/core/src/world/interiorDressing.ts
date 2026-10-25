/**
 * Interior dressing: the trims, pipe runs, sagging cables, grime decals, practical lamps and clutter
 * slots that make a room built from plain footprints read as a worked place. Pure and deterministic:
 * the same footprints, heights and seed always plan the same dressing, so the plan is derived content
 * (like a room shell) rather than a second set of authored coordinates, and every game chooses its own
 * materials, models and density. The `shell` renders a plan with `InteriorDressing`.
 *
 * @capability interior-dressing derive trims, pipes, cables, decals, practical lamps and clutter slots from room footprints
 */
import { sagCurve } from "./catenary";
import type { DecalStyle } from "./decalKind";
import type { Vec3 } from "./geometry";
import { seededRng } from "../random/rng";

/** One axis-aligned walkable footprint, centre and full size on the ground plane. */
export interface InteriorRect {
  x: number;
  z: number;
  w: number;
  d: number;
}

/**
 * One straight stretch of wall bounding the union of footprints. `inward` is the unit normal that
 * points into the room; a doorway between two footprints is a gap, so a run never crosses one.
 */
export interface InteriorWallRun {
  id: string;
  from: readonly [number, number];
  to: readonly [number, number];
  inward: readonly [number, number];
  length: number;
}

/** A box in world space, rotated about Y. `role` names what it dresses. */
export interface InteriorBox {
  id: string;
  role: "skirting" | "rail" | "crown" | "rib" | "bracket" | "valve" | "panel" | "hatch";
  center: Vec3;
  size: Vec3;
  rotationY: number;
}

/** A straight pipe segment between two points. */
export interface InteriorPipe {
  id: string;
  from: Vec3;
  to: Vec3;
  radius: number;
}

/** A cable hung between anchors, already sampled into a sagging polyline. */
export interface InteriorCable {
  id: string;
  points: Vec3[];
  radius: number;
}

/** The procedural stains a dressing plan places; each is a {@link DecalStyle} with its own texture in the shell. */
export type InteriorDecalStyle = Extract<DecalStyle, "grime" | "leak" | "rust" | "dirt" | "wet" | "paper" | "scorch" | "hazard">;

/** A stain on a wall (standing, facing `normal`) or on the floor (lying flat). */
export interface InteriorDecal {
  id: string;
  style: InteriorDecalStyle;
  surface: "wall" | "floor";
  position: Vec3;
  /** Unit vector the decal faces: into the room for a wall, straight up for the floor. */
  normal: Vec3;
  /** Rotation in the decal's own plane, radians. */
  spin: number;
  width: number;
  height: number;
  opacity: number;
}

/** A practical lamp mounted on a wall: where its housing sits and where its light comes from. */
export interface InteriorFixture {
  id: string;
  position: Vec3;
  /** Where a light standing in for this fixture belongs: a little into the room from the housing. */
  light: Vec3;
  /** Unit vector the lamp faces (into the room). */
  normal: Vec3;
  rotationY: number;
  /** A `dead` lamp stays dark (a gap of shadow along the wall); a `flicker` one stutters. */
  state: InteriorFixtureState;
}

/** Whether a planned lamp burns steadily, stutters or has failed. */
export type InteriorFixtureState = "lit" | "flicker" | "dead";

/**
 * A small loose object on the floor: a can, a rag, a tool, a pile of rubble. Debris does not block a
 * walk, so it may sit anywhere but a kept-clear spot; `along` says whether it hugs a wall, gathers in
 * a corner or lies out in the open, and `pick` lets a game choose which model lies there.
 */
export interface InteriorDebrisSlot {
  id: string;
  position: Vec3;
  rotationY: number;
  /** Size multiplier around 1, so a repeated model does not read as a stamp. */
  scale: number;
  along: "wall" | "corner" | "open";
  /** Deterministic 0..1 pick a game uses to choose which model lies here. */
  pick: number;
}

/** A spot against a wall a game may fill with a prop of at most `depth` × `width`. */
export interface InteriorClutterSlot {
  id: string;
  position: Vec3;
  /** Facing into the room (a prop's front looks along +Z after this rotation). */
  rotationY: number;
  width: number;
  depth: number;
  wallId: string;
  /** Deterministic 0..1 pick a game uses to choose which prop stands here. */
  pick: number;
}

/** A point or circle the dressing must keep clear: a door, lift, pickup or spawn. */
export interface InteriorClearance {
  x: number;
  z: number;
  radius: number;
  /** Paint a hazard-stripe border on the floor around it, as round a lift cage or loading bay. */
  mark?: boolean;
}

/** What to place and how densely. Each family is on with its defaults unless set to `false`. */
export interface InteriorDressingOptions {
  seed: string | number;
  floorY: number;
  ceilingY: number;
  /**
   * One knob for how lived-in the place is: multiplies every per-metre and per-square-metre count
   * (stains, debris, clutter slots, cable chance). 1 is the default dressing, 0.5 a tidy floor, 2 a
   * wrecked one.
   */
  density?: number;
  /** Spots nothing on the floor may cover: doors, lifts, pickups, spawns. */
  keepClear?: readonly InteriorClearance[];
  trims?: { skirting?: number | false; rail?: number | false; crown?: boolean; ribSpacing?: number | false; depth?: number } | false;
  /** Pipe runs along the top of each wall: how many per wall and their radius. */
  pipes?: { perWall?: number; radius?: number; minLength?: number; bracketSpacing?: number; drops?: number } | false;
  /**
   * Cables hung along walls under the pipes: chance per wall and how far they sag. `floor` is the
   * chance a wall also gets a cable that drops from the ceiling and snakes along the floor at its foot.
   */
  cables?: { chance?: number; sag?: number; span?: number; radius?: number; floor?: number } | false;
  /**
   * Stains per metre of wall (`grime`, `leak`, `rust`, `scorch`) and per square metre of floor
   * (`dirt`, `wet`, `paper` litter). Kept-clear spots with `mark` get hazard stripes regardless.
   */
  decals?: { grime?: number; leaks?: number; rust?: number; floor?: number; wet?: number; paper?: number; scorch?: number } | false;
  /**
   * Wall lamps: metres between them along a wall, their height under the ceiling, and the share that
   * are `dead` (dark gaps that give a corridor its contrast) or `flicker`.
   */
  fixtures?: { spacing?: number; drop?: number; dead?: number; flicker?: number } | false;
  /**
   * Wall breakup, so a long wall is not one even sheet: per wall bay, the chance of a lower wainscot
   * plate (`chance`, up to `height` metres) and of a tall access hatch (`hatches`). Bays are `bay`
   * metres wide.
   */
  panels?: { chance?: number; hatches?: number; height?: number; bay?: number } | false;
  /**
   * Loose floor debris: pieces per metre of wall at its foot (`wall`), pieces piled in each inside
   * corner (`corners`) and pieces per square metre out in the open (`open`).
   */
  debris?: { wall?: number; corners?: number; open?: number } | false;
  /** Clutter slots: metres between them, their depth and the walkway that must stay open in front. */
  clutter?: { spacing?: number; depth?: number; width?: number; passage?: number; chance?: number } | false;
}

/** Everything a dressing pass places. */
export interface InteriorDressingPlan {
  walls: InteriorWallRun[];
  trims: InteriorBox[];
  pipes: InteriorPipe[];
  fittings: InteriorBox[];
  cables: InteriorCable[];
  decals: InteriorDecal[];
  fixtures: InteriorFixture[];
  clutter: InteriorClutterSlot[];
  /** Wainscot plates and access hatches standing proud of the walls. */
  panels: InteriorBox[];
  debris: InteriorDebrisSlot[];
}

const EPS = 1e-6;

function inside(rects: readonly InteriorRect[], x: number, z: number): boolean {
  return rects.some((r) => Math.abs(x - r.x) < r.w / 2 - EPS && Math.abs(z - r.z) < r.d / 2 - EPS);
}

/**
 * The wall runs bounding a union of footprints: every boundary edge of the union, merged into the
 * longest straight runs with one inward normal each. Doorways between footprints leave no wall.
 */
export function interiorWallRuns(rects: readonly InteriorRect[]): InteriorWallRun[] {
  for (const r of rects) {
    if (![r.x, r.z, r.w, r.d].every(Number.isFinite) || r.w <= 0 || r.d <= 0) throw new Error("Interior footprints need finite positive sizes");
  }
  if (rects.length === 0) return [];
  const xs = [...new Set(rects.flatMap((r) => [r.x - r.w / 2, r.x + r.w / 2]))].sort((a, b) => a - b);
  const zs = [...new Set(rects.flatMap((r) => [r.z - r.d / 2, r.z + r.d / 2]))].sort((a, b) => a - b);
  const filled = (ix: number, iz: number): boolean => {
    if (ix < 0 || iz < 0 || ix >= xs.length - 1 || iz >= zs.length - 1) return false;
    return inside(rects, (xs[ix]! + xs[ix + 1]!) / 2, (zs[iz]! + zs[iz + 1]!) / 2);
  };
  // Boundary edges keyed by the line they lie on and the side the room is on, then merged along it.
  const edges = new Map<string, { axis: "x" | "z"; at: number; inward: readonly [number, number]; spans: [number, number][] }>();
  const push = (axis: "x" | "z", at: number, inward: readonly [number, number], a: number, b: number) => {
    const key = `${axis}:${at}:${inward[0]}:${inward[1]}`;
    const entry = edges.get(key) ?? { axis, at, inward, spans: [] };
    entry.spans.push([a, b]);
    edges.set(key, entry);
  };
  for (let iz = 0; iz < zs.length - 1; iz++) {
    for (let ix = 0; ix < xs.length - 1; ix++) {
      if (!filled(ix, iz)) continue;
      const x0 = xs[ix]!, x1 = xs[ix + 1]!, z0 = zs[iz]!, z1 = zs[iz + 1]!;
      if (!filled(ix - 1, iz)) push("z", x0, [1, 0], z0, z1);
      if (!filled(ix + 1, iz)) push("z", x1, [-1, 0], z0, z1);
      if (!filled(ix, iz - 1)) push("x", z0, [0, 1], x0, x1);
      if (!filled(ix, iz + 1)) push("x", z1, [0, -1], x0, x1);
    }
  }
  const runs: InteriorWallRun[] = [];
  const ordered = [...edges.values()].sort((a, b) => (a.axis === b.axis ? a.at - b.at || a.inward[0] - b.inward[0] || a.inward[1] - b.inward[1] : a.axis < b.axis ? -1 : 1));
  for (const edge of ordered) {
    edge.spans.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const span of edge.spans) {
      const last = merged.at(-1);
      if (last !== undefined && Math.abs(last[1] - span[0]) < EPS) last[1] = span[1];
      else merged.push([...span]);
    }
    for (const [a, b] of merged) {
      const from: [number, number] = edge.axis === "x" ? [a, edge.at] : [edge.at, a];
      const to: [number, number] = edge.axis === "x" ? [b, edge.at] : [edge.at, b];
      runs.push({ id: `wall:${runs.length}`, from, to, inward: edge.inward, length: b - a });
    }
  }
  return runs;
}

/** Y rotation that turns local +Z onto `inward`. */
function facing(inward: readonly [number, number]): number {
  return Math.atan2(inward[0], inward[1]);
}

function along(run: InteriorWallRun, t: number, out: number, y: number): Vec3 {
  return [run.from[0] + (run.to[0] - run.from[0]) * t + run.inward[0] * out, y, run.from[1] + (run.to[1] - run.from[1]) * t + run.inward[1] * out];
}

function clear(keepClear: readonly InteriorClearance[], x: number, z: number, pad: number): boolean {
  return keepClear.every((spot) => Math.hypot(x - spot.x, z - spot.z) > spot.radius + pad);
}

type PanelOptions = { chance: number; hatches: number; height: number; bay: number };

/** Wainscot plates and access hatches for one wall run, bay by bay, a hand's width proud of it. */
function dressPanels(plan: InteriorDressingPlan, run: InteriorWallRun, turn: number, dir: readonly [number, number], floorY: number, ceilingY: number, panels: PanelOptions, trims: { skirting?: number | false } | null, rng: () => number): void {
  const bays = Math.max(1, Math.round(run.length / panels.bay));
  const bayLength = run.length / bays;
  const base = floorY + (trims === null || trims.skirting === false ? 0.02 : (trims.skirting ?? 0.16) + 0.02);
  const wide = (w: number, tall: number, deep: number): Vec3 => (Math.abs(dir[0]) > 0.5 ? [w, tall, deep] : [deep, tall, w]);
  for (let b = 0; b < bays; b++) {
    const t = (b + 0.5) / bays;
    const plate = rng(), hatch = rng(), jitter = rng();
    if (plate < panels.chance) {
      const tall = panels.height * (0.85 + jitter * 0.3);
      plan.panels.push({ id: `${run.id}:panel:${b}`, role: "panel", center: along(run, t, 0.018, base + tall / 2), size: wide(bayLength * 0.94, tall, 0.024), rotationY: 0 });
    }
    if (hatch < panels.hatches && bayLength > 1.1) {
      const w = Math.min(bayLength * 0.6, 0.7 + jitter * 0.45), tall = Math.min(ceilingY - floorY - 0.8, 1.5 + jitter * 0.6);
      plan.panels.push({ id: `${run.id}:hatch:${b}`, role: "hatch", center: along(run, t + ((jitter - 0.5) * 0.2) / bays, 0.03, floorY + 0.35 + tall / 2), size: [w, tall, 0.045], rotationY: turn });
    }
  }
}

/** A cable that drops from under the ceiling near one end of a wall and snakes along its foot. */
function floorCable(run: InteriorWallRun, floorY: number, ceilingY: number, radius: number, rng: () => number): InteriorCable {
  const start = 0.08 + rng() * 0.25, end = Math.min(0.95, start + 0.35 + rng() * 0.55);
  const lie = floorY + radius;
  const bend = 0.35 / run.length;
  const points: Vec3[] = [along(run, start, 0.05, ceilingY - 0.55), along(run, start + bend * 0.4, 0.07, floorY + 0.6), along(run, start + bend, 0.14, lie)];
  const steps = Math.max(4, Math.round(((end - start) * run.length) / 0.6));
  const phase = rng() * Math.PI * 2, wave = 0.6 + rng() * 0.8;
  for (let i = 1; i <= steps; i++) {
    const t = start + bend + (end - start - bend) * (i / steps);
    points.push(along(run, t, 0.16 + Math.sin(phase + i * wave) * 0.09, lie));
  }
  return { id: `${run.id}:floor-cable`, points, radius };
}

/** Debris at the foot of one wall and piled in its inside corners. */
function dressDebris(plan: InteriorDressingPlan, run: InteriorWallRun, rects: readonly InteriorRect[], keepClear: readonly InteriorClearance[], floorY: number, debris: { wall: number; corners: number }, rng: () => number): void {
  const put = (id: string, at: Vec3, where: InteriorDebrisSlot["along"]) => {
    const pick = rng(), spin = rng() * Math.PI * 2, scale = 0.75 + rng() * 0.5;
    if (!inside(rects, at[0], at[2]) || !clear(keepClear, at[0], at[2], 0.25)) return;
    plan.debris.push({ id, position: at, rotationY: spin, scale, along: where, pick });
  };
  const count = Math.round(run.length * debris.wall);
  for (let i = 0; i < count; i++) put(`${run.id}:debris:${i}`, along(run, 0.04 + rng() * 0.92, 0.12 + rng() * 0.3, floorY), "wall");
  const dir: [number, number] = [(run.to[0] - run.from[0]) / run.length, (run.to[1] - run.from[1]) / run.length];
  for (const [end, sign] of [[0, -1], [1, 1]] as const) {
    const corner = along(run, end, 0, floorY);
    // An inside corner has wall just past the run's end; a doorway edge has more room there.
    if (inside(rects, corner[0] + dir[0] * sign * 0.3 + run.inward[0] * 0.3, corner[2] + dir[1] * sign * 0.3 + run.inward[1] * 0.3)) continue;
    for (let i = 0; i < debris.corners; i++) {
      const back = 0.15 + rng() * 0.55, out = 0.12 + rng() * 0.5;
      put(`${run.id}:corner:${end}:${i}`, [corner[0] - dir[0] * sign * back + run.inward[0] * out, floorY, corner[2] - dir[1] * sign * back + run.inward[1] * out], "corner");
    }
  }
}

/**
 * Plan the dressing for one floor: footprints in, every trim, pipe, cable, decal, lamp and clutter
 * slot out. Density is per metre of wall and per square metre of floor, so a bigger floor gets more,
 * and every family can be turned off or retuned in `options`.
 */
export function planInteriorDressing(rects: readonly InteriorRect[], options: InteriorDressingOptions): InteriorDressingPlan {
  const { floorY, ceilingY } = options;
  if (!Number.isFinite(floorY) || !Number.isFinite(ceilingY) || ceilingY - floorY < 1) throw new Error("Interior dressing needs a ceiling at least 1 m above the floor");
  const height = ceilingY - floorY;
  const keepClear = options.keepClear ?? [];
  const rng = seededRng(options.seed);
  const walls = interiorWallRuns(rects);
  const plan: InteriorDressingPlan = { walls, trims: [], pipes: [], fittings: [], cables: [], decals: [], fixtures: [], clutter: [], panels: [], debris: [] };
  const density = options.density ?? 1;
  if (!Number.isFinite(density) || density < 0) throw new Error("Interior dressing density must be a finite number of at least 0");

  const trims = options.trims === false ? null : options.trims ?? {};
  const pipes = options.pipes === false ? null : { perWall: 2, radius: 0.07, minLength: 2.5, bracketSpacing: 1.6, drops: 0.25, ...options.pipes };
  const cables = options.cables === false ? null : { chance: 0.6, sag: 0.22, span: 1.8, radius: 0.012, floor: 0.3, ...options.cables };
  const rawDecals = options.decals === false ? null : { grime: 0.6, leaks: 0.18, rust: 0.12, floor: 0.05, wet: 0.025, paper: 0.03, scorch: 0.02, ...options.decals };
  const decals = rawDecals === null ? null : (Object.fromEntries(Object.entries(rawDecals).map(([key, value]) => [key, value * density])) as typeof rawDecals);
  const fixtures = options.fixtures === false ? null : { spacing: 6, drop: 0.7, dead: 0.15, flicker: 0.08, ...options.fixtures };
  const rawClutter = options.clutter === false ? null : { spacing: 2.2, depth: 0.7, width: 1, passage: 1.6, chance: 0.75, ...options.clutter };
  const clutter = rawClutter === null || density === 0 ? null : { ...rawClutter, spacing: rawClutter.spacing / Math.sqrt(density), chance: Math.min(1, rawClutter.chance * Math.sqrt(density)) };
  const panels = options.panels === false ? null : { chance: 0.45, hatches: 0.12, height: Math.min(1.2, height * 0.32), bay: 2.4, ...options.panels };
  const debris = options.debris === false ? null : { wall: 0.5, corners: 3, open: 0.04, ...options.debris };
  const debrisCounts = debris === null ? null : { wall: debris.wall * density, corners: Math.round(debris.corners * density), open: debris.open * density };
  // The newer families draw from their own stream, so adding them never reshuffles the pipes,
  // cables, stains or clutter an existing plan already had.
  const extra = seededRng(`${String(options.seed)}:extra`);

  for (const run of walls) {
    const turn = facing(run.inward);
    const dir: [number, number] = [(run.to[0] - run.from[0]) / run.length, (run.to[1] - run.from[1]) / run.length];
    const centre = (out: number, y: number) => along(run, 0.5, out, y);
    const alongSize = (thick: number, tall: number, deep: number): Vec3 => (Math.abs(dir[0]) > 0.5 ? [run.length + thick, tall, deep] : [deep, tall, run.length + thick]);

    if (trims !== null) {
      const depth = trims.depth ?? 0.05;
      const skirting = trims.skirting ?? 0.16;
      const rail = trims.rail ?? Math.min(1.1, height * 0.3);
      if (skirting !== false) plan.trims.push({ id: `${run.id}:skirting`, role: "skirting", center: centre(depth / 2, floorY + skirting / 2), size: alongSize(depth * 2, skirting, depth), rotationY: 0 });
      if (rail !== false) plan.trims.push({ id: `${run.id}:rail`, role: "rail", center: centre(depth * 0.6, floorY + rail), size: alongSize(depth * 2, 0.07, depth * 1.2), rotationY: 0 });
      if (trims.crown !== false) plan.trims.push({ id: `${run.id}:crown`, role: "crown", center: centre(depth * 0.8, ceilingY - 0.09), size: alongSize(depth * 2, 0.18, depth * 1.6), rotationY: 0 });
      const ribSpacing = trims.ribSpacing ?? 3;
      if (ribSpacing !== false && run.length > ribSpacing * 0.9) {
        const ribs = Math.max(1, Math.round(run.length / ribSpacing));
        for (let i = 1; i < ribs; i++) {
          const at = along(run, i / ribs, 0.06, floorY + height / 2);
          plan.trims.push({ id: `${run.id}:rib:${i}`, role: "rib", center: at, size: [0.22, height, 0.12], rotationY: turn });
        }
      }
    }

    if (pipes !== null && run.length >= pipes.minLength) {
      const count = Math.min(pipes.perWall, 1 + Math.floor(rng() * pipes.perWall + 0.35));
      for (let p = 0; p < count; p++) {
        const radius = pipes.radius * (0.7 + rng() * 0.8);
        const y = ceilingY - 0.28 - p * 0.3 - radius;
        const out = radius + 0.1 + p * 0.04;
        const inset = 0.05;
        const from = along(run, inset / run.length, out, y), to = along(run, 1 - inset / run.length, out, y);
        plan.pipes.push({ id: `${run.id}:pipe:${p}`, from, to, radius });
        const brackets = Math.max(2, Math.round(run.length / pipes.bracketSpacing));
        for (let b = 0; b <= brackets; b++) {
          const t = (0.3 + b * (run.length - 0.6) / brackets) / run.length;
          const at = along(run, t, out / 2, y);
          plan.fittings.push({ id: `${run.id}:pipe:${p}:bracket:${b}`, role: "bracket", center: at, size: [0.05, radius * 2 + 0.06, out + radius], rotationY: turn });
          if (decals !== null && p === 0 && rng() < decals.leaks * pipes.bracketSpacing) {
            const streak = 0.9 + rng() * Math.max(0.4, y - floorY - 1.2);
            const wallAt = along(run, t, 0.012, y - streak / 2 - 0.04);
            plan.decals.push({ id: `${run.id}:leak:${p}:${b}`, style: "leak", surface: "wall", position: wallAt, normal: [run.inward[0], 0, run.inward[1]], spin: 0, width: 0.35 + rng() * 0.4, height: streak, opacity: 0.55 + rng() * 0.35 });
          }
        }
        if (p === 0 && rng() < pipes.drops) {
          const t = 0.2 + rng() * 0.6;
          const top = along(run, t, out, y), bottom = along(run, t, out, floorY + 0.55);
          const [px, , pz] = top;
          if (clear(keepClear, px, pz, 0.6)) {
            plan.pipes.push({ id: `${run.id}:drop:${p}`, from: top, to: bottom, radius: radius * 0.8 });
            plan.fittings.push({ id: `${run.id}:valve:${p}`, role: "valve", center: [bottom[0], floorY + 0.38, bottom[2]], size: [radius * 3.2, 0.34, radius * 3.2], rotationY: turn });
          }
        }
      }
    }

    if (cables !== null && run.length >= cables.span && rng() < Math.min(1, cables.chance * density)) {
      const y = ceilingY - 0.18 - (pipes === null ? 0 : 0.5) - rng() * 0.2;
      const spans = Math.max(1, Math.round(run.length / cables.span));
      const strands = 1 + Math.floor(rng() * 2);
      for (let s = 0; s < strands; s++) {
        const out = 0.04 + s * 0.035;
        for (let i = 0; i < spans; i++) {
          const a = along(run, i / spans, out, y + s * 0.03), b = along(run, (i + 1) / spans, out, y + s * 0.03);
          plan.cables.push({ id: `${run.id}:cable:${s}:${i}`, points: sagCurve(a, b, cables.sag * (0.6 + rng() * 0.8), 10), radius: cables.radius * (0.8 + rng() * 0.6) });
        }
      }
    }

    if (decals !== null) {
      const grimes = Math.round(run.length * decals.grime);
      for (let i = 0; i < grimes; i++) {
        const t = (i + 0.2 + rng() * 0.6) / Math.max(1, grimes);
        const tall = 0.5 + rng() * 0.9;
        plan.decals.push({ id: `${run.id}:grime:${i}`, style: "grime", surface: "wall", position: along(run, t, 0.01, floorY + tall / 2 - 0.02), normal: [run.inward[0], 0, run.inward[1]], spin: 0, width: 1.2 + rng() * 1.6, height: tall, opacity: 0.55 + rng() * 0.4 });
      }
      const rusts = Math.round(run.length * decals.rust * rng() * 2);
      for (let i = 0; i < rusts; i++) {
        const size = 0.4 + rng() * 0.9;
        plan.decals.push({ id: `${run.id}:rust:${i}`, style: "rust", surface: "wall", position: along(run, 0.05 + rng() * 0.9, 0.014, floorY + 0.4 + rng() * (height - 1)), normal: [run.inward[0], 0, run.inward[1]], spin: rng() * Math.PI * 2, width: size, height: size, opacity: 0.5 + rng() * 0.4 });
      }
    }

    if (fixtures !== null && run.length >= fixtures.spacing * 0.6) {
      const lamps = Math.max(1, Math.round(run.length / fixtures.spacing));
      for (let i = 0; i < lamps; i++) {
        const t = (i + 0.5) / lamps;
        const position = along(run, t, 0.08, ceilingY - fixtures.drop);
        const roll = extra();
        const state: InteriorFixtureState = roll < fixtures.dead ? "dead" : roll < fixtures.dead + fixtures.flicker ? "flicker" : "lit";
        plan.fixtures.push({ id: `${run.id}:lamp:${i}`, position, light: along(run, t, 0.45, ceilingY - fixtures.drop - 0.1), normal: [run.inward[0], 0, run.inward[1]], rotationY: turn, state });
      }
    }

    if (clutter !== null && run.length >= clutter.width + 1.2) {
      const slots = Math.floor((run.length - 1.2) / clutter.spacing);
      for (let i = 0; i < slots; i++) {
        const jitter = (rng() - 0.5) * 0.4;
        const t = (0.6 + (i + 0.5) * ((run.length - 1.2) / slots) + jitter) / run.length;
        const position = along(run, t, clutter.depth / 2 + 0.03, floorY);
        const pick = rng();
        if (rng() > clutter.chance) continue;
        // The walkway in front of the prop has to stay inside the room, and no gameplay spot nearby.
        const front = along(run, t, clutter.depth + clutter.passage, floorY);
        if (!inside(rects, front[0], front[2])) continue;
        const side0 = along(run, t - clutter.width / 2 / run.length, clutter.depth / 2, floorY), side1 = along(run, t + clutter.width / 2 / run.length, clutter.depth / 2, floorY);
        if (!inside(rects, side0[0], side0[2]) || !inside(rects, side1[0], side1[2])) continue;
        if (!clear(keepClear, position[0], position[2], Math.max(clutter.width, clutter.depth) / 2 + 0.3)) continue;
        plan.clutter.push({ id: `${run.id}:clutter:${i}`, position, rotationY: turn, width: clutter.width, depth: clutter.depth, wallId: run.id, pick });
      }
    }

    if (panels !== null) dressPanels(plan, run, turn, dir, floorY, ceilingY, panels, trims, extra);
    if (cables !== null && extra() < Math.min(1, cables.floor * density)) plan.cables.push(floorCable(run, floorY, ceilingY, cables.radius * 1.8, extra));
    if (decals !== null) {
      const scorches = Math.round(run.length * decals.scorch * extra() * 2);
      for (let i = 0; i < scorches; i++) {
        const size = 0.6 + extra() * 1.2;
        plan.decals.push({ id: `${run.id}:scorch:${i}`, style: "scorch", surface: "wall", position: along(run, 0.08 + extra() * 0.84, 0.016, floorY + 0.3 + extra() * Math.max(0.2, height - 1.2)), normal: [run.inward[0], 0, run.inward[1]], spin: extra() * Math.PI * 2, width: size, height: size * (0.7 + extra() * 0.6), opacity: 0.45 + extra() * 0.4 });
      }
    }
    if (debrisCounts !== null) dressDebris(plan, run, rects, keepClear, floorY, debrisCounts, extra);
  }

  if (debrisCounts !== null) {
    for (const [index, rect] of rects.entries()) {
      const count = Math.round(rect.w * rect.d * debrisCounts.open);
      for (let i = 0; i < count; i++) {
        const x = rect.x + (extra() - 0.5) * Math.max(0, rect.w - 1.2), z = rect.z + (extra() - 0.5) * Math.max(0, rect.d - 1.2);
        const pick = extra(), spin = extra() * Math.PI * 2, scale = 0.75 + extra() * 0.5;
        if (!clear(keepClear, x, z, 0.4)) continue;
        plan.debris.push({ id: `floor:${index}:debris:${i}`, position: [x, floorY, z], rotationY: spin, scale, along: "open", pick });
      }
    }
  }

  if (decals !== null) {
    for (const [index, spot] of keepClear.entries()) {
      if (spot.mark !== true) continue;
      const size = spot.radius * 2 + 0.3;
      plan.decals.push({ id: `hazard:${index}`, style: "hazard", surface: "floor", position: [spot.x, floorY + 0.007, spot.z], normal: [0, 1, 0], spin: 0, width: size, height: size, opacity: 0.85 });
    }
  }

  if (decals !== null) {
    for (const [index, rect] of rects.entries()) {
      const area = rect.w * rect.d;
      const place = (style: "dirt" | "wet", count: number, size: [number, number], opacity: [number, number]) => {
        for (let i = 0; i < count; i++) {
          const x = rect.x + (rng() - 0.5) * (rect.w - 0.8), z = rect.z + (rng() - 0.5) * (rect.d - 0.8);
          const s = size[0] + rng() * (size[1] - size[0]);
          plan.decals.push({ id: `floor:${index}:${style}:${i}`, style, surface: "floor", position: [x, floorY + 0.006 + plan.decals.length * 1e-5, z], normal: [0, 1, 0], spin: rng() * Math.PI * 2, width: s, height: s * (0.6 + rng() * 0.6), opacity: opacity[0] + rng() * (opacity[1] - opacity[0]) });
        }
      };
      place("dirt", Math.round(area * decals.floor), [1, 2.6], [0.45, 0.85]);
      place("wet", Math.round(area * decals.wet), [0.8, 2.2], [0.7, 1]);
      const papers = Math.round(area * decals.paper);
      for (let i = 0; i < papers; i++) {
        const x = rect.x + (extra() - 0.5) * (rect.w - 0.8), z = rect.z + (extra() - 0.5) * (rect.d - 0.8);
        const s = 0.5 + extra() * 0.7;
        plan.decals.push({ id: `floor:${index}:paper:${i}`, style: "paper", surface: "floor", position: [x, floorY + 0.006 + plan.decals.length * 1e-5, z], normal: [0, 1, 0], spin: extra() * Math.PI * 2, width: s, height: s, opacity: 0.75 + extra() * 0.25 });
      }
    }
  }
  return plan;
}

/** Fixtures closest to `eye`, nearest first, capped at `budget`: which lamps a fixed light pool lights this frame. */
export function nearestFixtures<T extends { light: Vec3 }>(fixtures: readonly T[], eye: Vec3, budget: number, reach = Infinity): T[] {
  const scored: { fixture: T; distance: number }[] = [];
  for (const fixture of fixtures) {
    const distance = (fixture.light[0] - eye[0]) ** 2 + (fixture.light[1] - eye[1]) ** 2 + (fixture.light[2] - eye[2]) ** 2;
    if (distance <= reach * reach) scored.push({ fixture, distance });
  }
  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, Math.max(0, budget)).map((entry) => entry.fixture);
}
