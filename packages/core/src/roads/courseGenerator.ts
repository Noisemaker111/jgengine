/**
 * The course generator: a seeded, designed point-to-point race course with tagged slots, on the
 * generator contract. It does not wiggle at random. It writes a beat sheet first - an opening
 * straight that hands out the opening drops and ends at the first barricade, then corner complexes
 * from the corner mix (sweepers, right angles, hairpin switchbacks, chicanes) with the shortcuts
 * spread through the middle, straights carrying the climb and the drops, and a finish straight - and
 * then lays it inside the footprint, choosing each turn's side by free space ahead and backtracking
 * when a beat would run into the course already laid.
 *
 * Every shortcut is a bulge on the main line with the chord across it as a narrower branch: shorter,
 * so faster, but carrying a risk slot (a barricade or a timed hazard), while the long way carries a
 * reward drop. Hazards keep their spacing from each other and from the barricades, timed hazards get
 * staggered windows, lane hazards leave a free lane, surface hazards sit on the corners they glaze.
 *
 * The output is a {@link CourseLayout} in the course's own frame (start at the origin heading +z, the
 * footprint `width` across and `depth` ahead): a route course spec whose pieces carry their corner
 * tags, plus slots (hazard, gate, drop, zone, dressing) a game fills with its own content.
 *
 * @capability course-generator generate a designed race course with shortcuts, hazard spacing, set-pieces and fillable slots
 */
import { defineGenerator, type GeneratorContext } from "../generator/generator";
import { defineParamSchema, type ParamField, type ParamsOf } from "../generator/paramSchema";
import { courseDriveTime, courseSlotRisk, courseStopLoss, type CourseCornerKind, type CourseLayout, type CourseSlot } from "./courseLayout";
import { buildRouteCourse, type CourseBranchSpec, type CoursePiece, type CourseSpanCycle } from "./routeCourse";

/** The course generator's output family: a {@link CourseLayout}. */
export const COURSE_OUTPUT = "course";

/** Metres of road laid past the finish line, so a kart crossing it at speed has somewhere to go. */
export const COURSE_RUN_OUT = 30;

/**
 * The course dials.
 * - Shape: `length` (start line to finish), `runUp` (grid road behind the start line), `halfWidth`,
 *   and the footprint the course must stay inside (`width` across, `depth` ahead of the start).
 * - Rhythm: `pace` (turns per km), the corner mix weights, `climb` (metres gained up ramps),
 *   `descents` (steep drop set-pieces, each with a jump on its lip) and `shortcuts`.
 * - Slots: `hazards` and their mix (`timedShare`, `laneShare`, the rest surface), `gates` and their
 *   `jumpShare`, `drops` (`openingDrops` of them packed on the opening straight), `zones` and
 *   `landmarks`.
 */
const COURSE_FIELDS = [
  { type: "seed", key: "seed", label: "seed", default: "course" },
  { type: "range", key: "length", label: "length", group: "shape", min: 300, max: 2000, step: 10, default: 720, unit: "m", explore: [450, 1200] },
  { type: "range", key: "runUp", label: "run-up", group: "shape", min: 0, max: 120, step: 5, default: 60, unit: "m", vary: false },
  { type: "range", key: "halfWidth", label: "half-width", group: "shape", min: 5, max: 14, step: 0.5, default: 9, unit: "m" },
  { type: "range", key: "width", label: "footprint width", group: "shape", min: 160, max: 1200, step: 10, default: 480, unit: "m", vary: false },
  { type: "range", key: "depth", label: "footprint depth", group: "shape", min: 160, max: 1200, step: 10, default: 480, unit: "m", vary: false },
  { type: "range", key: "pace", label: "turns per km", group: "rhythm", min: 3, max: 16, step: 0.5, default: 9 },
  { type: "range", key: "sweepers", label: "sweepers", group: "rhythm", min: 0, max: 1, step: 0.05, default: 0.5 },
  { type: "range", key: "rightAngles", label: "right angles", group: "rhythm", min: 0, max: 1, step: 0.05, default: 0.5 },
  { type: "range", key: "hairpins", label: "hairpins", group: "rhythm", min: 0, max: 1, step: 0.05, default: 0.35 },
  { type: "range", key: "chicanes", label: "chicanes", group: "rhythm", min: 0, max: 1, step: 0.05, default: 0.25 },
  { type: "range", key: "climb", label: "climb", group: "rhythm", min: 0, max: 40, step: 1, default: 0, unit: "m" },
  { type: "range", key: "descents", label: "drops (descents)", group: "rhythm", min: 0, max: 4, step: 1, default: 0 },
  { type: "range", key: "shortcuts", label: "shortcuts", group: "rhythm", min: 0, max: 3, step: 1, default: 1 },
  { type: "range", key: "hazards", label: "hazard slots", group: "slots", min: 0, max: 12, step: 1, default: 5 },
  { type: "range", key: "timedShare", label: "timed hazards", group: "slots", min: 0, max: 1, step: 0.05, default: 0.6 },
  { type: "range", key: "laneShare", label: "lane hazards", group: "slots", min: 0, max: 1, step: 0.05, default: 0.2 },
  { type: "range", key: "gates", label: "barricade slots", group: "slots", min: 0, max: 12, step: 1, default: 5 },
  { type: "range", key: "jumpShare", label: "jumps", group: "slots", min: 0, max: 1, step: 0.05, default: 0.5 },
  { type: "range", key: "drops", label: "drop slots", group: "slots", min: 0, max: 24, step: 1, default: 12 },
  { type: "range", key: "openingDrops", label: "opening drops", group: "slots", min: 0, max: 12, step: 1, default: 8, vary: false },
  { type: "range", key: "zones", label: "zones", group: "slots", min: 1, max: 5, step: 1, default: 3 },
  { type: "range", key: "landmarks", label: "landmark slots", group: "slots", min: 0, max: 16, step: 1, default: 6 },
] as const satisfies readonly ParamField[];

