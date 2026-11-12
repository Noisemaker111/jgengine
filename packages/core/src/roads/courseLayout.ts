/**
 * A course layout is a route course plus the slots a game fills with its own content: where the
 * hazards, barricades, pickups, zones and dressing go, and what each one is for (a timed burst across
 * the road, a lane-wide belt, a jump, a reward on the long way round). The course generator
 * (`COURSE_GENERATOR`) writes one, the `course` scene kind stores one, and a game reads its slots by
 * `kind` and `role` and decides what stands there: a slag spurt or a freight train in a `timed`
 * hazard slot, a tyre ramp or a container gap in a `jump` gate slot.
 *
 * Slot positions are route-local metres (`at`, and `to` for a span), the same metres
 * {@link RouteCourse.pointAt} takes, so a slot on a shortcut stays on the shortcut. Hazard and zone
 * slots become tagged spans on the built course (tag = slot kind), read back with `spansAt`.
 *
 * This module also measures a layout and checks that it is playable: it can be driven start to
 * finish, nothing runs into itself, every hazard can be beaten (a window in its cycle, a free lane, or
 * it only slows), and every shortcut both saves time and risks it, measured in sim seconds.
 *
 * @capability course-layout route course with tagged hazard/gate/drop/zone/dressing slots, playability check and drive-time sim
 */
import { buildRouteCourse, MAIN_ROUTE, type CourseFix, type CourseSpanCycle, type CourseSpanSpec, type CourseVec2, type RouteCourse, type RouteCourseSpec } from "./routeCourse";

/** What a slot holds. */
export type CourseSlotKind = "hazard" | "gate" | "drop" | "zone" | "dressing";

/** Every slot kind, in the order a layout lists them. */
export const COURSE_SLOT_KINDS: readonly CourseSlotKind[] = ["hazard", "gate", "drop", "zone", "dressing"];

/**
 * The roles the generator writes, per kind. A game may author any role string of its own; these are
 * the ones the playability check understands.
 * - hazard `timed`: across the whole road on a cycle (beat it in the gap); `lane`: part of the width,
 *   always on (take the free lane); `surface`: the whole width, always on, only slows (drive through).
 * - gate `jump`: a barricade cleared by jumping; `block`: one that must be smashed or avoided.
 * - drop `opening`: packed on the opening straight; `line`: along the racing line; `reward`: on the
 *   long way round a shortcut.
 * - zone `section`; dressing `corner` (outside a big corner), `straight`, `finish`.
 */
export const COURSE_SLOT_ROLES = {
  hazard: ["timed", "lane", "surface"],
  gate: ["jump", "block"],
  drop: ["opening", "line", "reward"],
  zone: ["section"],
  dressing: ["corner", "straight", "finish"],
} as const satisfies Readonly<Record<CourseSlotKind, readonly string[]>>;

/** One place on a course a game fills with content. */
export interface CourseSlot {
  id: string;
  kind: CourseSlotKind;
  /** What the slot is for (see {@link COURSE_SLOT_ROLES}). */
  role: string;
  /** Route id; default the main line. */
  route?: string;
  /** Route-local metres: a point slot's place, a span slot's start. */
  at: number;
  /** Route-local metres where a span slot (hazard, zone) ends. */
  to?: number;
  /** Metres off the centreline, positive left: a drop's lane, a dressing prop's side. */
  offset?: number;
  /** Lateral band `[min, max]` a hazard covers; default the whole width. */
  band?: readonly [number, number];
  /**
   * A fixed `[x, z]` for a slot that stands off the road (a landmark across the lake): world space in
   * a layout, course-local in a `course` marker's meta (see `courseLayoutFromMeta`). `at` still names
   * the stretch of road it belongs to.
   */
  position?: CourseVec2;
  /** A timed hazard's window. */
  cycle?: CourseSpanCycle;
  /** Placed by hand over the generator's layout. */
  pinned?: boolean;
  /** Game content the slot carries (hazard kind, a label); the course never reads it. */
  data?: Readonly<Record<string, string | number | boolean>>;
}

