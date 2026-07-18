import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { tickDrivableVehicle } from "@jgengine/core/physics/drivableVehicle";
import { advanceHeat, createHeatState, type HeatConfig, type HeatGain, type HeatState } from "@jgengine/core/ai/heatSystem";
import { behaviorControl } from "@jgengine/core/scene/behaviorRuntime";
import { seededRng } from "@jgengine/core/random/rng";
import { vehicleById } from "../entities/vehicles/catalog";
import type { Driving } from "./driving";
import { MAX_STARS, PURSUIT_STARS, wantedStore, type WantedSnapshot } from "./shared";

const HEAT_CONFIG: HeatConfig = {
  levels: [1, 2, 3, 4, 5].map((level) => ({ level, threshold: level * 100, pursuerBudget: level * 2 })),
  maxHeat: MAX_STARS * 100,
  decayPerSecond: 7,
  decayDelaySeconds: 0,
  standDownSeconds: 6,
  spawnRingRadius: [46, 66],
  seed: 20260712,
};

/**
 * The pursuit slice: wanted heat, the cops chasing on foot, and the cruiser cars — all keyed off the
 * player's world position, which it reads through the {@link Driving} seam. Cruiser cars reuse driving's
 * vehicle registry (`makeCarSim`/`refreshClamp`/`dropCarSim`/`cruiserVehicles`).
 */
export interface Pursuit {
  addHeat(ctx: GameContext, amount: number): void;
  clearWanted(ctx: GameContext): void;
  wanted(): WantedSnapshot;
  tickWanted(ctx: GameContext, dt: number): void;
  tickPedPanic(ctx: GameContext): void;
  tickCops(ctx: GameContext, dt: number): void;
  tickCruisers(ctx: GameContext, dt: number): void;
}