/**
 * The course generator's schema. `meta.theme` names a preset whose values back every dial the meta
 * leaves unset: `causeway` (hairpin switchbacks, timed bursts), `maze` (narrow right angles, lane
 * belts), `climb` (ramps and hairpins up a long rise), `pit` (drops into a low, glazed section) and
 * `sprint` (fast sweepers and a jump).
 */
export const COURSE_SCHEMA = defineParamSchema({
  presetKey: "theme",
  groups: [
    { id: "shape", label: "Shape" },
    { id: "rhythm", label: "Rhythm" },
    { id: "slots", label: "Slots" },
  ],
  presets: [
    { id: "causeway", label: "Causeway", group: "Themes", values: { pace: 8, sweepers: 0.3, rightAngles: 0.2, hairpins: 0.8, chicanes: 0.2, timedShare: 0.7, laneShare: 0, shortcuts: 1 } },
    { id: "maze", label: "Maze", group: "Themes", values: { halfWidth: 8, pace: 13, sweepers: 0.05, rightAngles: 1, hairpins: 0.1, chicanes: 0.4, timedShare: 0.2, laneShare: 0.7, hazards: 6 } },
    { id: "climb", label: "Climb", group: "Themes", values: { pace: 8, sweepers: 0.3, rightAngles: 0.3, hairpins: 0.7, chicanes: 0.1, climb: 26, timedShare: 0.8, laneShare: 0 } },
    { id: "pit", label: "Pit", group: "Themes", values: { halfWidth: 10, pace: 8, sweepers: 0.4, rightAngles: 0.7, hairpins: 0.1, chicanes: 0.3, descents: 2, climb: 10, timedShare: 0.2, laneShare: 0.1 } },
    { id: "sprint", label: "Sprint", group: "Themes", values: { halfWidth: 10, length: 900, width: 620, depth: 720, pace: 5, sweepers: 1, rightAngles: 0.2, hairpins: 0, chicanes: 0.5, descents: 1, shortcuts: 2, gates: 4, hazards: 4 } },
  ],
  fields: COURSE_FIELDS,
});

/** Parsed course params. */
export type CourseParams = ParamsOf<typeof COURSE_SCHEMA>;

const DEG = Math.PI / 180;
/** Metres every laid stretch keeps clear of the walls of any stretch that is not its neighbour. */
const WALL_GAP = 6;
/** Sample spacing of the layout search. */
const SAMPLE = 3;
/** Layout attempts (each a fresh beat sheet) and candidate lays per attempt before giving up. */
const ATTEMPTS = 16;
const LAY_BUDGET = 6000;
/** Least straight between two corner complexes, metres. */
const MIN_STRAIGHT = 22;

const q = (value: number, step: number): number => Math.round(value / step) * step;

interface Template {
  kind: CourseCornerKind;
  /** Degrees; the side is chosen when laid. */
  angle: number;
  radius: number;
  /** Chicane: straight between the two bends. Detour: each leg. */
  leg: number;
  turns: number;
}

function templateLength(t: Template): number {
  const a = t.angle * DEG;
  if (t.kind === "chicane") return 2 * a * t.radius + t.leg;
  if (t.kind === "detour") return 4 * a * t.radius + 2 * t.leg;
  return a * t.radius;
}

function templatePieces(t: Template, side: 1 | -1): CoursePiece[] {
  const turn = (degrees: number): CoursePiece => ({ kind: "turn", angle: degrees * DEG, radius: t.radius, tag: t.kind });
  const straight = (length: number): CoursePiece => ({ kind: "straight", length, tag: t.kind });
  if (t.kind === "chicane") return [turn(side * t.angle), straight(t.leg), turn(-side * t.angle)];
  if (t.kind === "detour") return [turn(side * t.angle), straight(t.leg), turn(-2 * side * t.angle), straight(t.leg), turn(side * t.angle)];
  return [turn(side * t.angle)];
}

interface Beat {
  template: Template;
  /** Planned straight after the complex. */
  straight: number;
}

interface Plan {
  opening: number;
  beats: Beat[];
  finish: number;
}

function pickKind(params: CourseParams, random: () => number, budget: number): CourseCornerKind {
  const weights: [CourseCornerKind, number][] = [
    ["sweeper", params.sweepers],
    ["right-angle", params.rightAngles],
    ["hairpin", params.hairpins],
    ["chicane", budget >= 2 ? params.chicanes : 0],
  ];
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return "right-angle";
  let roll = random() * total;
  for (const [kind, weight] of weights) {
    if (weight <= 0) continue;
    roll -= weight;
    if (roll < 0) return kind;
  }
  return weights.filter(([, weight]) => weight > 0).at(-1)![0];
}

function makeTemplate(kind: CourseCornerKind, hw: number, branchHw: number, random: () => number): Template {
  switch (kind) {
    case "sweeper":
      return { kind, angle: Math.round(30 + random() * 35), radius: q(hw * (4 + random() * 3), 0.5), leg: 0, turns: 1 };
    case "right-angle":
      return { kind, angle: 90, radius: q(hw * (1.7 + random() * 2), 0.5), leg: 0, turns: 1 };
    case "hairpin":
      return { kind, angle: 180, radius: q(hw * (2.4 + random() * 0.6), 0.5), leg: 0, turns: 1 };
    case "chicane":
      return { kind, angle: Math.round(25 + random() * 20), radius: q(hw * (2.6 + random() * 1.4), 0.5), leg: Math.round(6 + random() * 8), turns: 2 };
    case "detour": {
      const angle = Math.round(45 + random() * 20);
      const radius = q(hw * (2 + random() * 0.6), 0.5);
      // The bulge must stand clear of the chord: apex offset = 2R(1 - cos a) + leg sin a.
      const needed = hw + branchHw + WALL_GAP + 2;
      const minLeg = (needed - 2 * radius * (1 - Math.cos(angle * DEG))) / Math.sin(angle * DEG);
      return { kind, angle, radius, leg: Math.max(Math.round(18 + random() * 14), Math.ceil(minLeg)), turns: 3 };
    }
  }
}