/** A course and its slots: everything a game needs to lay the road and fill it. */
export interface CourseLayout {
  /** The main line and its branches. Spans for hazard and zone slots are added by {@link buildCourseLayout}. */
  spec: RouteCourseSpec;
  /** Main-line metres of the start line; behind it is the grid's run-up. */
  startLine: number;
  /** Main-line metres of the finish line. */
  finish: number;
  slots: readonly CourseSlot[];
}

/** The spans a layout's hazard and zone slots become: tag = slot kind, `data.role` = the slot's role. */
export function courseSlotSpans(slots: readonly CourseSlot[]): CourseSpanSpec[] {
  return slots
    .filter((slot) => (slot.kind === "hazard" || slot.kind === "zone") && slot.to !== undefined)
    .map((slot) => ({
      id: slot.id,
      tag: slot.kind,
      route: slot.route ?? MAIN_ROUTE,
      from: slot.at,
      to: slot.to!,
      ...(slot.band === undefined ? {} : { offset: slot.band }),
      ...(slot.cycle === undefined ? {} : { cycle: slot.cycle }),
      data: { role: slot.role, ...slot.data },
    }));
}

/** Build a layout's course with its hazard and zone slots as spans. */
export function buildCourseLayout(layout: CourseLayout): RouteCourse {
  return buildRouteCourse({ ...layout.spec, spans: [...(layout.spec.spans ?? []), ...courseSlotSpans(layout.slots)] });
}

/**
 * An authored change to a generated layout's slots: a pin whose `id` names a slot overrides that
 * slot's fields, its `data` merged over the slot's (or deletes it with `remove`); any other pin adds
 * a slot of its own (it then needs `kind`, `role` and `at`). Pinned slots carry `pinned: true`.
 */
export interface CoursePin extends Partial<Omit<CourseSlot, "id">> {
  id: string;
  remove?: boolean;
}

/** Apply authored pins over a layout's slots. */
export function applyCoursePins(layout: CourseLayout, pins: readonly CoursePin[]): CourseLayout {
  if (pins.length === 0) return layout;
  const byId = new Map(pins.map((pin) => [pin.id, pin]));
  const slots: CourseSlot[] = [];
  for (const slot of layout.slots) {
    const pin = byId.get(slot.id);
    if (pin === undefined) slots.push(slot);
    else if (pin.remove !== true) slots.push(pinned(slot, pin));
  }
  const known = new Set(layout.slots.map((slot) => slot.id));
  for (const pin of pins) {
    if (known.has(pin.id) || pin.remove === true) continue;
    if (pin.kind === undefined || pin.at === undefined) throw new Error(`course pins: new slot "${pin.id}" needs a kind and an at`);
    slots.push(pinned({ id: pin.id, kind: pin.kind, role: pin.role ?? "", at: pin.at }, pin));
  }
  return { ...layout, slots };
}

function pinned(slot: CourseSlot, pin: CoursePin): CourseSlot {
  const { remove: _remove, ...fields } = pin;
  const data = slot.data === undefined && pin.data === undefined ? {} : { data: { ...slot.data, ...pin.data } };
  return { ...slot, ...fields, ...data, pinned: true };
}

/** A point-mass kart for {@link courseDriveTime}: grip in corners, acceleration, braking, top speed. */
export interface CourseVehicle {
  /** Lateral grip, m/s². Default 11. */
  grip?: number;
  /** Acceleration, m/s². Default 6. */
  accel?: number;
  /** Braking, m/s². Default 8. */
  brake?: number;
  /** Top speed, m/s. Default 26. */
  topSpeed?: number;
}

/** Seconds a kart cruising at three quarters of top speed loses to a full stop and the restart after it. */
export function courseStopLoss(vehicle: CourseVehicle = {}): number {
  const v = (vehicle.topSpeed ?? 26) * 0.75;
  return v / (2 * (vehicle.brake ?? 8)) + v / (2 * (vehicle.accel ?? 6));
}

