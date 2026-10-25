import type { GameContext } from "@jgengine/core/runtime/gameContext";
import {
  assignFormationSlots,
  boxFormation,
  facingYaw,
  lineFormation,
  placeFormation,
  wedgeFormation,
  type FormationSlotGenerator,
  type Vec2,
} from "@jgengine/core/movement/formation";

import { combatantDef } from "./catalog";
import { session, type UnitRuntime } from "./session";
import { FORMATION_HOLD_TOLERANCE, FORMATION_SPACING } from "./tuning";

/**
 * Marching formations for the Vanguard.
 *
 * Shape generation, placement and slot matching are the shared engine primitives
 * (`@jgengine/core/movement/formation`); this module owns only Ember's policy: the
 * three named shapes the command card offers, the anchor the group holds, and when a
 * straggler is pulled back into its slot. The engine ships line/box/wedge/circle
 * generators and takes any custom generator, so the file one behind another is game
 * content here, not an engine gap.
 */
export type FormationKind = "line" | "wedge" | "column";

export interface FormationOption {
  id: FormationKind;
  label: string;
  hotkey: string;
  blurb: string;
}

/** Command-card order, hotkeys clear of camera pan (WASD) and the recruit row (1/2/3). */
export const FORMATIONS: readonly FormationOption[] = [
  { id: "line", label: "Line", hotkey: "L", blurb: "One rank abreast — the widest front, the least depth." },
  { id: "wedge", label: "Wedge", hotkey: "J", blurb: "Arrowhead with the tip forward — drives a hole and leaves the flanks trailing." },
  { id: "column", label: "Column", hotkey: "K", blurb: "Single file behind the leader — narrow through gaps and along roads." },
];

export const DEFAULT_FORMATION: FormationKind = "line";

/** A file: slot 0 leads, each later slot one `spacing` further back along -forward. */
export function columnFormation(options: { spacing: number }): FormationSlotGenerator {
  const { spacing } = options;
  return (count) => {
    const offsets: Vec2[] = [];
    for (let i = 0; i < count; i += 1) offsets.push([0, -i * spacing]);
    return offsets;
  };
}

/** The engine generator for a named shape. A box stays the wide-army fallback when no shape is set. */
export function formationGenerator(kind: FormationKind, spacing: number = FORMATION_SPACING): FormationSlotGenerator {
  if (kind === "line") return lineFormation({ spacing });
  if (kind === "wedge") return wedgeFormation({ spacing });
  if (kind === "column") return columnFormation({ spacing });
  return boxFormation({ spacing });
}

/** Local slot offsets (`[right, forward]`) for `count` members in `kind`. Pure and deterministic. */
export function formationOffsets(kind: FormationKind, count: number, spacing: number = FORMATION_SPACING): Vec2[] {
  return count <= 0 ? [] : formationGenerator(kind, spacing)(count);
}

/** Rotate one local offset into world XZ around `anchor`, using the engine's own placement so the
 * yaw frame (`forward = (sin yaw, cos yaw)`, `right = (-cos yaw, sin yaw)`) is never re-derived here. */
export function offsetToWorld(anchor: { x: number; z: number }, facing: number, offset: Vec2): Vec2 {
  const [slot] = placeFormation([anchor.x, anchor.z], facing, 1, () => [offset]);
  return slot ?? [anchor.x, anchor.z];
}

/** World slots for `count` members in `kind` around `anchor` — the engine's own placement. */
export function formationSlots(
  kind: FormationKind,
  anchor: { x: number; z: number },
  facing: number,
  count: number,
  spacing: number = FORMATION_SPACING,
): Vec2[] {
  return placeFormation([anchor.x, anchor.z], facing, count, formationGenerator(kind, spacing));
}

/** One held formation: who is in it, where its anchor stands, which way it faces, and the slot each
 * member owns. The offsets (not the world slots) are authoritative, so moving the anchor keeps every
 * rank in the same relative place — that is what "holds formation" means here. */
export interface FormationState {
  kind: FormationKind;
  anchor: { x: number; z: number };
  /** Engine yaw the formation faces; the group's travel direction when the anchor was set. */
  facing: number;
  /** Members in slot order, so the shape survives a re-anchor without a reshuffle. */
  members: string[];
  /** Local slot offset per member id, in the group's frame. */
  offsets: Record<string, Vec2>;
}

export function emptyFormation(kind: FormationKind = DEFAULT_FORMATION): FormationState {
  return { kind, anchor: { x: 0, z: 0 }, facing: 0, members: [], offsets: {} };
}

/** The world spot one member is holding, or null when it is not in the formation. */
export function formationSlotFor(formation: FormationState, memberId: string): Vec2 | null {
  const offset = formation.offsets[memberId];
  if (offset === undefined) return null;
  return offsetToWorld(formation.anchor, formation.facing, offset);
}