function makePlan(params: CourseParams, random: () => number, attempt: number): Plan {
  const hw = params.halfWidth;
  const branchHw = branchHalfWidth(hw);
  const length = params.length;
  const opening = Math.round(Math.min(length * 0.3, Math.max(params.openingDrops * 12 + 30, length * 0.14)));
  const finish = Math.round(Math.max(50, length * 0.08));
  const middle = length - opening - finish;
  // Each later attempt winds a little more: shorter straights between more corners fold into a tight footprint.
  const turnBudget = Math.max(params.shortcuts * 3 + 1, Math.round(params.pace * (length / 1000) * (1 + attempt * 0.1)));
  const templates: Template[] = [];
  let budget = turnBudget - params.shortcuts * 3;
  while (budget > 0) {
    const kind = pickKind(params, random, budget);
    const template = makeTemplate(kind, hw, branchHw, random);
    templates.push(template);
    budget -= template.turns;
  }
  // Spread the shortcuts evenly through the middle of the corner sequence.
  for (let i = 0; i < params.shortcuts; i += 1) {
    const at = Math.round(((i + 1) / (params.shortcuts + 1)) * (templates.length + i));
    templates.splice(Math.min(templates.length, at), 0, makeTemplate("detour", hw, branchHw, random));
  }
  // Too much corner for the length: drop sweepers, then anything but a shortcut, until straights fit.
  const fits = (): boolean => templates.reduce((sum, t) => sum + templateLength(t), 0) + templates.length * MIN_STRAIGHT <= middle;
  while (!fits() && templates.length > params.shortcuts) {
    const drop = templates.findIndex((t) => t.kind === "sweeper") >= 0 ? templates.findIndex((t) => t.kind === "sweeper") : templates.findIndex((t) => t.kind !== "detour");
    if (drop < 0) break;
    templates.splice(drop, 1);
  }
  const arcs = templates.reduce((sum, t) => sum + templateLength(t), 0);
  const spare = Math.max(0, middle - arcs - templates.length * MIN_STRAIGHT);
  const weights = templates.map(() => 0.5 + random());
  const total = weights.reduce((sum, w) => sum + w, 0);
  const beats = templates.map((template, index) => ({ template, straight: MIN_STRAIGHT + (total > 0 ? (spare * weights[index]!) / total : 0) }));
  return { opening, beats, finish };
}

function branchHalfWidth(hw: number): number {
  return q(hw * 0.62, 0.5);
}

interface Pose {
  x: number;
  z: number;
  heading: number;
}

interface Sample {
  x: number;
  z: number;
  /** Main-line range this sample stands for (a chord sample spans its junctions). */
  lo: number;
  hi: number;
}

/** Lay pieces from a pose: samples every SAMPLE metres and the end pose. */
function lay(pose: Pose, pieces: readonly CoursePiece[], s0: number): { end: Pose; points: { x: number; z: number; s: number }[]; length: number } {
  let { x, z, heading } = pose;
  let s = s0;
  const points: { x: number; z: number; s: number }[] = [];
  for (const piece of pieces) {
    const length = piece.kind === "straight" ? piece.length : Math.abs(piece.angle) * piece.radius;
    const n = Math.max(1, Math.ceil(length / SAMPLE));
    const left: [number, number] = [Math.cos(heading), -Math.sin(heading)];
    const sign = piece.kind === "turn" && piece.angle < 0 ? -1 : 1;
    const cx = piece.kind === "turn" ? x + sign * piece.radius * left[0] : 0;
    const cz = piece.kind === "turn" ? z + sign * piece.radius * left[1] : 0;
    const h0 = heading;
    const x0 = x;
    const z0 = z;
    for (let i = 1; i <= n; i += 1) {
      const f = i / n;
      if (piece.kind === "straight") {
        x = x0 + Math.sin(h0) * length * f;
        z = z0 + Math.cos(h0) * length * f;
      } else {
        const h = h0 + piece.angle * f;
        x = cx - sign * piece.radius * Math.cos(h);
        z = cz + sign * piece.radius * Math.sin(h);
      }
      points.push({ x, z, s: s + length * f });
    }
    if (piece.kind === "turn") heading = h0 + piece.angle;
    s += length;
  }
  return { end: { x, z, heading }, points, length: s - s0 };
}

const CELL = 24;

/** Laid samples in a coarse grid, for clearance checks. */
class SampleGrid {
  private cells = new Map<string, Sample[]>();
  readonly all: Sample[] = [];
  add(sample: Sample): void {
    const key = `${Math.floor(sample.x / CELL)},${Math.floor(sample.z / CELL)}`;
    const list = this.cells.get(key);
    if (list === undefined) this.cells.set(key, [sample]);
    else list.push(sample);
    this.all.push(sample);
  }
  /** Least distance from (x, z) to a sample whose main-line range is more than `exclude` metres from `s`. */
  nearest(x: number, z: number, s: number, exclude: number, reach: number): number {
    let best = Number.POSITIVE_INFINITY;
    const r = Math.ceil(reach / CELL);
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let i = cx - r; i <= cx + r; i += 1) {
      for (let j = cz - r; j <= cz + r; j += 1) {
        const list = this.cells.get(`${i},${j}`);
        if (list === undefined) continue;
        for (const sample of list) {
          if (s > sample.lo - exclude && s < sample.hi + exclude) continue;
          const d = Math.hypot(sample.x - x, sample.z - z);
          if (d < best) best = d;
        }
      }
    }
    return best;
  }
  /** Drop every sample after the first `count` (a backtrack). */
  truncate(count: number): void {
    while (this.all.length > count) {
      const sample = this.all.pop()!;
      const key = `${Math.floor(sample.x / CELL)},${Math.floor(sample.z / CELL)}`;
      this.cells.get(key)!.pop();
    }
  }
}