/**
 * Worst-case seconds a slot can cost a kart: a barricade it cannot clear is a stop, `gatePenalty`
 * seconds of wrangling and a restart; a timed hazard caught at the start of its window is the whole
 * window and a stop; a surface hazard is its length at half speed. Lane hazards cost nothing to a
 * kart in the free lane.
 */
export function courseSlotRisk(slot: CourseSlot, options: { vehicle?: CourseVehicle; gatePenalty?: number } = {}): number {
  const stop = courseStopLoss(options.vehicle);
  if (slot.kind === "gate") return stop + (options.gatePenalty ?? 2);
  if (slot.kind !== "hazard") return 0;
  if (slot.cycle !== undefined) return slot.cycle.active + stop;
  if (slot.band === undefined) return ((slot.to ?? slot.at) - slot.at) / ((options.vehicle?.topSpeed ?? 26) * 0.5);
  return 0;
}

/** Options for {@link courseDriveTime}. */
export interface CourseDriveOptions {
  /** Main-line metres to start from (standing) and to finish at. */
  from: number;
  to: number;
  /** Branch ids to take. */
  take?: readonly string[];
  vehicle?: CourseVehicle;
}

/**
 * Seconds a point-mass kart takes from `from` (standing) to `to` along the course's centreline,
 * through the branches in `take`: corner speed from the line's curvature, accelerating and braking
 * at the vehicle's limits. A sim for comparing lines and courses, not a lap-time prediction.
 */
export function courseDriveTime(course: RouteCourse, options: CourseDriveOptions): number {
  const grip = options.vehicle?.grip ?? 11;
  const accel = options.vehicle?.accel ?? 6;
  const brake = options.vehicle?.brake ?? 8;
  const top = options.vehicle?.topSpeed ?? 26;
  const step = 2;
  const line = course.line({ ...(options.take === undefined ? {} : { take: options.take }), step });
  // Progress of each line point, followed with a hint so a switchback's legs never swap.
  const progress: number[] = [];
  let fix: CourseFix | null = null;
  for (const [x, z] of line) {
    fix = course.locate(x, z, fix);
    progress.push(fix.progress);
  }
  let first = progress.findIndex((value) => value >= options.from);
  let last = progress.findIndex((value, index) => index > first && value >= options.to);
  if (first < 0) first = 0;
  if (last < 0) last = line.length - 1;
  const points = line.slice(first, last + 1);
  const n = points.length;
  if (n < 2) return 0;
  const ds: number[] = [];
  for (let i = 0; i + 1 < n; i += 1) ds.push(Math.hypot(points[i + 1]![0] - points[i]![0], points[i + 1]![1] - points[i]![1]));
  const reach = 3;
  const limit = points.map((_, i) => {
    const a = points[Math.max(0, i - reach)]!;
    const b = points[i]!;
    const c = points[Math.min(n - 1, i + reach)]!;
    return Math.min(top, Math.sqrt(grip * circumradius(a, b, c)));
  });
  const v = [...limit];
  v[0] = 0;
  for (let i = 0; i + 1 < n; i += 1) v[i + 1] = Math.min(v[i + 1]!, Math.sqrt(v[i]! ** 2 + 2 * accel * ds[i]!));
  for (let i = n - 1; i > 0; i -= 1) v[i - 1] = Math.min(v[i - 1]!, Math.sqrt(v[i]! ** 2 + 2 * brake * ds[i - 1]!));
  let time = 0;
  for (let i = 0; i + 1 < n; i += 1) time += ds[i]! / Math.max(0.5, (v[i]! + v[i + 1]!) / 2);
  return time;
}

function circumradius(a: CourseVec2, b: CourseVec2, c: CourseVec2): number {
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return cross < 1e-9 ? Number.POSITIVE_INFINITY : (ab * bc * ca) / (2 * cross);
}

