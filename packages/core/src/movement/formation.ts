/**
 * Group destination assignment: slot a moving group into a formation around a
 * target point, then match members to slots. Shape is caller data — a
 * {@link FormationSlotGenerator} emits slot offsets in the group's local frame
 * ("right" = +x, "forward" = +y) and the engine ships line/box/wedge/circle
 * only as samples; a custom generator needs no engine change. Placement and
 * matching are pure and deterministic so the same inputs always yield the same
 * world slots and the same assignment, which keeps them replay- and
 * network-safe. Route planning and local collision avoidance are deliberately
 * separate seams (`movement/avoidance`, `nav/pathFollow`): this module answers
 * only "where should each member stand", not "how does it get there".
 */

import { yawForward, yawRight } from "./steering";

/** A point or offset on the XZ ground plane: `[x, z]`. */
export type Vec2 = readonly [number, number];

/**
 * Produces `count` slot offsets in the group's local frame — `[right, forward]`
 * where `+forward` points where the group faces. Index order is the slot order;
 * a generator must be pure (same `count` → same offsets) so placement stays
 * deterministic. Sample generators below cover common shapes; games pass their
 * own for anything else (crowds, convoys, sports positions) with no engine edit.
 */
export type FormationSlotGenerator = (count: number) => Vec2[];

/**
 * Engine yaw (`rotationY`, radians) that faces from `from` toward `to` on the
 * XZ plane, matching the `forward = (sin yaw, cos yaw)` convention. Feed the
 * result as the `facing` of {@link placeFormation} to orient a formation along
 * its travel direction. Returns `0` when the points coincide.
 *
 * @capability formation-facing group facing yaw from a travel direction on the XZ plane
 * @consumer squad and crowd movement — orient a destination formation along its heading
 */
export function facingYaw(from: Vec2, to: Vec2): number {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  if (dx * dx + dz * dz <= 1e-18) return 0;
  return Math.atan2(dx, dz);
}

/**
 * Transform a generator's local slot offsets into world XZ positions around a
 * `destination`, rotated by `facing` (engine yaw). Slot `i` in the returned
 * array is `generator(count)[i]` mapped through the group frame, so it stays
 * aligned with {@link assignFormationSlots}' slot indices. Pure and allocation-
 * light: one array of `count` points, no per-call closures retained.
 *
 * @capability formation-placement place a group formation's world slots around a destination
 * @consumer squad/party/convoy movement — generate per-member destination slots around a target
 */
export function placeFormation(
  destination: Vec2,
  facing: number,
  count: number,
  generator: FormationSlotGenerator,
): Vec2[] {
  if (count <= 0) return [];
  const forward = yawForward(facing);
  const right = yawRight(facing);
  const local = generator(count);
  const slots: Vec2[] = [];
  for (let i = 0; i < count; i += 1) {
    const offset = local[i] ?? ZERO;
    const r = offset[0];
    const f = offset[1];
    slots.push([
      destination[0] + right[0] * r + forward[0] * f,
      destination[1] + right[1] * r + forward[1] * f,
    ]);
  }
  return slots;
}

/** Tuning for {@link assignFormationSlots}' stable, low-churn matching. */
export interface SlotAssignmentOptions {
  /**
   * Last tick's result (`previous[member] = slot`). When supplied, a member is
   * biased toward keeping its previous slot so the formation does not reshuffle
   * every frame. Entries out of range for the current slot count are ignored.
   */
  previous?: readonly number[];
  /**
   * Squared-distance bonus (world units²) for keeping the previous slot; higher
   * values reduce churn at the cost of tighter travel. Default `0` (pure
   * nearest matching). Ignored without `previous`.
   */
  stickiness?: number;
}

interface Pair {
  member: number;
  slot: number;
  cost: number;
}

/**
 * Match `members` to `slots` by a deterministic greedy nearest assignment:
 * every (member, slot) pair is ranked by squared travel distance (minus a
 * stickiness bonus for a member's previous slot) and assigned in order while
 * both ends are free. Returns `assignment[member] = slot`, or `-1` for members
 * left unmatched when there are fewer slots than members. Ties break by member
 * then slot index, so the result is stable across runs and independent of input
 * ordering — the property replay and lockstep multiplayer rely on. Groups are
 * bounded, so the `O(members·slots·log)` sort is fine; this is not a per-frame
 * whole-world pass.
 *
 * @capability formation-assignment stable deterministic member-to-slot matching for a group formation
 * @consumer squad/party movement — assign each member a destination slot with low reshuffle churn
 */