interface Laid {
  pieces: CoursePiece[];
  /** Each beat's pieces start and end in main-line metres, and its template. */
  beats: { from: number; to: number; template: Template; side: 1 | -1; straightFrom: number }[];
  /** Main-line metres the opening straight ends and the finish straight starts. */
  openingEnd: number;
  finishFrom: number;
  length: number;
}

/**
 * Lay a plan inside the footprint: each beat tries both sides and, when the box or the course already
 * laid is in the way, a shorter straight (the rest carried to the next one), then backtracks.
 */
function layPlan(params: CourseParams, plan: Plan, random: () => number): Laid | null {
  const hw = params.halfWidth;
  const halfX = params.width / 2 - hw - 4;
  const maxZ = params.depth - hw - 4;
  const minZ = hw + 4;
  const clear = 2 * hw + WALL_GAP;
  const exclude = clear * 2.5;
  const grid = new SampleGrid();
  const openingPieces: CoursePiece[] = [];
  if (params.runUp > 0) openingPieces.push({ kind: "straight", length: params.runUp });
  openingPieces.push({ kind: "straight", length: plan.opening });
  const opening = lay({ x: 0, z: 0, heading: 0 }, openingPieces, 0);
  if (opening.end.z > maxZ) return null;
  grid.add({ x: 0, z: 0, lo: 0, hi: 0 });
  for (const point of opening.points) grid.add({ x: point.x, z: point.z, lo: point.s, hi: point.s });
  const openingEnd = opening.length;
  let lays = 0;

  const inBox = (x: number, z: number): boolean => Math.abs(x) <= halfX && z >= minZ && z <= maxZ;
  const freeAhead = (pose: Pose): number => {
    const dx = Math.sin(pose.heading);
    const dz = Math.cos(pose.heading);
    let t = 400;
    if (dx > 1e-6) t = Math.min(t, (halfX - pose.x) / dx);
    if (dx < -1e-6) t = Math.min(t, (-halfX - pose.x) / dx);
    if (dz > 1e-6) t = Math.min(t, (maxZ - pose.z) / dz);
    if (dz < -1e-6) t = Math.min(t, (minZ - pose.z) / dz);
    return Math.max(0, t);
  };

  /** Lay pieces at `s`: the samples if every one is in the box and clear of the course laid so far. */
  function tryLay(pose: Pose, pieces: readonly CoursePiece[], s: number) {
    lays += 1;
    const laid = lay(pose, pieces, s);
    for (const point of laid.points) {
      if (!inBox(point.x, point.z)) return null;
      if (grid.nearest(point.x, point.z, point.s, exclude, clear) < clear) return null;
    }
    return laid;
  }

  const result: Laid = { pieces: [...openingPieces], beats: [], openingEnd, finishFrom: 0, length: 0 };

  const beats = [...plan.beats];
  let fillers = 0;
  const fillerKinds: CourseCornerKind[] = params.hairpins > 0 ? ["right-angle", "hairpin"] : ["right-angle", "sweeper"];

  function place(index: number, pose: Pose, s: number, carry: number): boolean {
    if (lays > LAY_BUDGET) return false;
    if (index === beats.length) {
      const finishPieces: CoursePiece[] = [{ kind: "straight", length: Math.round(plan.finish + carry + COURSE_RUN_OUT) }];
      const laid = tryLay(pose, finishPieces, s);
      if (laid !== null) {
        result.pieces.push(...finishPieces);
        result.finishFrom = s;
        result.length = s + laid.length;
        return true;
      }
      // The straights the box made shorter left road over: wind it in with one more corner.
      if (fillers >= 8 || carry < MIN_STRAIGHT * 2) return false;
      for (const kind of fillerKinds) {
        const template = makeTemplate(kind, hw, branchHalfWidth(hw), random);
        const spend = Math.min(carry - MIN_STRAIGHT, Math.max(MIN_STRAIGHT, carry * 0.5)) - templateLength(template);
        if (spend < MIN_STRAIGHT * 0.6) continue;
        beats.push({ template, straight: spend });
        fillers += 1;
        if (place(index, pose, s, carry - spend - templateLength(template))) return true;
        beats.pop();
        fillers -= 1;
        if (lays > LAY_BUDGET) return false;
      }
      return false;
    }
    const beat = beats[index]!;
    const options: { side: 1 | -1; scale: number; score: number; pieces: CoursePiece[]; corner: number; laid: ReturnType<typeof lay> }[] = [];
    for (const scale of [1, 0.7, 0.45, 0.2]) {
      const want = beat.straight + carry;
      const straight = Math.max(MIN_STRAIGHT * 0.6, Math.round(want * scale));
      for (const side of [1, -1] as const) {
        const corner = templatePieces(beat.template, side);
        const pieces = [...corner, { kind: "straight" as const, length: straight }];
        const laid = tryLay(pose, pieces, s);
        if (laid === null) continue;
        const cornerLength = templateLength(beat.template);
        const ahead = freeAhead(laid.end);
        const probe = { x: laid.end.x + Math.sin(laid.end.heading) * 40, z: laid.end.z + Math.cos(laid.end.heading) * 40 };
        const room = Math.min(120, grid.nearest(probe.x, probe.z, s + laid.length + 40, exclude, 120));
        const score = Math.round((Math.min(ahead, 300) + room * 0.5 + random() * 120) * 1000) / 1000;
        options.push({ side, scale, score, pieces, corner: cornerLength, laid });
      }
    }
    options.sort((a, b) => b.scale - a.scale || b.score - a.score || a.side - b.side);
    for (const option of options) {
      const mark = grid.all.length;
      for (const point of option.laid.points) grid.add({ x: point.x, z: point.z, lo: point.s, hi: point.s });
      const straightLength = (option.pieces.at(-1) as { length: number }).length;
      if (beat.template.kind === "detour") {
        // The shortcut's chord, between the bulge's two junctions, keeps clear of everything else.
        const a = { x: pose.x, z: pose.z };
        const end = s + option.corner;
        const b = lay(pose, option.pieces.slice(0, -1), s).end;
        const chord = Math.hypot(b.x - a.x, b.z - a.z);
        let blocked = false;
        for (let d = SAMPLE; d < chord; d += SAMPLE) {
          const x = a.x + ((b.x - a.x) * d) / chord;
          const z = a.z + ((b.z - a.z) * d) / chord;
          if (grid.nearest(x, z, (s + end) / 2, (end - s) / 2 + exclude, clear) < clear) blocked = true;
        }
        if (!blocked) for (let d = SAMPLE; d < chord; d += SAMPLE) grid.add({ x: a.x + ((b.x - a.x) * d) / chord, z: a.z + ((b.z - a.z) * d) / chord, lo: s, hi: end });
        if (blocked) {
          grid.truncate(mark);
          continue;
        }
      }
      const piecesMark = result.pieces.length;
      result.pieces.push(...option.pieces);
      result.beats.push({ from: s, to: s + option.laid.length, template: beat.template, side: option.side, straightFrom: s + option.corner });
      const nextCarry = beat.straight + carry - straightLength;
      if (place(index + 1, option.laid.end, s + option.laid.length, nextCarry)) return true;
      result.pieces.length = piecesMark;
      result.beats.pop();
      grid.truncate(mark);
      if (lays > LAY_BUDGET) return false;
    }
    return false;
  }

  const placed = place(0, opening.end, openingEnd, 0);
  return placed ? result : null;
}