/** Corner-piece tags the generator writes, which {@link measureCourse} counts. */
export const COURSE_CORNER_TAGS = ["sweeper", "right-angle", "hairpin", "chicane", "detour"] as const;
/** A corner family the generator lays. */
export type CourseCornerKind = (typeof COURSE_CORNER_TAGS)[number];

/** What a layout measures as: the numbers the generator's dials move. */
export interface CourseMeasure {
  /** Main-line metres from the start line to the finish. */
  length: number;
  /** Turn pieces of 20° or more, and per km of `length`. */
  turns: number;
  turnsPerKm: number;
  /** Turn pieces per corner tag (`hairpin`, `chicane`, …). */
  corners: Readonly<Record<string, number>>;
  /** Metres climbed and descended on the main line, and steep descents of 4 m or more. */
  climb: number;
  descent: number;
  descents: number;
  minRadius: number;
  maxGrade: number;
  branches: number;
  /** Slots per kind, and per `kind:role`. */
  slots: Readonly<Record<string, number>>;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Measure a layout. Turn and climb figures need a piece-laid main line. */
export function measureCourse(layout: CourseLayout, course: RouteCourse = buildCourseLayout(layout)): CourseMeasure {
  const corners: Record<string, number> = {};
  let turns = 0;
  let climb = 0;
  let descent = 0;
  let descents = 0;
  let minRadius = Number.POSITIVE_INFINITY;
  let maxGrade = 0;
  for (const piece of layout.spec.pieces ?? []) {
    const length = piece.kind === "straight" ? piece.length : Math.abs(piece.angle) * piece.radius;
    const rise = piece.rise ?? 0;
    if (rise > 0) climb += rise;
    else descent -= rise;
    if (rise <= -4) descents += 1;
    maxGrade = Math.max(maxGrade, Math.abs(rise) / length);
    if (piece.kind !== "turn") continue;
    minRadius = Math.min(minRadius, piece.radius);
    if (Math.abs(piece.angle) < (20 * Math.PI) / 180) continue;
    turns += 1;
    const tag = piece.tag ?? "turn";
    corners[tag] = (corners[tag] ?? 0) + 1;
  }
  const slots: Record<string, number> = {};
  for (const slot of layout.slots) {
    slots[slot.kind] = (slots[slot.kind] ?? 0) + 1;
    slots[`${slot.kind}:${slot.role}`] = (slots[`${slot.kind}:${slot.role}`] ?? 0) + 1;
  }
  const length = layout.finish - layout.startLine;
  return {
    length,
    turns,
    turnsPerKm: length > 0 ? (turns / length) * 1000 : 0,
    corners,
    climb,
    descent,
    descents,
    minRadius,
    maxGrade,
    branches: course.routes.length - 1,
    slots,
    bounds: course.bounds,
  };
}

/** Options for {@link checkCoursePlayability}. */
export interface CoursePlayabilityOptions {
  vehicle?: CourseVehicle;
  /** Seconds a barricade costs a kart that cannot clear it, on top of the stop (see {@link courseSlotRisk}). Default 2. */
  gatePenalty?: number;
  /** Least metres between the walls of two stretches of road that are not neighbours. Default 4. */
  wallGap?: number;
  /** Steepest grade a piece may hold. Default 0.25. */
  maxGrade?: number;
  /** Shortest a timed hazard's off-window may be, seconds. Default 2. */
  minWindow?: number;
  /** Narrowest free lane a lane hazard may leave, metres. Default 3. */
  minLane?: number;
  /** Require every shortcut to save time and carry a risk that can cost more than it saves. Default true. */
  shortcutRisk?: boolean;
}

/** One shortcut's trade, in sim seconds. */
export interface CourseShortcutTrade {
  id: string;
  /** Seconds saved over the long way. */
  saving: number;
  /** Worst-case seconds its risk slots can cost. */
  risk: number;
  riskSlots: readonly string[];
}

/** One hazard and how a driver beats it. */
export interface CourseHazardCheck {
  id: string;
  /** `window` (wait out the cycle), `lane` (take the free lane), `through` (it only slows). */
  beat: "window" | "lane" | "through" | "none";
  /** Seconds of the worst wait, or metres of free lane. */
  margin: number;
}

/** What {@link checkCoursePlayability} found. */
export interface CoursePlayability {
  ok: boolean;
  issues: readonly string[];
  /** Sim seconds start line to finish on the main line. */
  time: number;
  minClearance: number;
  shortcuts: readonly CourseShortcutTrade[];
  hazards: readonly CourseHazardCheck[];
}

/**
 * Check a layout can be raced: it builds; no two stretches of road run into each other; corners
 * clear their width and slopes stay drivable; start, finish and every slot sit on their routes;
 * every hazard can be beaten (a window in its cycle, a free lane, or it only slows) and none stands
 * over a barricade or another timed hazard; and every shortcut saves sim time but carries a risk
 * that can cost more than it saves.
 */
export function checkCoursePlayability(layout: CourseLayout, options: CoursePlayabilityOptions = {}): CoursePlayability {
  const issues: string[] = [];
  let course: RouteCourse;
  try {
    course = buildCourseLayout(layout);
  } catch (error) {
    return { ok: false, issues: [`does not build: ${(error as Error).message}`], time: Number.POSITIVE_INFINITY, minClearance: Number.NEGATIVE_INFINITY, shortcuts: [], hazards: [] };
  }
  const wallGap = options.wallGap ?? 4;
  const routeOf = new Map(course.routes.map((route) => [route.id, route]));

  if (!(layout.startLine >= 0 && layout.finish > layout.startLine && layout.finish <= course.length)) {
    issues.push(`start line ${layout.startLine} and finish ${layout.finish} must run forward inside the main line (0..${course.length.toFixed(1)})`);
  }

  // Clearance: samples of every route against every other sample that is not its neighbour.
  const samples: { x: number; z: number; route: string; p: number; hw: number }[] = [];
  for (const route of course.routes) {
    for (let s = 0; s <= route.length; s += 3) {
      const point = course.pointAt(route.id, s);
      samples.push({ x: point.x, z: point.z, route: route.id, p: point.progress, hw: point.halfWidth });
    }
  }
  let minClearance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < samples.length; i += 1) {
    const a = samples[i]!;
    for (let j = i + 1; j < samples.length; j += 1) {
      const b = samples[j]!;
      const apart = Math.abs(a.p - b.p);
      if (Math.min(apart, course.closed ? course.length - apart : apart) < (a.hw + b.hw) * 2.5) continue;
      if (a.route !== b.route && (a.route === MAIN_ROUTE || b.route === MAIN_ROUTE)) {
        const branch = routeOf.get(a.route === MAIN_ROUTE ? b.route : a.route)!;
        const mainP = a.route === MAIN_ROUTE ? a.p : b.p;
        if (mainP > branch.from - 30 && mainP < branch.to + 30) continue;
      }
      const gap = Math.hypot(a.x - b.x, a.z - b.z) - a.hw - b.hw;
      if (gap < minClearance) minClearance = gap;
    }
  }
  if (minClearance < wallGap) issues.push(`two stretches of road come within ${minClearance.toFixed(1)} m (needs ${wallGap})`);