export function createPursuit(driving: Driving): Pursuit {
  let heatState: HeatState = createHeatState(HEAT_CONFIG);
  let peakStars = 0;
  let pendingGains: HeatGain[] = [];
  let copTimer = 0;
  let copCounter = 0;
  let lastPanicking = false;
  const rng = seededRng("vice-isle-cops");
  let cruiserCounter = 0;
  let cruiserTimer = 0;

  function publishWanted(ctx: GameContext): void {
    wantedStore.write(ctx, { heat: heatState.heat, stars: heatState.level, peakStars } satisfies WantedSnapshot);
  }

  function tickWanted(ctx: GameContext, dt: number): void {
    const playerPos = driving.playerWorldPos(ctx);
    if (playerPos === null) return;
    const cops = ctx.scene.entity.list().filter((e) => e.name === "cop_patrol" || e.name === "cop_swat");
    const anyCopClose = cops.some((cop) => Math.hypot(cop.position[0] - playerPos[0], cop.position[2] - playerPos[2]) < 60);

    const step = advanceHeat(HEAT_CONFIG, heatState, dt, pendingGains, {
      nearWitness: anyCopClose,
      activePursuers: cops.length,
      around: [playerPos[0], playerPos[2]],
    });
    heatState = step.state;
    peakStars = Math.max(peakStars, heatState.level);
    pendingGains = [];
    publishWanted(ctx);

    if (step.standDown) {
      for (const cop of cops) ctx.scene.entity.despawn(cop.id);
      for (const cruiser of ctx.scene.entity.list().filter((e) => e.id.startsWith("cruiser_"))) {
        ctx.scene.entity.despawn(cruiser.id);
        driving.dropCarSim(cruiser.id);
      }
      return;
    }

    if (step.wantSpawns > 0) {
      copTimer -= dt;
      if (copTimer <= 0) {
        copTimer = Math.max(2, 8 - heatState.level * 1.2);
        copCounter += 1;
        const [x, z] = step.spawnPoints[0]!;
        ctx.scene.entity.spawn(heatState.level >= 4 ? "cop_swat" : "cop_patrol", {
          id: `cop_${copCounter}`,
          position: [x, ctx.world.groundHeightAt(x, z), z],
          role: "npc",
        });
      }
    }
  }

  function tickCops(ctx: GameContext, dt: number): void {
    const playerPos = driving.playerWorldPos(ctx);
    if (playerPos === null) return;
    const cops = ctx.scene.entity.list().filter((e) => e.name === "cop_patrol" || e.name === "cop_swat");
    const now = ctx.time.now();

    for (const cop of cops) {
      const dist = Math.hypot(cop.position[0] - playerPos[0], cop.position[2] - playerPos[2]);
      if (heatState.level === 0) {
        if (dist > 70) ctx.scene.entity.despawn(cop.id);
        continue;
      }
      if (dist > 2.5) {
        ctx.scene.entity.moveToward(cop.id, [playerPos[0], playerPos[1], playerPos[2]], {
          speed: cop.name === "cop_swat" ? 5.6 : 5.2,
          stopDistance: 2,
          dt,
        });
      }
      if (dist < 16 && ctx.scene.entity.hasLineOfSight(cop.id, ctx.player.userId)) {
        const meta = (cop.meta ?? {}) as { nextShotAt?: number };
        if ((meta.nextShotAt ?? 0) <= now) {
          ctx.scene.entity.update(cop.id, { meta: { ...meta, nextShotAt: now + (cop.name === "cop_swat" ? 0.7 : 1.2) } });
          ctx.scene.entity.effect({
            from: cop.id,
            to: ctx.player.userId,
            effect: "damage",
            via: { amount: cop.name === "cop_swat" ? 9 : 5 },
          });
        }
      }
    }
  }

  function tickCruisers(ctx: GameContext, dt: number): void {
    const level = heatState.level;
    const target = driving.playerWorldPos(ctx);
    if (target === null) return;
    const cruisers = ctx.scene.entity.list().filter((e) => e.id.startsWith("cruiser_"));

    if (level >= PURSUIT_STARS) {
      cruiserTimer -= dt;
      if (cruiserTimer <= 0 && cruisers.length < level - 1) {
        cruiserTimer = 9;
        cruiserCounter += 1;
        const angle = rng() * Math.PI * 2;
        const x = target[0] + Math.sin(angle) * 70;
        const z = target[2] + Math.cos(angle) * 70;
        const id = `cruiser_${cruiserCounter}`;
        ctx.scene.entity.spawn("car_cop", { id, position: [x, ctx.world.groundHeightAt(x, z), z], role: "prop" });
        const copDef = vehicleById("car_cop")!;
        if (copDef.dynamics.type === "ground") {
          driving.cruiserVehicles.set(
            id,
            driving.makeCarSim(id, copDef.dynamics.tuning, copDef.collisionRadius, [x, 0, z], Math.atan2(target[0] - x, target[2] - z)),
          );
        }
      }
    }

    for (const cruiser of cruisers) {
      const vehicle = driving.cruiserVehicles.get(cruiser.id);
      if (vehicle === undefined) continue;
      const pose = vehicle.pose();
      const dist = Math.hypot(pose.position[0] - target[0], pose.position[2] - target[2]);
      if (level < PURSUIT_STARS) {
        if (dist > 60) {
          ctx.scene.entity.despawn(cruiser.id);
          driving.dropCarSim(cruiser.id);
        }
        continue;
      }
      const desired = Math.atan2(target[0] - pose.position[0], target[2] - pose.position[2]);
      let error = desired - pose.heading;
      while (error > Math.PI) error -= Math.PI * 2;
      while (error < -Math.PI) error += Math.PI * 2;
      const axis = { throttle: dist > 6 ? 1 : 0.2, brake: 0, steer: Math.max(-1, Math.min(1, error * 2)), handbrake: 0 };
      driving.refreshClamp(ctx, cruiser.id, pose.position, dt);
      const result = tickDrivableVehicle(vehicle, dt, axis, { groundHeight: (x, z) => ctx.world.groundHeightAt(x, z) });
      ctx.scene.entity.setPose(cruiser.id, result.pose);
      const drivenId = driving.drivingVehicleId();
      if (dist < 4 && drivenId !== null) {
        ctx.scene.entity.effect({ from: cruiser.id, to: drivenId, effect: "damage", via: { amount: Math.round(24 * dt * 10) / 10 } });
      }
    }
  }

  /**
   * Freeze pedestrian route behaviors while the player is wanted and thaw them once the heat is
   * gone — pose ownership handed to the behavior lifecycle instead of a hand-rolled traffic loop.
   * Runs only on the panic-state transition, so it never scans every frame.
   */
  function tickPedPanic(ctx: GameContext): void {
    const panicking = heatState.level > 0;
    if (panicking === lastPanicking) return;
    const control = behaviorControl(ctx);
    for (const info of control.list()) {
      if (!info.id.startsWith("ped_")) continue;
      if (panicking) control.disable(info.id, "panic");
      else control.enable(info.id);
    }
    lastPanicking = panicking;
  }

  return {
    addHeat(_ctx, amount) {
      pendingGains.push({ amount, witnessed: true });
    },
    clearWanted(ctx) {
      heatState = createHeatState(HEAT_CONFIG);
      peakStars = 0;
      pendingGains = [];
      publishWanted(ctx);
    },
    wanted: () => ({ heat: heatState.heat, stars: heatState.level, peakStars }),
    tickWanted,
    tickPedPanic,
    tickCops,
    tickCruisers,
  };
}