/** A plain straight of a laid course (not inside a chicane or a shortcut's bulge): its piece index and main-line range. */
interface StraightRun {
  piece: number;
  from: number;
  to: number;
}

function straightRuns(laid: Laid): StraightRun[] {
  const runs: StraightRun[] = [];
  let s = 0;
  laid.pieces.forEach((piece, index) => {
    const length = piece.kind === "straight" ? piece.length : Math.abs(piece.angle) * piece.radius;
    if (piece.kind === "straight" && (piece.tag === undefined || piece.tag === "ramp" || piece.tag === "descent")) runs.push({ piece: index, from: s, to: s + length });
    s += length;
  });
  return runs;
}

/** Ramps and drops: the climb rides the longest middle straights, each descent a straight of its own. */
function shapeElevation(params: CourseParams, laid: Laid, random: () => number): void {
  const middle = straightRuns(laid).filter((run) => run.from >= laid.openingEnd - 1 && run.to <= laid.finishFrom + 1);
  // A climb may also ride the finish straight: a drag up to the line.
  const climbable = straightRuns(laid).filter((run) => run.from >= laid.openingEnd - 1);
  const descents: StraightRun[] = [];
  if (params.descents > 0) {
    const fit = middle.filter((run) => run.to - run.from >= 32);
    for (let i = 0; i < params.descents && fit.length > 0; i += 1) {
      // Spread the drops: the candidate nearest each even target.
      const target = laid.openingEnd + ((i + 0.5) / params.descents) * (laid.finishFrom - laid.openingEnd);
      fit.sort((a, b) => Math.abs((a.from + a.to) / 2 - target) - Math.abs((b.from + b.to) / 2 - target) || a.piece - b.piece);
      descents.push(fit.shift()!);
    }
    for (const run of descents) {
      const piece = laid.pieces[run.piece] as Extract<CoursePiece, { kind: "straight" }>;
      laid.pieces[run.piece] = { ...piece, rise: -Math.min(q(4.5 + random() * 4, 0.5), q((run.to - run.from) * 0.22, 0.5)), tag: "descent" };
    }
  }
  if (params.climb > 0) {
    const ramps = climbable.filter((run) => !descents.some((descent) => descent.piece === run.piece)).sort((a, b) => b.to - b.from - (a.to - a.from) || a.piece - b.piece);
    const chosen: StraightRun[] = [];
    let room = 0;
    for (const run of ramps) {
      if (room >= params.climb / 0.08) break;
      chosen.push(run);
      room += run.to - run.from;
    }
    const climb = Math.min(params.climb, room * 0.1);
    for (const run of chosen) {
      const piece = laid.pieces[run.piece] as Extract<CoursePiece, { kind: "straight" }>;
      laid.pieces[run.piece] = { ...piece, rise: q((climb * (run.to - run.from)) / room, 0.1), tag: "ramp" };
    }
  }
}

interface Occupied {
  from: number;
  to: number;
}