  const maxGrade = options.maxGrade ?? 0.25;
  for (const [index, piece] of (layout.spec.pieces ?? []).entries()) {
    const length = piece.kind === "straight" ? piece.length : Math.abs(piece.angle) * piece.radius;
    if (Math.abs(piece.rise ?? 0) / length > maxGrade) issues.push(`piece ${index} is steeper than ${maxGrade * 100}%`);
    if (piece.kind === "turn" && piece.radius < (piece.halfWidth ?? layout.spec.halfWidth) * 1.4) issues.push(`piece ${index} turns tighter than its width allows`);
  }

  for (const slot of layout.slots) {
    const route = routeOf.get(slot.route ?? MAIN_ROUTE);
    if (route === undefined) {
      issues.push(`slot ${slot.id} names unknown route "${slot.route}"`);
      continue;
    }
    const end = slot.to ?? slot.at;
    if (!(slot.at >= 0 && end <= route.length + 1e-6)) issues.push(`slot ${slot.id} runs off its route`);
  }

  // Hazards: each one beatable, none stacked on a barricade or another timed hazard.
  const minWindow = options.minWindow ?? 2;
  const minLane = options.minLane ?? 3;
  const hazards: CourseHazardCheck[] = [];
  const hazardSlots = layout.slots.filter((slot) => slot.kind === "hazard");
  for (const slot of hazardSlots) {
    const route = slot.route ?? MAIN_ROUTE;
    const hw = course.pointAt(route, (slot.at + (slot.to ?? slot.at)) / 2).halfWidth;
    let check: CourseHazardCheck;
    if (slot.cycle !== undefined) {
      const off = slot.cycle.period - slot.cycle.active;
      check = { id: slot.id, beat: off >= minWindow ? "window" : "none", margin: slot.cycle.active };
    } else if (slot.band !== undefined) {
      const free = Math.max(hw - slot.band[1], slot.band[0] + hw);
      check = { id: slot.id, beat: free >= minLane ? "lane" : slot.role === "surface" ? "through" : "none", margin: free };
    } else {
      check = { id: slot.id, beat: slot.role === "surface" ? "through" : "none", margin: 0 };
    }
    if (check.beat === "none") issues.push(`hazard ${slot.id} cannot be beaten: no window, no free lane, and it is not a surface`);
    hazards.push(check);
    if (slot.cycle === undefined) continue;
    for (const gate of layout.slots) {
      if (gate.kind !== "gate" || (gate.route ?? MAIN_ROUTE) !== route) continue;
      if (gate.at >= slot.at - 6 && gate.at <= (slot.to ?? slot.at) + 6) issues.push(`barricade ${gate.id} stands in timed hazard ${slot.id}`);
    }
    for (const other of hazardSlots) {
      if (other === slot || other.cycle === undefined || (other.route ?? MAIN_ROUTE) !== route || other.id < slot.id) continue;
      if (other.at < (slot.to ?? slot.at) + 20 && slot.at < (other.to ?? other.at) + 20) issues.push(`timed hazards ${slot.id} and ${other.id} run together`);
    }
  }

