import { seededRng } from "../random/rng";
import { advancePathFollow, createPathFollow, type PathFollowConfig, type PathFollowState } from "../nav/pathFollow";
import type { GameContext } from "../runtime/gameContext";
import { perContext } from "../runtime/perContext";

import type { PatrolBehavior, WanderBehavior } from "./behaviors";

const DEFAULT_WANDER_SPEED = 1.5;
const WANDER_ARRIVAL = 0.6;

interface PatrolNav {
  kind: "patrol";
  config: PathFollowConfig;
  state: PathFollowState;
}

interface WanderNav {
  kind: "wander";
  radius: number;
  origin: readonly [number, number, number];
  target: readonly [number, number, number] | null;
  roll: () => number;
}

type Nav = PatrolNav | WanderNav;

function patrolOf(entity: { behaviors: readonly { kind: string }[] }): PatrolBehavior | null {
  return (entity.behaviors.find((b) => b.kind === "patrol") as PatrolBehavior | undefined) ?? null;
}

function wanderOf(entity: { behaviors: readonly { kind: string }[] }): WanderBehavior | null {
  return (entity.behaviors.find((b) => b.kind === "wander") as WanderBehavior | undefined) ?? null;
}

const runtimeOf = perContext((ctx) => {
  const nav = new Map<string, Nav>();

  const refresh = (): void => {
    const live = new Set<string>();
    for (const entity of ctx.scene.entity.list()) {
      live.add(entity.id);
      if (nav.has(entity.id)) continue;
      const patrol = patrolOf(entity);
      if (patrol !== null) {
        nav.set(entity.id, {
          kind: "patrol",
          config: { waypoints: patrol.waypoints, speed: patrol.speed, loop: patrol.loop },
          state: createPathFollow({ waypoints: patrol.waypoints, speed: patrol.speed, loop: patrol.loop }),
        });
        continue;
      }
      const wander = wanderOf(entity);
      if (wander !== null) {
        nav.set(entity.id, {
          kind: "wander",
          radius: wander.radius,
          origin: entity.position,
          target: null,
          roll: seededRng(`wander:${entity.id}`),
        });
      }
    }
    for (const id of nav.keys()) if (!live.has(id)) nav.delete(id);
  };

  ctx.scene.entity.subscribeMembership(refresh);
  refresh();
  return { nav };
});

function stepWander(ctx: GameContext, id: string, nav: WanderNav, dt: number): void {
  const entity = ctx.scene.entity.get(id);
  if (entity === null) return;
  const [px, , pz] = entity.position;
  if (nav.target === null || Math.hypot(px - nav.target[0], pz - nav.target[2]) < WANDER_ARRIVAL) {
    const angle = nav.roll() * Math.PI * 2;
    const distance = Math.sqrt(nav.roll()) * nav.radius;
    const tx = nav.origin[0] + Math.cos(angle) * distance;
    const tz = nav.origin[2] + Math.sin(angle) * distance;
    nav.target = [tx, ctx.world.groundHeightAt(tx, tz), tz];
  }
  const speed = entity.movement.walkSpeed ?? DEFAULT_WANDER_SPEED;
  const dx = nav.target[0] - px;
  const dz = nav.target[2] - pz;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return;
  const step = Math.min(dist, speed * dt);
  const nx = px + (dx / dist) * step;
  const nz = pz + (dz / dist) * step;
  ctx.scene.entity.setPose(id, {
    position: [nx, ctx.world.groundHeightAt(nx, nz), nz],
    rotationY: Math.atan2(dx, dz),
    dt,
  });
}

/**
 * Advance every spawned entity carrying a `patrol` or `wander` {@link BehaviorDescriptor} one tick — the
 * engine reads the descriptor, keeps the per-entity nav state itself, and poses the entity, so ambient
 * traffic and idle NPC routes are register-once (attach the behavior at spawn) instead of a per-game
 * per-frame `advancePathFollow` + `setPose` loop. The shell/host call this each frame; a game never does.
 *
 * @capability behavior-tick auto-advance patrol/wander behaviors on spawned entities, no per-game route loop
 */
export function advanceBehaviors(ctx: GameContext, dt: number): void {
  if (dt <= 0) return;
  const { nav } = runtimeOf(ctx);
  if (nav.size === 0) return;
  for (const [id, entry] of nav) {
    if (entry.kind === "patrol") {
      entry.state = advancePathFollow(entry.config, entry.state, dt);
      ctx.scene.entity.setPose(id, { position: entry.state.position, rotationY: entry.state.heading, dt });
    } else {
      stepWander(ctx, id, entry, dt);
    }
  }
}