/** Fill the slots: opening drops and the first barricade, shortcut risks and rewards, drop lips, then the rest spread with spacing. */
function placeSlots(params: CourseParams, laid: Laid, startLine: number, finish: number, branches: readonly CourseBranchSpec[], savings: readonly number[], random: () => number): CourseSlot[] {
  const hw = params.halfWidth;
  const end = finish;
  const slots: CourseSlot[] = [];
  const events: Occupied[] = [];
  const timedSpans: Occupied[] = [];
  const hazardSpans: Occupied[] = [];
  const free = (at: number, gap: number): boolean => events.every((event) => at < event.from - gap || at > event.to + gap);
  const inSpan = (at: number, spans: readonly Occupied[], gap: number): boolean => spans.some((span) => at > span.from - gap && at < span.to + gap);
  const branchAt = (at: number): boolean => branches.some((branch) => at > branch.from - 8 && at < branch.to + 8);
  let gatesLeft = params.gates;
  let hazardsLeft = params.hazards;
  let dropsLeft = params.drops;
  let jumpsLeft = Math.round(params.gates * params.jumpShare);

  // Straights a barricade or a burst can stand on: away from the corner behind and the one ahead.
  // The opening straight is the calm hand-out of the opening drops; the course proper starts after it.
  const middleFrom = laid.openingEnd;
  const runsWithin = (behind: number, ahead: number): Occupied[] =>
    straightRuns(laid)
      .map((run) => ({ from: Math.max(run.from + behind, middleFrom + 10), to: Math.min(run.to - ahead, end - 10) }))
      .filter((run) => run.to > run.from);
  const runs = runsWithin(20, 12);
  // A crowded course (a maze of short straights) relaxes the spacing a step at a time.
  const levels = [
    { gap: 1, runs },
    { gap: 0.7, runs: runsWithin(14, 8) },
    { gap: 0.4, runs: runsWithin(8, 6) },
  ];
  const onRun = (at: number): boolean => runs.some((run) => at >= run.from && at <= run.to);
  const bestOn = (spans: readonly Occupied[], target: number, ok: (at: number) => boolean): number | null => {
    let best: number | null = null;
    for (const run of spans) {
      for (let at = Math.ceil(run.from); at <= run.to; at += 2) {
        if (!ok(at)) continue;
        if (best === null || Math.abs(at - target) < Math.abs(best - target)) best = at;
      }
    }
    return best;
  };
  /**
   * The free point nearest `target`, keeping `gap` from every event, `buffer` from every `avoid`
   * span and off the shortcuts: on a straight first, then at relaxed spacing, and with `anywhere`
   * finally on any stretch of the middle, corners included.
   */
  const nearestFree = (target: number, gap: number, avoid: readonly Occupied[] = [], buffer = 8, anywhere = false): number | null => {
    for (const level of levels) {
      const ok = (at: number): boolean => free(at, gap * level.gap) && !branchAt(at) && !inSpan(at, avoid, buffer * level.gap);
      const found = bestOn(level.runs, target, ok);
      if (found !== null) return found;
    }
    return anywhere ? bestOn([{ from: middleFrom + 10, to: end - 10 }], target, (at) => free(at, gap * 0.4) && !branchAt(at) && !inSpan(at, avoid, buffer * 0.4)) : null;
  };

  // 1. Opening drops, 12 m apart from 10 m past the start line, lanes weaving.
  const openingDrops = Math.min(params.openingDrops, dropsLeft);
  const lanes = [0, -1.5, 1.5, -1, 1, 0, -1, 0];
  for (let i = 0; i < openingDrops; i += 1) {
    slots.push({ id: "", kind: "drop", role: "opening", at: startLine + 10 + 12 * i, offset: lanes[i % lanes.length]! });
  }
  dropsLeft -= openingDrops;
  // 2. The first barricade closes the opening straight: smash through to start the course proper.
  if (gatesLeft > 0) {
    const at = Math.round(Math.min(laid.openingEnd - 12, Math.max(startLine + 10 + 12 * openingDrops + 2, startLine + (laid.openingEnd - startLine) * 0.6)));
    slots.push({ id: "", kind: "gate", role: "block", at });
    events.push({ from: at, to: at });
    gatesLeft -= 1;
  }
  // 3. Every shortcut risks something on the chord, sized to what it saves; the long way round pays a reward drop.
  const stop = courseStopLoss();
  branches.forEach((branch, index) => {
    const route = branch.id;
    const chord = branch.to - branch.from;
    const saving = savings[index] ?? 0;
    const gateCovers = courseSlotRisk({ id: "", kind: "gate", role: "block", at: 0 }) >= saving + 0.25;
    const preferHazard = index % 2 === 1 || !gateCovers;
    if (gatesLeft > 0 && (!preferHazard || hazardsLeft <= 0)) {
      const jump = index % 2 === 0 && jumpsLeft > 0;
      slots.push({ id: "", kind: "gate", role: jump ? "jump" : "block", route, at: 0, data: { shortcut: route } });
      if (jump) jumpsLeft -= 1;
      gatesLeft -= 1;
    } else if (hazardsLeft > 0) {
      // A window long enough that catching it costs more than the shortcut saves, with a gap still worth waiting for.
      const active = q(Math.max(2, saving - stop + 0.75), 0.1);
      const period = q(Math.max(6, active / 0.45) + random() * 2, 0.5);
      slots.push({ id: "", kind: "hazard", role: "timed", route, at: 0, to: 0, cycle: { period, active, phase: q(random() * period, 0.1) }, data: { shortcut: route } });
      hazardsLeft -= 1;
    }
    if (dropsLeft > 0) {
      slots.push({ id: "", kind: "drop", role: "reward", at: Math.round(branch.from + chord / 2), offset: 0, data: { shortcut: route } });
      dropsLeft -= 1;
    }
  });
  // 4. Each drop set-piece: a jump off its lip.
  laid.pieces.forEach((piece, index) => {
    if (piece.kind !== "straight" || piece.tag !== "descent" || gatesLeft <= 0) return;
    const at = Math.round(pieceStart(laid.pieces, index) + 4);
    slots.push({ id: "", kind: "gate", role: "jump", at, data: { setPiece: "drop-lip" } });
    events.push({ from: at, to: at });
    gatesLeft -= 1;
    jumpsLeft -= 1;
  });
  // 5. The rest of the barricades, spread evenly; jumps and blocks alternate toward the jump share.
  const gatesToPlace = gatesLeft;
  for (let i = 0; i < gatesToPlace; i += 1) {
    const target = middleFrom + ((i + 0.5) / gatesToPlace) * (end - middleFrom);
    const at = nearestFree(target, 35, hazardSpans, 8, true);
    if (at === null) break;
    const jump = jumpsLeft > 0 && (jumpsLeft >= gatesToPlace - i || i % 2 === 0);
    slots.push({ id: "", kind: "gate", role: jump ? "jump" : "block", at });
    events.push({ from: at, to: at });
    if (jump) jumpsLeft -= 1;
    gatesLeft -= 1;
  }
  // 6. Hazards by role, spread evenly: timed bursts on straights, lane belts along a side, surfaces on the tight corners.
  const shares = [params.timedShare, params.laneShare, Math.max(0, 1 - params.timedShare - params.laneShare)];
  const shareTotal = shares[0]! + shares[1]! + shares[2]!;
  const roles: ("timed" | "lane" | "surface")[] = [];
  const counts = [0, 0, 0];
  for (let i = 0; i < hazardsLeft; i += 1) {
    // Largest remaining deficit first: the mix holds at any count.
    let pick = 0;
    let worst = -Infinity;
    for (let r = 0; r < 3; r += 1) {
      const want = shareTotal > 0 ? (shares[r]! / shareTotal) * (i + 1) : r === 0 ? i + 1 : 0;
      const deficit = Math.round((want - counts[r]!) * 1e6);
      if (deficit > worst) {
        worst = deficit;
        pick = r;
      }
    }
    counts[pick] = counts[pick]! + 1;
    roles.push((["timed", "lane", "surface"] as const)[pick]!);
  }
  const corners = laid.beats
    .filter((beat) => beat.template.kind === "hairpin" || beat.template.kind === "right-angle")
    .map((beat) => ({ from: beat.from, to: beat.straightFrom }));
  let side = 1;
  roles.forEach((role, i) => {
    const target = middleFrom + ((i + 0.5) / roles.length) * (end - middleFrom);
    if (role === "surface") {
      const open = corners.filter((corner) => !inSpan((corner.from + corner.to) / 2, hazardSpans, 10) && !branchAt(corner.from) && !branchAt(corner.to));
      open.sort((a, b) => Math.abs(a.from - target) - Math.abs(b.from - target) || a.from - b.from);
      const corner = open[0];
      if (corner !== undefined) {
        const span = { from: Math.round(corner.from - 4), to: Math.round(corner.to + 4) };
        slots.push({ id: "", kind: "hazard", role, at: span.from, to: span.to });
        hazardSpans.push(span);
        return;
      }
    }
    if (role === "lane") {
      const length = Math.round(40 + random() * 30);
      const at = nearestFree(target, 6, hazardSpans);
      if (at !== null && onRun(at) && at + length < end) {
        const band: [number, number] = side > 0 ? [q(hw * 0.15, 0.5), hw] : [-hw, -q(hw * 0.15, 0.5)];
        side = -side;
        const span = { from: at, to: Math.min(at + length, end) };
        slots.push({ id: "", kind: "hazard", role, at: span.from, to: span.to, band });
        hazardSpans.push(span);
        return;
      }
    }
    // Timed (and any role that found no place of its own): a burst across a straight on a staggered window.
    const length = Math.round(10 + random() * 6);
    // The whole burst, not just its start, keeps clear: of other hazards, 22 m of every other burst, and the barricades.
    const avoid = [
      ...hazardSpans.map((span) => ({ from: span.from - length, to: span.to })),
      ...timedSpans.map((span) => ({ from: span.from - 22 - length, to: span.to + 22 })),
      ...events.map((event) => ({ from: event.from - length - 8, to: event.to + 8 })),
    ];
    const at = nearestFree(target, 30, avoid, 4, true);
    if (at === null) return;
    const period = q(6 + random() * 6, 0.5);
    const cycle: CourseSpanCycle = { period, active: q(period * (0.3 + random() * 0.1), 0.1), phase: q((i * 2.7) % period, 0.1) };
    const span = { from: at, to: at + length };
    slots.push({ id: "", kind: "hazard", role: "timed", at: span.from, to: span.to, cycle });
    timedSpans.push(span);
    hazardSpans.push(span);
    events.push(span);
  });
  // 7. Drops along the line, spread evenly, clear of the barricades and the timed bursts.
  for (let i = 0; i < dropsLeft; i += 1) {
    const target = middleFrom + ((i + 0.5) / dropsLeft) * (end - middleFrom);
    let best: number | null = null;
    for (let at = Math.ceil(middleFrom); at < end; at += 2) {
      if (!free(at, 8) || inSpan(at, timedSpans, 6) || branchAt(at)) continue;
      if (best === null || Math.abs(at - target) < Math.abs(best - target)) best = at;
    }
    if (best === null) break;
    slots.push({ id: "", kind: "drop", role: "line", at: best, offset: i % 2 === 0 ? 1 : -1 });
    events.push({ from: best, to: best });
  }
  // 8. Zones: even sections of the run, each seam moved to the nearest corner.
  const seams = [startLine];
  for (let k = 1; k < params.zones; k += 1) {
    const target = startLine + (k / params.zones) * (finish - startLine);
    const near = laid.beats.map((beat) => beat.from).sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0];
    seams.push(near !== undefined && Math.abs(near - target) < 80 && near > seams.at(-1)! + 40 ? Math.round(near) : Math.round(target));
  }
  seams.push(finish);
  for (let k = 0; k < params.zones; k += 1) slots.push({ id: "", kind: "zone", role: "section", at: seams[k]!, to: seams[k + 1]! });
  // 9. Landmarks: outside the biggest corners first, one at the finish, the rest beside the straights.
  const big = [...laid.beats].sort((a, b) => b.template.angle - a.template.angle || a.from - b.from);
  let marks = params.landmarks;
  for (const beat of big) {
    if (marks <= 1 || beat.template.kind === "chicane") continue;
    const mid = (beat.from + beat.straightFrom) / 2;
    const turnSide = beat.template.kind === "detour" ? -beat.side : beat.side;
    slots.push({ id: "", kind: "dressing", role: "corner", at: Math.round(mid), offset: -turnSide * Math.round(hw + 14 + random() * 10) });
    marks -= 1;
    if (marks <= Math.floor(params.landmarks / 3)) break;
  }
  if (marks > 0) {
    slots.push({ id: "", kind: "dressing", role: "finish", at: finish, offset: Math.round(hw + 5) });
    marks -= 1;
  }
  const straightTargets = runs.filter((run) => run.to - run.from > 20);
  for (let i = 0; marks > 0 && straightTargets.length > 0; i += 1, marks -= 1) {
    const run = straightTargets[i % straightTargets.length]!;
    slots.push({ id: "", kind: "dressing", role: "straight", at: Math.round((run.from + run.to) / 2 + (i >= straightTargets.length ? 8 : 0)), offset: (i % 2 === 0 ? 1 : -1) * Math.round(hw + 12) });
  }

  // Name the slots by kind in course order.
  const order = (slot: CourseSlot): number => (slot.route === undefined ? slot.at : (branches.find((branch) => branch.id === slot.route)?.from ?? 0) + 0.5);
  const sorted = slots.map((slot, index) => ({ slot, index })).sort((a, b) => a.slot.kind.localeCompare(b.slot.kind) || order(a.slot) - order(b.slot) || a.index - b.index);
  const counter: Record<string, number> = {};
  return sorted.map(({ slot }) => {
    counter[slot.kind] = (counter[slot.kind] ?? 0) + 1;
    return { ...slot, id: `${slot.kind}-${counter[slot.kind]}` };
  });
}