export function assignFormationSlots(
  members: readonly Vec2[],
  slots: readonly Vec2[],
  options: SlotAssignmentOptions = {},
): number[] {
  const memberCount = members.length;
  const slotCount = slots.length;
  const assignment = new Array<number>(memberCount).fill(-1);
  if (memberCount === 0 || slotCount === 0) return assignment;

  const previous = options.previous;
  const stickiness = options.stickiness ?? 0;
  const pairs: Pair[] = [];
  for (let m = 0; m < memberCount; m += 1) {
    const member = members[m]!;
    const keepSlot = previous?.[m];
    for (let s = 0; s < slotCount; s += 1) {
      const slot = slots[s]!;
      const dx = slot[0] - member[0];
      const dz = slot[1] - member[1];
      let cost = dx * dx + dz * dz;
      if (stickiness > 0 && keepSlot === s) cost -= stickiness;
      pairs.push({ member: m, slot: s, cost });
    }
  }
  pairs.sort((a, b) =>
    a.cost !== b.cost ? a.cost - b.cost : a.member !== b.member ? a.member - b.member : a.slot - b.slot,
  );

  const slotTaken = new Array<boolean>(slotCount).fill(false);
  let filled = 0;
  const need = Math.min(memberCount, slotCount);
  for (let p = 0; p < pairs.length && filled < need; p += 1) {
    const pair = pairs[p]!;
    if (assignment[pair.member] !== -1 || slotTaken[pair.slot]) continue;
    assignment[pair.member] = pair.slot;
    slotTaken[pair.slot] = true;
    filled += 1;
  }
  return assignment;
}

const ZERO: Vec2 = [0, 0];

/** Options for {@link lineFormation}. */
export interface LineFormationOptions {
  /** Gap between adjacent members (world units). */
  spacing: number;
}

/**
 * A single rank abreast, centered on the destination and facing forward — a
 * skirmish line or a chorus row. Slots run left→right along the group's right
 * axis.
 *
 * @capability formation-line line (abreast) slot generator for group destinations
 * @consumer squad movement — line formation sample policy for {@link placeFormation}
 */
export function lineFormation(options: LineFormationOptions): FormationSlotGenerator {
  const spacing = options.spacing;
  return (count) => {
    const slots: Vec2[] = [];
    const mid = (count - 1) / 2;
    for (let i = 0; i < count; i += 1) slots.push([(i - mid) * spacing, 0]);
    return slots;
  };
}

/** Options for {@link boxFormation}. */
export interface BoxFormationOptions {
  /** Gap between adjacent members along both axes (world units). */
  spacing: number;
  /** Members per row; defaults to a near-square `ceil(sqrt(count))`. */
  columns?: number;
}

/**
 * A rectangular grid centered on the destination, front row toward `+forward` —
 * a marching block or a phalanx. Rows fill front-to-back, left-to-right.
 *
 * @capability formation-box box/grid slot generator for group destinations
 * @consumer squad movement — box formation sample policy for {@link placeFormation}
 */
export function boxFormation(options: BoxFormationOptions): FormationSlotGenerator {
  const spacing = options.spacing;
  const fixedColumns = options.columns;
  return (count) => {
    const columns = Math.max(1, fixedColumns ?? Math.ceil(Math.sqrt(count)));
    const rows = Math.ceil(count / columns);
    const midCol = (columns - 1) / 2;
    const midRow = (rows - 1) / 2;
    const slots: Vec2[] = [];
    for (let i = 0; i < count; i += 1) {
      const row = Math.floor(i / columns);
      const col = i % columns;
      slots.push([(col - midCol) * spacing, (midRow - row) * spacing]);
    }
    return slots;
  };
}

/** Options for {@link wedgeFormation}. */
export interface WedgeFormationOptions {
  /** Gap between successive ranks along each arm (world units). */
  spacing: number;
}

/**
 * A "V"/arrowhead with the apex at the destination and arms trailing back — a
 * flying-wedge charge or a goose skein. Slot 0 is the tip; later slots alternate
 * right then left, each rank stepping one `spacing` outward and backward.
 *
 * @capability formation-wedge wedge/arrowhead slot generator for group destinations
 * @consumer squad movement — wedge formation sample policy for {@link placeFormation}
 */
export function wedgeFormation(options: WedgeFormationOptions): FormationSlotGenerator {
  const spacing = options.spacing;
  return (count) => {
    const slots: Vec2[] = [];
    for (let i = 0; i < count; i += 1) {
      if (i === 0) {
        slots.push([0, 0]);
        continue;
      }
      const rank = Math.ceil(i / 2);
      const side = i % 2 === 1 ? 1 : -1;
      slots.push([side * rank * spacing, -rank * spacing]);
    }
    return slots;
  };
}

/** Options for {@link circleFormation}. */
export interface CircleFormationOptions {
  /** Ring radius from the destination center (world units). */
  radius: number;
  /**
   * Start angle offset (radians) around the ring; default `0` places slot 0
   * directly forward. Angles advance counterclockwise.
   */
  startAngle?: number;
}

/**
 * An evenly spaced ring around the destination — a guard cordon, a huddle, or a
 * surround. Slot 0 sits `startAngle` from forward; slots advance evenly around
 * the circle.
 *
 * @capability formation-circle ring/cordon slot generator for group destinations
 * @consumer squad/crowd movement — circle formation sample policy for {@link placeFormation}
 */
export function circleFormation(options: CircleFormationOptions): FormationSlotGenerator {
  const radius = options.radius;
  const startAngle = options.startAngle ?? 0;
  return (count) => {
    const slots: Vec2[] = [];
    for (let i = 0; i < count; i += 1) {
      const angle = startAngle + (2 * Math.PI * i) / count;
      slots.push([radius * Math.sin(angle), radius * Math.cos(angle)]);
    }
    return slots;
  };
}
