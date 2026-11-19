import { resolveWalkerStep } from "../movement/solidObstacles";
import type { GameContext } from "../runtime/gameContext";
import type { CompanionIntent } from "../scene/companion";
import { createPerception, type PerceptionPosition, type PerceptionService } from "../sensor/perception";

import { decideTemperament, type TemperamentConfig, type TemperamentMode } from "./temperament";
import { tickCooldown } from "../time/cooldown";

/** How a creature's body moves and strikes. Speeds are metres per second. */
export interface CreatureBody {
  walk: number;
  sprint: number;
  /** Its bite or strike: the effect it sends, how much, seconds between strikes and how far it reaches. Null for a creature that never fights. */
  attack: { effect: string; amount: number; interval: number; reach: number } | null;
  /** Grazing around home when nothing is happening: radius in metres and the seconds it lingers between walks. Default 14 m and 2-7 s. */
  wander?: { radius?: number; linger?: readonly [number, number] };
}

export type CreatureMind =
  | { kind: "wild"; temperament: TemperamentConfig }
  | { kind: "tamed"; intent: CompanionIntent }
  | { kind: "still" };

export interface CreatureStep {
  mode: TemperamentMode | CompanionIntent["kind"] | "still" | "wander";
  targetId: string | null;
  struck: boolean;
  reason: string;
}

export interface CreatureDriverState {
  home: [number, number, number];
  wanderTo: [number, number, number] | null;
  linger: number;
  cooldown: number;
  /** Who last hurt it and until when (game seconds): what it sees of them reads as an attack, not a sighting. */
  grudge: { id: string; until: number } | null;
}

export interface CreatureDriverConfig {
  /** How far wild creatures see what they react to, in metres. Default 24. */
  sight?: number;
  /** Seconds a sighting or a hit stays in mind. Default 8. */
  memorySeconds?: number;
  /** Which entities wild creatures react to. Default: player-role entities. */
  notices?: (ctx: GameContext, creatureId: string, candidateId: string) => boolean;
  /** Ground a creature must not walk onto (deep water, lava): it turns back instead. */
  blocked?: (ctx: GameContext, x: number, z: number) => boolean;
  /** Seconds-based [0,1) generator for grazing; default the context rng. */
  rng?: () => number;
}

/** @capability creature-driver wild creatures that graze, flee, defend and hunt by temperament, and tamed ones that follow, stay and fight on order */
export interface CreatureDriver {
  add(id: string, home: PerceptionPosition): void;
  forget(id: string): void;
  hurt(ctx: GameContext, id: string, attackerId: string): void;
  step(ctx: GameContext, id: string, mind: CreatureMind, body: CreatureBody, dt: number): CreatureStep;
  state(id: string): Readonly<CreatureDriverState> | null;
  setHome(id: string, home: PerceptionPosition): void;
  snapshot(): Record<string, CreatureDriverState>;
  restore(data: Record<string, CreatureDriverState>): void;
  reset(): void;
}

const FOLLOW_GAP = 3;
const FLEE_RUN = 10;
const RUN_TO_CATCH_UP = 9;

function flat(a: PerceptionPosition, b: PerceptionPosition): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function fleeGoal(ctx: GameContext, from: PerceptionPosition, threatId: string | null, goal: PerceptionPosition | null): PerceptionPosition {
  const threat = threatId === null ? null : ctx.scene.entity.get(threatId);
  const away = threat !== null ? [from[0] - threat.position[0], from[2] - threat.position[2]] : goal !== null ? [goal[0] - from[0], goal[2] - from[2]] : [1, 0];
  const length = Math.hypot(away[0]!, away[1]!) || 1;
  return [from[0] + (away[0]! / length) * FLEE_RUN, from[1], from[2] + (away[1]! / length) * FLEE_RUN];
}

const VEERS = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2];

