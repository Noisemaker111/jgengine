import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { enqueue } from "@jgengine/core/gameplay";
import {
  assignFormationSlots,
  boxFormation,
  facingYaw,
  placeFormation,
  type Vec2,
} from "@jgengine/core/movement/formation";

import { combatantDef, COMBATANTS, TRAINABLE } from "./catalog";
import { TRAINING_CONFIG } from "./production";
import { FORMATION_SPACING, NODE_ORDER_RADIUS, ORDER_TARGET_RADIUS } from "./tuning";
import { livingUnits, session, usedSupply, type NodeInfo, type UnitRuntime } from "./session";

export interface OrderInput {
  selection: readonly string[];
  point: EntityPosition;
}

function distToPoint(p: EntityPosition, x: number, z: number): number {
  return Math.hypot(p[0] - x, p[2] - z);
}

/** Nearest living hostile-to-the-player combatant near a clicked point (buildings get a wider grab). */
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

function nodeNear(x: number, z: number): NodeInfo | null {
  let best: NodeInfo | null = null;
  let bestDist = NODE_ORDER_RADIUS;
  for (const node of session.nodes.values()) {
    const d = Math.hypot(node.x - x, node.z - z);
    if (d <= bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

function selectedPlayerUnits(selection: readonly string[]): UnitRuntime[] {
  const out: UnitRuntime[] = [];
  for (const id of selection) {
    const u = session.units.get(id);
    if (u !== undefined && u.faction === "player" && u.kind === "unit") out.push(u);
  }
  return out;
}

function assignMoveFormation(ctx: GameContext, units: UnitRuntime[], x: number, z: number, attackMove: boolean): void {
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
    u.command = attackMove ? { kind: "attackMove", x: slot[0], z: slot[1] } : { kind: "move", x: slot[0], z: slot[1] };
  });
}

/** Right-click order: attack a hostile under the cursor, send peasants to harvest a node under the
 * cursor, else move (or attack-move if armed) the group into a box formation. */
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

  const node = nodeNear(x, z);
  if (node !== null) {
    const workers = units.filter((u) => combatantDef(u.catalogId)?.worker === true);
    const rest = units.filter((u) => combatantDef(u.catalogId)?.worker !== true);
    for (const u of workers) u.command = { kind: "gather", nodeId: node.id, resource: node.resource, phase: "toNode", carried: 0, timer: 0 };
    if (rest.length > 0) assignMoveFormation(ctx, rest, x, z, armed);
    return ctx;
  }

  assignMoveFormation(ctx, units, x, z, armed);
  return ctx;
}

function armAttackMove(ctx: GameContext): GameContext {
  if (!session.over) session.attackMoveArmed = true;
  return ctx;
}

/** Can the player afford `unitId` and does supply allow it? Shared by the command and the HUD gate. */
export function canTrain(ctx: GameContext, unitId: string): boolean {
  if (session.over) return false;
  if (livingUnits("player", "building").length === 0) return false;
  const def = TRAINABLE[unitId];
  if (def === undefined) return false;
  for (const [currency, amount] of Object.entries(def.cost)) {
    if (ctx.game.economy.balance(ctx.player.userId, currency) < amount) return false;
  }
  const food = COMBATANTS[unitId]?.food ?? 0;
  return usedSupply() + food <= session.supplyCap;
}

function trainUnit(ctx: GameContext, unitId: string): GameContext {
  if (!canTrain(ctx, unitId)) return ctx;
  const result = enqueue(session.production, TRAINING_CONFIG, { unitId });
  if (!result.ok) return ctx;
  session.production = result.state;
  for (const [currency, amount] of Object.entries(TRAINABLE[unitId]!.cost)) {
    ctx.game.economy.charge(ctx.player.userId, currency, amount);
  }
  return ctx;
}

export function registerCommands(ctx: GameContext): void {
  ctx.game.commands.define<OrderInput>("unit.order", { apply: orderSelection });
  ctx.game.commands.define("unit.attackMove", { apply: armAttackMove });
  ctx.game.commands.define("train.peasant", { apply: (state) => trainUnit(state, "peasant") });
  ctx.game.commands.define("train.footman", { apply: (state) => trainUnit(state, "footman") });
}