/** Drop members that died, deserted to a gather/attack order, or left the roster. */
export function pruneFormation(ctx: GameContext): void {
  const formation = session.formation;
  const keep: string[] = [];
  for (const id of formation.members) {
    const unit = session.units.get(id);
    if (unit === undefined || ctx.scene.entity.get(id) === null) continue;
    if (unit.command.kind === "gather") continue;
    keep.push(id);
  }
  if (keep.length === formation.members.length) return;
  formation.members = keep;
  for (const id of Object.keys(formation.offsets)) {
    if (!keep.includes(id)) delete formation.offsets[id];
  }
}

/** Put `units` into the current shape around the ordered point: the anchor moves, every member keeps
 * a slot offset, and the nearest member-to-slot matching keeps the reshuffle down. */
export function anchorFormation(ctx: GameContext, units: readonly UnitRuntime[], x: number, z: number, attackMove: boolean): void {
  const formation = session.formation;
  if (units.length === 0) return;
  const from: Vec2[] = units.map((u) => {
    const ent = ctx.scene.entity.get(u.id);
    return ent === null ? ([x, z] as Vec2) : ([ent.position[0], ent.position[2]] as Vec2);
  });
  const cx = from.reduce((sum, p) => sum + p[0], 0) / from.length;
  const cz = from.reduce((sum, p) => sum + p[1], 0) / from.length;
  const facing = facingYaw([cx, cz], [x, z]);

  const offsets = formationOffsets(formation.kind, units.length);
  const slots = formationSlots(formation.kind, { x, z }, facing, units.length);
  const assignment = assignFormationSlots(from, slots);

  formation.anchor = { x, z };
  formation.facing = facing;
  formation.members = units.map((u) => u.id);
  formation.offsets = {};
  const nextOffsets: Vec2[] = [];
  units.forEach((u, i) => {
    const slotIndex = assignment[i] ?? i;
    const offset = offsets[slotIndex] ?? offsets[i] ?? ([0, 0] as Vec2);
    formation.offsets[u.id] = offset;
    const slot = slots[slotIndex] ?? ([x, z] as Vec2);
    nextOffsets.push(slot);
    u.guardPoint = { x: slot[0], z: slot[1] };
    u.command = attackMove ? { kind: "attackMove", x: slot[0], z: slot[1] } : { kind: "move", x: slot[0], z: slot[1] };
  });
}

/** Re-shape the standing group without moving its anchor (the player switched formation). A formation
 * with no members yet adopts the idle army where it stands, so the shape is usable before the first
 * move order — the anchor is then the army's centroid. */
export function reshapeFormation(ctx: GameContext, kind: FormationKind): void {
  const formation = session.formation;
  const units: UnitRuntime[] = [];
  for (const id of formation.members) {
    const unit = session.units.get(id);
    if (unit !== undefined && ctx.scene.entity.get(id) !== null) units.push(unit);
  }
  if (units.length === 0) {
    let cx = 0;
    let cz = 0;
    for (const unit of session.units.values()) {
      if (unit.faction !== "player" || unit.kind !== "unit") continue;
      const ent = ctx.scene.entity.get(unit.id);
      if (ent === null) continue;
      units.push(unit);
      cx += ent.position[0];
      cz += ent.position[2];
    }
    if (units.length === 0) return;
    formation.anchor = { x: cx / units.length, z: cz / units.length };
    formation.members = units.map((unit) => unit.id);
  }
  const anchor = formation.anchor;
  const facing = formation.facing;
  const offsets = formationOffsets(kind, units.length);
  const slots = formationSlots(kind, anchor, facing, units.length);
  formation.kind = kind;
  formation.offsets = {};
  units.forEach((u, i) => {
    const offset = offsets[i] ?? ([0, 0] as Vec2);
    formation.offsets[u.id] = offset;
    const slot = slots[i] ?? [anchor.x, anchor.z];
    u.guardPoint = { x: slot[0], z: slot[1] };
    if (u.command.kind === "idle" || u.command.kind === "move" || u.command.kind === "hold") {
      u.command = { kind: "move", x: slot[0], z: slot[1] };
    }
  });
}

/**
 * Hold the shape: a member that has drifted off its slot (a finished chase, a shove out of the
 * line) walks back to it. Only quiet members are re-tasked — a unit fighting, harvesting or
 * attack-moving keeps its own order, and the 2.6u tolerance sits outside the 1.4u arrive radius so
 * a unit at post never jitters.
 */
export function holdFormation(ctx: GameContext): void {
  const formation = session.formation;
  if (formation.members.length === 0) return;
  for (const id of formation.members) {
    const unit = session.units.get(id);
    if (unit === undefined) continue;
    const def = combatantDef(unit.catalogId);
    if (def === null || def.walkSpeed <= 0) continue;
    if (unit.command.kind !== "idle" && unit.command.kind !== "move" && unit.command.kind !== "hold") continue;
    const ent = ctx.scene.entity.get(id);
    if (ent === null) continue;
    const slot = formationSlotFor(formation, id);
    if (slot === null) continue;
    if (Math.hypot(ent.position[0] - slot[0], ent.position[2] - slot[1]) <= FORMATION_HOLD_TOLERANCE) continue;
    unit.guardPoint = { x: slot[0], z: slot[1] };
    unit.command = { kind: "move", x: slot[0], z: slot[1] };
  }
}