function pieceStart(pieces: readonly CoursePiece[], index: number): number {
  let s = 0;
  for (let i = 0; i < index; i += 1) {
    const piece = pieces[i]!;
    s += piece.kind === "straight" ? piece.length : Math.abs(piece.angle) * piece.radius;
  }
  return s;
}

/** Shortcut branches: the chord across every detour, narrower than the main line. */
function shortcutBranches(params: CourseParams, laid: Laid): CourseBranchSpec[] {
  return laid.beats
    .filter((beat) => beat.template.kind === "detour")
    .map((beat, index) => ({ id: `shortcut-${index + 1}`, from: Math.round(beat.from * 1000) / 1000, to: Math.round(beat.straightFrom * 1000) / 1000, halfWidth: branchHalfWidth(params.halfWidth), tag: "shortcut" }));
}

/** Branch-local metres of a risk slot on a chord: the middle, or the timed burst's span across it. */
function settleBranchSlots(slots: CourseSlot[], branches: readonly CourseBranchSpec[], chordLength: (branch: CourseBranchSpec) => number): CourseSlot[] {
  return slots.map((slot) => {
    if (slot.route === undefined) return slot;
    const branch = branches.find((entry) => entry.id === slot.route)!;
    const length = chordLength(branch);
    if (slot.kind === "hazard") return { ...slot, at: Math.round(length * 0.4), to: Math.round(length * 0.4 + 10) };
    return { ...slot, at: Math.round(length * 0.5) };
  });
}