export function createCreatureDriver(config: CreatureDriverConfig = {}): CreatureDriver {
  const sight = config.sight ?? 24;
  const memorySeconds = config.memorySeconds ?? 8;
  const driven = new Map<string, { state: CreatureDriverState; senses: PerceptionService }>();
  const senses = (): PerceptionService => createPerception({ sightRange: sight, sightConeDeg: 360, hearingRange: 0, memorySeconds });

  /** Walk or run toward `goal`, stopping `stop` metres short; returns whether it is there. */
  const travel = (ctx: GameContext, id: string, goal: PerceptionPosition, speed: number, stop: number, dt: number): boolean => {
    const entity = ctx.scene.entity.get(id);
    if (entity === null) return true;
    const [px, , pz] = entity.position;
    const dx = goal[0] - px;
    const dz = goal[2] - pz;
    const distance = Math.hypot(dx, dz);
    if (distance <= stop + 0.05) return true;
    const length = Math.min(distance - stop, speed * dt);
    const heading = Math.atan2(dx, dz);
    // Head-on into a trunk or boulder the slide has nothing to slide along: veer around it instead.
    let best = { stepX: 0, stepZ: 0, heading, score: 0 };
    for (const veer of VEERS) {
      const turn = heading + veer;
      const step = resolveWalkerStep(ctx, entity.position, Math.sin(turn) * length, Math.cos(turn) * length, { radius: 0.6 });
      if (config.blocked?.(ctx, px + step.stepX, pz + step.stepZ) === true) continue;
      // Progress toward the goal picks the way around; a sidestep still beats standing still.
      const moved = Math.hypot(step.stepX, step.stepZ);
      const score = (step.stepX * dx + step.stepZ * dz) / distance + moved * 0.01;
      if (score > best.score + 1e-9) best = { ...step, heading: turn, score };
      if (veer === 0 && moved >= length * 0.75) break;
    }
    const moved = Math.hypot(best.stepX, best.stepZ);
    if (moved === 0) return true;
    const nx = px + best.stepX;
    const nz = pz + best.stepZ;
    ctx.scene.entity.setPose(id, { position: [nx, ctx.world.groundHeightAt(nx, nz), nz], rotationY: best.heading, dt });
    return moved < length * 0.25;
  };

  const face = (ctx: GameContext, id: string, targetId: string): void => {
    const self = ctx.scene.entity.get(id);
    const target = ctx.scene.entity.get(targetId);
    if (self === null || target === null) return;
    ctx.scene.entity.setPose(id, { position: self.position, rotationY: Math.atan2(target.position[0] - self.position[0], target.position[2] - self.position[2]) });
  };

  const settle = (ctx: GameContext, id: string): void => {
    const entity = ctx.scene.entity.get(id);
    if (entity !== null && (entity.velocity[0] !== 0 || entity.velocity[2] !== 0)) ctx.scene.entity.setVelocity(id, [0, 0, 0]);
  };

  const graze = (ctx: GameContext, id: string, entry: CreatureDriverState, body: CreatureBody, dt: number): CreatureStep => {
    const roll = config.rng ?? (() => ctx.rng());
    const radius = body.wander?.radius ?? 14;
    const [lo, hi] = body.wander?.linger ?? [2, 7];
    if (entry.linger > 0) {
      entry.linger -= dt;
      settle(ctx, id);
      return { mode: "idle", targetId: null, struck: false, reason: "grazing" };
    }
    if (entry.wanderTo === null) {
      const angle = roll() * Math.PI * 2;
      const reach = Math.sqrt(roll()) * radius;
      const x = entry.home[0] + Math.cos(angle) * reach;
      const z = entry.home[2] + Math.sin(angle) * reach;
      entry.wanderTo = [x, ctx.world.groundHeightAt(x, z), z];
    }
    if (travel(ctx, id, entry.wanderTo, body.walk, 0.4, dt)) {
      entry.wanderTo = null;
      entry.linger = lo + roll() * (hi - lo);
    }
    return { mode: "wander", targetId: null, struck: false, reason: "wandering" };
  };

  const fight = (ctx: GameContext, id: string, entry: CreatureDriverState, body: CreatureBody, targetId: string, dt: number): boolean => {
    const target = ctx.scene.entity.get(targetId);
    if (target === null || body.attack === null) return false;
    const distance = ctx.scene.entity.distance(id, targetId) ?? Infinity;
    if (distance > body.attack.reach) {
      travel(ctx, id, target.position, body.sprint, body.attack.reach * 0.8, dt);
      return false;
    }
    face(ctx, id, targetId);
    settle(ctx, id);
    if (entry.cooldown > 0) return false;
    ctx.scene.entity.effect({ from: id, to: targetId, effect: body.attack.effect, via: { amount: body.attack.amount } });
    entry.cooldown = body.attack.interval;
    return true;
  };

  return {
    add(id, home) {
      if (driven.has(id)) return;
      driven.set(id, { state: { home: [home[0], home[1], home[2]], wanderTo: null, linger: 0, cooldown: 0, grudge: null }, senses: senses() });
    },
    forget(id) {
      driven.get(id)?.senses.dispose();
      driven.delete(id);
    },
    hurt(ctx, id, attackerId) {
      const entry = driven.get(id);
      const attacker = ctx.scene.entity.get(attackerId);
      if (entry === undefined || attacker === null) return;
      entry.senses.pushStimulus({ kind: "damage", sourceId: attackerId, position: attacker.position, at: ctx.time.now() * 1000 });
      entry.state.grudge = { id: attackerId, until: ctx.time.now() + memorySeconds };
    },
    step(ctx, id, mind, body, dt) {
      const entry = driven.get(id);
      const self = ctx.scene.entity.get(id);
      if (entry === undefined || self === null) return { mode: "still", targetId: null, struck: false, reason: "not driven" };
      const state = entry.state;
      state.cooldown = tickCooldown(state.cooldown, dt);
      if (mind.kind === "still") {
        state.wanderTo = null;
        return { mode: "still", targetId: null, struck: false, reason: "still" };
      }
      if (mind.kind === "tamed") {
        const { intent } = mind;
        if (intent.targetId !== null && body.attack !== null) {
          const struck = fight(ctx, id, state, body, intent.targetId, dt);
          return { mode: intent.kind, targetId: intent.targetId, struck, reason: intent.kind === "assist" ? "fighting its owner's fight" : "defending" };
        }
        if (intent.leashTo === null) return graze(ctx, id, state, body, dt);
        const gap = intent.anchor === "owner" ? FOLLOW_GAP : 0.5;
        const far = flat(self.position, intent.leashTo) > RUN_TO_CATCH_UP;
        if (travel(ctx, id, intent.leashTo, far ? body.sprint : body.walk, gap, dt)) settle(ctx, id);
        return { mode: intent.kind, targetId: null, struck: false, reason: intent.anchor === "owner" ? "following" : "staying" };
      }
      // Wild: sense what is near, then let the temperament decide.
      const notices = config.notices ?? ((context: GameContext, _self: string, candidate: string) => context.scene.entity.get(candidate)?.role === "player");
      const candidates = ctx.scene.entity.inRadius(id, sight, (candidate) => candidate !== id && notices(ctx, id, candidate))
        .map((candidate) => ({ id: candidate, position: ctx.scene.entity.get(candidate)!.position }));
      const now = ctx.time.now() * 1000;
      entry.senses.observe({ id, position: self.position, yaw: self.rotationY }, candidates, now);
      if (state.grudge !== null && state.grudge.until <= ctx.time.now()) state.grudge = null;
      const grudge = state.grudge;
      const health = ctx.scene.entity.stats.get(id, "health");
      // It strikes from where its body reaches, so the temperament's charge stops where the bite lands.
      const temperament = body.attack === null ? mind.temperament : { ...mind.temperament, attackRange: body.attack.reach };
      const intent = decideTemperament(temperament, {
        position: self.position,
        home: state.home,
        health: health === null || health.max <= 0 ? 1 : health.current / health.max,
        memories: entry.senses.memory(id).map((memory) => (grudge !== null && memory.targetId === grudge.id ? { ...memory, cue: "damage" as const } : memory)),
      });
      if (intent.mode === "idle") return graze(ctx, id, state, body, dt);
      if (intent.mode === "attack" && intent.targetId !== null) {
        const struck = fight(ctx, id, state, body, intent.targetId, dt);
        return { mode: intent.mode, targetId: intent.targetId, struck, reason: intent.reason };
      }
      state.wanderTo = null;
      if (intent.mode === "flee") {
        travel(ctx, id, fleeGoal(ctx, self.position, intent.targetId, intent.goal), body.sprint, 0, dt);
      } else if (intent.goal === null) {
        if (intent.targetId !== null) face(ctx, id, intent.targetId);
        settle(ctx, id);
      } else {
        const hurry = intent.mode === "stalk";
        const stop = intent.mode === "stalk" ? (body.attack?.reach ?? 1.5) * 0.8 : 0.5;
        travel(ctx, id, intent.goal, hurry ? body.sprint : body.walk, stop, dt);
      }
      return { mode: intent.mode, targetId: intent.targetId, struck: false, reason: intent.reason };
    },
    state: (id) => driven.get(id)?.state ?? null,
    setHome(id, home) {
      const entry = driven.get(id);
      if (entry !== undefined) entry.state.home = [home[0], home[1], home[2]];
    },
    snapshot: () => Object.fromEntries([...driven].map(([id, entry]) => [id, structuredClone(entry.state)])),
    restore(data) {
      for (const entry of driven.values()) entry.senses.dispose();
      driven.clear();
      for (const [id, state] of Object.entries(data)) driven.set(id, { state: structuredClone(state), senses: senses() });
    },
    reset() {
      for (const entry of driven.values()) entry.senses.dispose();
      driven.clear();
    },
  };
}
