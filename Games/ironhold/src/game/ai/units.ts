import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { combatantDef, isHostile } from "../catalog";
import { ARRIVE_RADIUS, DEPOT_RANGE, HARVEST_RANGE, HARVEST_SECONDS } from "../tuning";
import { playerDepot, session, type UnitRuntime } from "../session";
import { resolveDamage } from "../upgrades";
import { heroAttackBonus } from "../hero";

/** Extra reach against a building's broad footprint so attackers stop at the wall, not the centre. */
const BUILDING_REACH_BONUS = 3.5;

function distXZ(a: EntityPosition, b: EntityPosition): number {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return Math.hypot(dx, dz);
}

function distToPoint(a: EntityPosition, x: number, z: number): number {
  return Math.hypot(a[0] - x, a[2] - z);
}

function faceToward(ctx: GameContext, id: string, from: EntityPosition, tx: number, tz: number): void {
  const dx = tx - from[0];
  const dz = tz - from[2];
  if (dx === 0 && dz === 0) return;
  ctx.scene.entity.setPose(id, { position: from, rotationY: Math.atan2(dx, dz) });
}

function stepTo(ctx: GameContext, dt: number, u: UnitRuntime, speed: number, x: number, z: number): void {
  ctx.scene.entity.moveTowardCommit(u.id, [x, 0, z], { speed, dt, face: true });
}

/** Nearest living hostile (unit or building) within `radius`, by faction — bounded by roster size. */
function acquireNearest(ctx: GameContext, u: UnitRuntime, self: EntityPosition, radius: number): string | null {
  let bestId: string | null = null;
  let bestDist = radius;
  for (const other of session.units.values()) {
    if (!isHostile(u.faction, other.faction)) continue;
    const ent = ctx.scene.entity.get(other.id);
    if (ent === null) continue;
    const d = distXZ(self, ent.position);
    if (d <= bestDist) {
      bestDist = d;
      bestId = other.id;
    }
  }
  return bestId;
}

function hostileTarget(ctx: GameContext, u: UnitRuntime, targetId: string): UnitRuntime | null {
  const t = session.units.get(targetId);
  if (t === undefined || !isHostile(u.faction, t.faction)) return null;
  if (ctx.scene.entity.get(targetId) === null) return null;
  return t;
}

/** The gold-miner / lumberjack loop: walk to the node, work, haul the load to the Town Hall, deposit,
 * repeat. Composed from move steps + a resource-node harvest; the carried load rides the command. */
function tickGather(ctx: GameContext, dt: number, u: UnitRuntime, self: EntityPosition, walkSpeed: number): void {
  if (u.command.kind !== "gather") return;
  const cmd = u.command;
  const node = session.nodes.get(cmd.nodeId);

  if (cmd.phase === "toNode") {
    if (node === undefined) {
      u.command = { kind: "idle" };
      return;
    }
    if (distToPoint(self, node.x, node.z) <= HARVEST_RANGE) {
      cmd.phase = "harvest";
      cmd.timer = HARVEST_SECONDS;
      faceToward(ctx, u.id, self, node.x, node.z);
    } else {
      stepTo(ctx, dt, u, walkSpeed, node.x, node.z);
    }
    return;
  }

  if (cmd.phase === "harvest") {
    cmd.timer -= dt;
    if (cmd.timer > 0) return;
    const field = session.resourceField;
    const result = field !== null && node !== undefined ? field.harvest(cmd.nodeId, { power: 1, defaultBias: 1 }) : null;
    const got = result === null ? 0 : result.granted.reduce((sum, g) => sum + g.amount, 0);
    if (got > 0) {
      cmd.carried = got;
      cmd.phase = "toDepot";
    } else {
      u.command = { kind: "idle" }; // node depleted, nothing to haul
    }
    return;
  }

  // toDepot
  const depot = playerDepot({ x: self[0], z: self[2] });
  if (depot === null) {
    u.command = { kind: "idle" };
    return;
  }
  if (distToPoint(self, depot.x, depot.z) <= DEPOT_RANGE) {
    if (cmd.carried > 0) ctx.game.economy.grant(ctx.player.userId, cmd.resource, cmd.carried);
    cmd.carried = 0;
    if (node !== undefined) cmd.phase = "toNode";
    else u.command = { kind: "idle" };
  } else {
    stepTo(ctx, dt, u, walkSpeed, depot.x, depot.z);
  }
}

function tickUnit(ctx: GameContext, dt: number, u: UnitRuntime): void {
  if (u.kind === "building") return;
  const self = ctx.scene.entity.get(u.id);
  if (self === null) return; // death handler prunes it from the session
  const def = combatantDef(u.catalogId);
  if (def === null) return;

  if (u.command.kind === "gather") {
    tickGather(ctx, dt, u, self.position, def.walkSpeed);
    return;
  }

  // 1) Resolve an engagement target.
  let target: UnitRuntime | null = null;
  if (u.command.kind === "attack") {
    target = hostileTarget(ctx, u, u.command.targetId);
    if (target === null) u.command = { kind: "idle" };
  }
  if (target === null && (u.command.kind === "attackMove" || u.command.kind === "idle")) {
    const acquired = acquireNearest(ctx, u, self.position, def.aggroRadius);
    if (acquired !== null) target = session.units.get(acquired) ?? null;
  }

  // 2) Fight the target if we have one.
  if (target !== null) {
    const ent = ctx.scene.entity.get(target.id);
    if (ent !== null) {
      // A guard that has been led too far from its post breaks off and returns.
      if (u.command.kind === "idle" && u.guardPoint !== undefined) {
        if (distToPoint(ent.position, u.guardPoint.x, u.guardPoint.z) > u.leash) {
          stepTo(ctx, dt, u, def.walkSpeed, u.guardPoint.x, u.guardPoint.z);
          return;
        }
      }
      const reach = target.kind === "building" ? def.attackRange + BUILDING_REACH_BONUS : def.attackRange;
      if (distXZ(self.position, ent.position) > reach) {
        stepTo(ctx, dt, u, def.walkSpeed, ent.position[0], ent.position[2]);
        return;
      }
      faceToward(ctx, u.id, self.position, ent.position[0], ent.position[2]);
      u.attackCooldown -= dt;
      if (u.attackCooldown <= 0) {
        const base = def.damage + heroAttackBonus(ctx, u.catalogId);
        const amount = resolveDamage(base, u.faction, target.faction);
        ctx.scene.entity.effect({ from: u.id, to: target.id, effect: "damage", via: { amount } });
        u.attackCooldown = def.attackCooldown;
      }
      return;
    }
  }

  // 3) No target: advance to a commanded destination, or hold the post.
  if (u.command.kind === "move" || u.command.kind === "attackMove") {
    const { x, z } = u.command;
    if (distToPoint(self.position, x, z) <= ARRIVE_RADIUS) u.command = { kind: "idle" };
    else stepTo(ctx, dt, u, def.walkSpeed, x, z);
    return;
  }
  if (u.command.kind === "idle" && u.guardPoint !== undefined) {
    if (distToPoint(self.position, u.guardPoint.x, u.guardPoint.z) > ARRIVE_RADIUS) {
      stepTo(ctx, dt, u, def.walkSpeed, u.guardPoint.x, u.guardPoint.z);
    }
  }
}

/** One AI pass over every commanded unit. Bounded by the roster; no whole-world scan. */
export function tickUnits(ctx: GameContext, dt: number): void {
  if (session.over) return;
  for (const u of session.units.values()) tickUnit(ctx, dt, u);
}