/** Generate one course layout from parsed params and a seed. Pure and deterministic. */
export function generateCourse(params: CourseParams, context: Pick<GeneratorContext, "random">): CourseLayout {
  const hw = params.halfWidth;
  let laid: Laid | null = null;
  for (let attempt = 0; attempt < ATTEMPTS && laid === null; attempt += 1) {
    const plan = makePlan(params, context.random(`plan-${attempt}`), attempt);
    laid = layPlan(params, plan, context.random(`lay-${attempt}`));
  }
  if (laid === null) {
    // Nothing fits the footprint: a straight as long as the footprint allows.
    const length = Math.max(60, params.depth - 2 * hw - 8);
    laid = { pieces: [{ kind: "straight", length }], beats: [], openingEnd: Math.min(length, params.runUp + 40), finishFrom: Math.max(0, length - COURSE_RUN_OUT - 20), length };
  }
  shapeElevation(params, laid, context.random("elevation"));
  const branches = shortcutBranches(params, laid);
  const startLine = Math.min(params.runUp, laid.openingEnd);
  const finish = Math.round((laid.length - COURSE_RUN_OUT) * 1000) / 1000;
  // What each shortcut saves over the long way, in sim seconds: its risk slot is sized to it.
  const bare = buildRouteCourse({ start: { x: 0, z: 0, heading: 0 }, halfWidth: hw, pieces: laid.pieces, branches });
  const longWay = branches.length > 0 ? courseDriveTime(bare, { from: startLine, to: finish }) : 0;
  const savings = branches.map((branch) => longWay - courseDriveTime(bare, { from: startLine, to: finish, take: [branch.id] }));
  const slots = placeSlots(params, laid, startLine, finish, branches, savings, context.random("slots"));
  // Chords are straight lines between the junctions: their length is the distance between them.
  const junctions = lay({ x: 0, z: 0, heading: 0 }, laid.pieces, 0).points;
  const pointAt = (s: number): { x: number; z: number } => {
    let best = junctions[0]!;
    for (const point of junctions) if (Math.abs(point.s - s) < Math.abs(best.s - s)) best = point;
    return best;
  };
  const settled = settleBranchSlots(slots, branches, (branch) => {
    const a = pointAt(branch.from);
    const b = pointAt(branch.to);
    return Math.hypot(b.x - a.x, b.z - a.z);
  });
  return {
    spec: { start: { x: 0, z: 0, heading: 0 }, halfWidth: hw, pieces: laid.pieces, branches },
    startLine,
    finish,
    slots: settled,
  };
}

/**
 * The course generator: a designed, seeded race course with shortcuts, hazard spacing, drop
 * set-pieces and fillable slots, inside a footprint. Its output previews in the editor's variant grid
 * and backs the `course` scene kind.
 *
 * @capability course-generator generate a designed race course with shortcuts, hazard spacing, set-pieces and fillable slots
 */
export const COURSE_GENERATOR = defineGenerator({
  id: "course",
  label: "Race course",
  output: COURSE_OUTPUT,
  schema: COURSE_SCHEMA,
  generate(params, context): CourseLayout {
    return generateCourse(params, context);
  },
});
