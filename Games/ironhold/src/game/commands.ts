import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import {
  assignFormationSlots,
  boxFormation,
  facingYaw,
  placeFormation,
  type Vec2,
} from "@jgengine/core/movement/formation";

import { combatantDef } from "./catalog";
import { FOOTMAN_COST, FORMATION_SPACING, GOLD, ORDER_TARGET_RADIUS } from "./tuning";
import { livingUnits, session, type UnitRuntime } from "./session";

export interface OrderInput {
  selection: readonly string[];
  point: EntityPosition;
}

function distToPoint(p: EntityPosition, x: number, z: number): number {
  return Math.hypot(p[0] - x, p[2] - z);
}

/** Nearest living hostile-to-the-player combatant near a clicked point (buildings get a wider grab
 * so a click anywhere on the enemy keep resolves to it). */
function enemyNear(ctx: GameContext, x: number, z: number): string | null {
  let bestId: string | null = null;
  let best = Infinity;
  for (const u of session.units.values()) {
    if (u.faction !== "enemy") continue;
    const ent = ctx.scene.entity.get(u.id);
    if (ent === null) continue;
    const threshold = ORDER_TARGET_RADIUS + (u.kind === "building" ? 4 : 0);
    const d = distToPoint(ent.position, x, z);
    if (d <= threshold && d < best) {
      best = d;
      bestId = u.id;
    }
  }
  return bestId;
}

function selectedPlayerUnits(selection: readonly string[]): UnitRuntime[] {
  const out: UnitRuntime[] = [];
  for (const id of selection) {
    const u = session.units.get(id);
    if (u !== undefined && u.faction === "player" && u.kind === "unit") out.push(u);
  }
  return out;
}

/** Right-click order: focus-fire a hostile under the cursor, else move (or attack-move if armed) the
 * group into a box formation around the point.
 * @internal exported for tests */
export function orderSelection(ctx: GameContext, input: OrderInput): GameContext {
  if (session.over) return ctx;
  const units = selectedPlayerUnits(input.selection);
  if (units.length === 0) return ctx;

  const x = input.point[0];
  const z = input.point[2];
  const armed = session.attackMoveArmed;
  session.attackMoveArmed = false;

  const targetId = enemyNear(ctx, x, z);
  if (targetId !== null) {
    for (const u of units) u.command = { kind: "attack", targetId };
    return ctx;
  }

  const members: Vec2[] = units.map((u) => {
    const ent = ctx.scene.entity.get(u.id);
    return ent === null ? ([x, z] as Vec2) : ([ent.position[0], ent.position[2]] as Vec2);
  });
  const cx = members.reduce((s, m) => s + m[0], 0) / members.length;
  const cz = members.reduce((s, m) => s + m[1], 0) / members.length;
  const facing = facingYaw([cx, cz], [x, z]);
  const slots = placeFormation([x, z], facing, units.length, boxFormation({ spacing: FORMATION_SPACING }));
  const assignment = assignFormationSlots(members, slots);

  units.forEach((u, i) => {
    const slot = slots[assignment[i] ?? i] ?? ([x, z] as Vec2);
    u.command = armed
      ? { kind: "attackMove", x: slot[0], z: slot[1] }
      : { kind: "move", x: slot[0], z: slot[1] };
  });
  return ctx;
}

function armAttackMove(ctx: GameContext): GameContext {
  if (!session.over) session.attackMoveArmed = true;
  return ctx;
}

function trainFootmanValid(ctx: GameContext): { reason: string } | null {
  if (session.over) return { reason: "match-over" };
  if (livingUnits("player", "building").length === 0) return { reason: "no-keep" };
  if (ctx.game.economy.balance(ctx.player.userId, GOLD) < FOOTMAN_COST) return { reason: "insufficient-gold" };
  return null;
}

function trainFootman(ctx: GameContext): GameContext {
  const keepUnit = livingUnits("player", "building")[0];
  if (keepUnit === undefined) return ctx;
  const keep = ctx.scene.entity.get(keepUnit.id);
  if (keep === null) return ctx;
  const def = combatantDef("footman");
  if (def === null) return ctx;

  ctx.game.economy.charge(ctx.player.userId, GOLD, FOOTMAN_COST);
  session.trainSeq += 1;
  const id = `footman_t${session.trainSeq}`;
  // Muster in front of the keep (toward centre-field), fanned so trainees don't stack.
  const lane = ((session.trainSeq % 5) - 2) * 1.8;
  const rx = keep.position[0] + lane;
  const rz = keep.position[2] - 6;
  ctx.scene.entity.spawn("footman", { id, position: [rx, 0, rz], role: "npc" });
  session.units.set(id, {
    id,
    catalogId: "footman",
    faction: "player",
    kind: "unit",
    command: { kind: "idle" },
    guardPoint: { x: rx, z: rz },
    leash: 14,
    attackCooldown: 0,
  });
  return ctx;
}

export function registerCommands(ctx: GameContext): void {
  ctx.game.commands.define<OrderInput>("unit.order", { apply: orderSelection });
  ctx.game.commands.define("unit.attackMove", { apply: armAttackMove });
  ctx.game.commands.define("train.footman", { validate: trainFootmanValid, apply: trainFootman });
}