  const vehicle = options.vehicle ?? {};
  const time = courseDriveTime(course, { from: layout.startLine, to: layout.finish, vehicle });
  if (!Number.isFinite(time) || time <= 0) issues.push("the main line cannot be driven start to finish");
  const shortcuts: CourseShortcutTrade[] = [];
  for (const route of course.routes) {
    if (route.id === MAIN_ROUTE) continue;
    const short = courseDriveTime(course, { from: layout.startLine, to: layout.finish, take: [route.id], vehicle });
    const riskSlots = layout.slots.filter((slot) => slot.route === route.id && (slot.kind === "gate" || slot.kind === "hazard"));
    const risk = riskSlots.reduce((sum, slot) => sum + courseSlotRisk(slot, { vehicle, ...(options.gatePenalty === undefined ? {} : { gatePenalty: options.gatePenalty }) }), 0);
    const trade = { id: route.id, saving: time - short, risk, riskSlots: riskSlots.map((slot) => slot.id) };
    shortcuts.push(trade);
    if (options.shortcutRisk !== false) {
      if (trade.saving < 0.3) issues.push(`shortcut ${route.id} saves only ${trade.saving.toFixed(2)} s`);
      if (trade.risk < trade.saving) issues.push(`shortcut ${route.id} risks ${trade.risk.toFixed(2)} s for a ${trade.saving.toFixed(2)} s saving`);
    }
  }
  return { ok: issues.length === 0, issues, time, minClearance, shortcuts, hazards };
}
