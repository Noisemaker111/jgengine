import { cameraShake } from "@jgengine/shell/camera";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import type { AxisBindingMap } from "@jgengine/core/input/axisInput";
import { createKinematicVehicle, type KinematicVehicle, type KinematicVehicleTuning } from "@jgengine/core/physics/kinematicVehicle";
import { tickDrivableVehicle } from "@jgengine/core/physics/drivableVehicle";
import { createVehicleSeats, type VehicleSeats } from "@jgengine/core/scene/vehicleSeat";
import { advanceHeat, createHeatState, type HeatConfig, type HeatGain, type HeatState } from "@jgengine/core/ai/heatSystem";
import { createMobBrain, type MobBrain, type MobBrainConfig } from "@jgengine/core/ai/mobBrain";
import { advancePathFollow, createPathFollow, type PathFollowConfig, type PathFollowState } from "@jgengine/core/nav/pathFollow";
import { seededRng } from "@jgengine/core/random/rng";
import { createRaceState, firstPastPost, raceTrack, type RaceState } from "@jgengine/core/game/race";
import { RACE_CHECKPOINTS } from "./world/districts";

export const CAR_TUNINGS: Record<string, KinematicVehicleTuning> = {
  car_compact: { engineAccel: 14, brakeAccel: 22, topSpeed: 20, reverseSpeed: 7, turnRate: 2.4, turnSpeedRef: 6, gripStrength: 8, handbrakeGrip: 0.3 },
  car_muscle: { engineAccel: 20, brakeAccel: 26, topSpeed: 28, reverseSpeed: 8, turnRate: 2.1, turnSpeedRef: 7, gripStrength: 6.5, handbrakeGrip: 0.22 },
  car_sport: { engineAccel: 26, brakeAccel: 30, topSpeed: 36, reverseSpeed: 9, turnRate: 2.5, turnSpeedRef: 8, gripStrength: 7.5, handbrakeGrip: 0.2 },
  car_cop: { engineAccel: 22, brakeAccel: 28, topSpeed: 30, reverseSpeed: 8, turnRate: 2.3, turnSpeedRef: 7, gripStrength: 7, handbrakeGrip: 0.22 },
};

/** Drive axes bound to this game's own action names, not raw key codes — the `ctx.input.axis` contract (#533.7). */
const DRIVE_AXIS_BINDINGS: AxisBindingMap = {
  throttle: { positive: ["moveForward"] },
  brake: { positive: ["moveBack"] },
  steer: { positive: ["moveRight"], negative: ["moveLeft"] },
  handbrake: { positive: ["jump"] },
};

export interface WantedSnapshot {
  heat: number;
  stars: number;
  peakStars: number;
}

export const MAX_STARS = 5;
export const PURSUIT_STARS = 3;
export const RIVAL_RACER_ID = "race_rival";

const HEAT_CONFIG: HeatConfig = {
  levels: [1, 2, 3, 4, 5].map((level) => ({ level, threshold: level * 100, pursuerBudget: level * 2 })),
  maxHeat: MAX_STARS * 100,
  decayPerSecond: 7,
  decayDelaySeconds: 0,
  standDownSeconds: 6,
  spawnRingRadius: [46, 66],
  seed: 20260712,
};

const COP_BRAIN_CONFIG: MobBrainConfig = {
  aggroRadius: Infinity,
  attackRange: 2.5,
  leashDistance: Infinity,
  wander: false,
};

export interface RaceSnapshot {
  active: boolean;
  checkpoint: number;
  total: number;
  position: number;
  timeSec: number;
  finished: boolean;
  won: boolean;
}

export const wantedStore = defineStore<WantedSnapshot | undefined>("vice.wanted", undefined);
export const drivingStore = defineStore<string | null | undefined>("vice.driving", undefined);
export const raceStore = defineStore<RaceSnapshot | undefined>("vice.race", undefined);

interface TrafficCar {
  entityId: string;
  config: PathFollowConfig;
  state: PathFollowState;
}

export interface Handroll {
  enterVehicle(ctx: GameContext, vehicleId: string): void;
  exitVehicle(ctx: GameContext): void;
  drivingVehicleId(): string | null;
  carSpeedKmh(): number;
  tick(ctx: GameContext, dt: number): void;
  addHeat(ctx: GameContext, amount: number): void;
  clearWanted(ctx: GameContext): void;
  wanted(): WantedSnapshot;
  registerRoute(entityId: string, waypoints: readonly (readonly [number, number])[], speed: number, startT: number): void;
  startRace(ctx: GameContext): boolean;
  raceActive(): boolean;
  explodeVehicle(ctx: GameContext, vehicleId: string, at: readonly [number, number, number]): void;
}

export function createHandroll(): Handroll {
  const carVehicles = new Map<string, KinematicVehicle>();
  const cruiserVehicles = new Map<string, KinematicVehicle>();
  const vehicleSeats: VehicleSeats = createVehicleSeats();
  let driving: string | null = null;
  let lastSpeedKmh = 0;
  let heatState: HeatState = createHeatState(HEAT_CONFIG);
  let peakStars = 0;
  let pendingGains: HeatGain[] = [];
  let copTimer = 0;
  let copCounter = 0;
  const copBrains = new Map<string, MobBrain>();
  const traffic: TrafficCar[] = [];
  const rng = seededRng("vice-isle-cops");
  let cruiserCounter = 0;
  let cruiserTimer = 0;
  let race: RaceState | null = null;
  let raceStartedAt = 0;
  let rivalState: PathFollowState | null = null;
  let rivalConfig: PathFollowConfig | null = null;

  function publishWanted(ctx: GameContext): void {
    wantedStore.write(ctx, { heat: heatState.heat, stars: heatState.level, peakStars } satisfies WantedSnapshot);
  }

  function carVehicleFor(ctx: GameContext, vehicleId: string): KinematicVehicle {
    const existing = carVehicles.get(vehicleId);
    if (existing !== undefined) return existing;
    const entity = ctx.scene.entity.get(vehicleId);
    const tuning = CAR_TUNINGS[entity?.name ?? ""] ?? CAR_TUNINGS.car_compact!;
    const created = createKinematicVehicle(tuning, {
      position: entity?.position ?? [0, 0, 0],
      heading: entity?.rotationY ?? 0,
    });
    carVehicles.set(vehicleId, created);
    return created;
  }

  function setRiderFrozen(ctx: GameContext, riderId: string, frozen: boolean): void {
    const rider = ctx.scene.entity.get(riderId);
    ctx.scene.entity.update(riderId, { movement: { ...(rider?.movement ?? {}), frozen } });
  }

  function playerWorldPos(ctx: GameContext): readonly [number, number, number] | null {
    if (driving !== null) {
      const vehicle = ctx.scene.entity.get(driving);
      if (vehicle !== null) return vehicle.position;
    }
    return ctx.scene.entity.get(ctx.player.userId)?.position ?? null;
  }

  function tickWanted(ctx: GameContext, dt: number): void {
    const playerPos = playerWorldPos(ctx);
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
        cruiserVehicles.delete(cruiser.id);
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

  function copBrainFor(ctx: GameContext, cop: { id: string; position: readonly [number, number, number] }): MobBrain {
    const existing = copBrains.get(cop.id);
    if (existing !== undefined) return existing;
    const brain = createMobBrain(COP_BRAIN_CONFIG, {
      home: cop.position,
      position: () => ctx.scene.entity.get(cop.id)?.position ?? null,
      targetPosition: (id) => (id === ctx.player.userId ? playerWorldPos(ctx) : null),
      candidates: () => [ctx.player.userId],
    });
    copBrains.set(cop.id, brain);
    return brain;
  }

  function tickCops(ctx: GameContext, dt: number): void {
    const playerPos = playerWorldPos(ctx);
    if (playerPos === null) return;
    const cops = ctx.scene.entity.list().filter((e) => e.name === "cop_patrol" || e.name === "cop_swat");
    const live = new Set(cops.map((cop) => cop.id));
    for (const id of copBrains.keys()) if (!live.has(id)) copBrains.delete(id);
    const now = ctx.time.now();

    for (const cop of cops) {
      const dist = Math.hypot(cop.position[0] - playerPos[0], cop.position[2] - playerPos[2]);
      if (heatState.level === 0) {
        if (dist > 70) {
          ctx.scene.entity.despawn(cop.id);
          copBrains.delete(cop.id);
        }
        continue;
      }
      const step = copBrainFor(ctx, cop).tick(dt);
      if (step.moveTo !== null) {
        ctx.scene.entity.moveToward(cop.id, step.moveTo, {
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
    const target = playerWorldPos(ctx);
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
        cruiserVehicles.set(
          id,
          createKinematicVehicle(CAR_TUNINGS.car_cop!, { position: [x, 0, z], heading: Math.atan2(target[0] - x, target[2] - z) }),
        );
      }
    }

    for (const cruiser of cruisers) {
      const vehicle = cruiserVehicles.get(cruiser.id);
      if (vehicle === undefined) continue;
      const pose = vehicle.pose();
      const dist = Math.hypot(pose.position[0] - target[0], pose.position[2] - target[2]);
      if (level < PURSUIT_STARS) {
        if (dist > 60) {
          ctx.scene.entity.despawn(cruiser.id);
          cruiserVehicles.delete(cruiser.id);
        }
        continue;
      }
      const desired = Math.atan2(target[0] - pose.position[0], target[2] - pose.position[2]);
      let error = desired - pose.heading;
      while (error > Math.PI) error -= Math.PI * 2;
      while (error < -Math.PI) error += Math.PI * 2;
      const axis = { throttle: dist > 6 ? 1 : 0.2, brake: 0, steer: Math.max(-1, Math.min(1, error * 2)), handbrake: 0 };
      const result = tickDrivableVehicle(vehicle, dt, axis, { groundHeight: (x, z) => ctx.world.groundHeightAt(x, z) });
      ctx.scene.entity.setPose(cruiser.id, result.pose);
      if (dist < 4 && driving !== null) {
        ctx.scene.entity.effect({ from: cruiser.id, to: driving, effect: "damage", via: { amount: Math.round(24 * dt * 10) / 10 } });
      }
    }
  }

  function publishRace(ctx: GameContext, snapshot: RaceSnapshot): void {
    raceStore.write(ctx, snapshot);
  }

  function endRace(ctx: GameContext, won: boolean): void {
    const standings = race?.standings() ?? [];
    const player = standings.find((s) => s.racerId === ctx.player.userId);
    publishRace(ctx, {
      active: false,
      checkpoint: player?.progress ?? 0,
      total: RACE_CHECKPOINTS.length,
      position: won ? 1 : 2,
      timeSec: ctx.time.now() - raceStartedAt,
      finished: true,
      won,
    });
    ctx.scene.entity.despawn(RIVAL_RACER_ID);
    race = null;
    rivalState = null;
    rivalConfig = null;
  }

  function tickRace(ctx: GameContext, dt: number): void {
    if (race === null || rivalConfig === null || rivalState === null) return;
    rivalState = advancePathFollow(rivalConfig, rivalState, dt);
    const [rx, , rz] = rivalState.position;
    ctx.scene.entity.setPose(RIVAL_RACER_ID, {
      position: [rx, ctx.world.groundHeightAt(rx, rz), rz],
      rotationY: rivalState.heading,
      dt,
    });
    const playerPos = playerWorldPos(ctx);
    if (playerPos === null) return;
    const events = race.update(ctx.time.now(), {
      [ctx.player.userId]: playerPos,
      [RIVAL_RACER_ID]: [rx, 0, rz] as const,
    });
    const finished = events.find((event) => event.type === "race.finished");
    if (finished !== undefined) {
      const standings = race.standings();
      endRace(ctx, standings[0]?.racerId === ctx.player.userId);
      return;
    }
    const player = race.standings().find((s) => s.racerId === ctx.player.userId);
    const rivalProgress = race.standings().find((s) => s.racerId === RIVAL_RACER_ID)?.progress ?? 0;
    publishRace(ctx, {
      active: true,
      checkpoint: player?.progress ?? 0,
      total: RACE_CHECKPOINTS.length,
      position: (player?.progress ?? 0) >= rivalProgress ? 1 : 2,
      timeSec: ctx.time.now() - raceStartedAt,
      finished: false,
      won: false,
    });
  }

  function tickTraffic(ctx: GameContext, dt: number): void {
    const panicking = heatState.level > 0;
    for (const car of traffic) {
      if (car.entityId === driving) continue;
      if (panicking && car.entityId.startsWith("ped_")) continue;
      car.state = advancePathFollow(car.config, car.state, dt);
      const [x, , z] = car.state.position;
      ctx.scene.entity.setPose(car.entityId, {
        position: [x, ctx.world.groundHeightAt(x, z), z],
        rotationY: car.state.heading,
        dt,
      });
    }
  }

  return {
    enterVehicle(ctx, vehicleId) {
      if (driving !== null) return;
      if (!vehicleSeats.mounts.isRegistered(vehicleId)) {
        vehicleSeats.register({ id: vehicleId, kit: { kind: "ground" } });
      }
      const result = vehicleSeats.enter(ctx.player.userId, vehicleId);
      if (!result.ok) return;
      driving = vehicleId;
      carVehicleFor(ctx, vehicleId);
      ctx.camera.follow(result.cameraTarget);
      setRiderFrozen(ctx, ctx.player.userId, result.riderMovementPatch.frozen);
      drivingStore.write(ctx, vehicleId);
    },
    exitVehicle(ctx) {
      if (driving === null) return;
      const vehicle = ctx.scene.entity.get(driving);
      const result = vehicleSeats.exit(ctx.player.userId, {
        position: vehicle?.position ?? [0, 0, 0],
        rotationY: vehicle?.rotationY ?? 0,
      });
      driving = null;
      lastSpeedKmh = 0;
      drivingStore.write(ctx, null);
      if (!result.ok) return;
      ctx.camera.follow(result.cameraTarget);
      setRiderFrozen(ctx, result.cameraTarget, result.riderMovementPatch.frozen);
      ctx.scene.entity.setPose(ctx.player.userId, { position: result.placement.position, rotationY: result.placement.rotationY });
    },
    drivingVehicleId: () => driving,
    carSpeedKmh: () => lastSpeedKmh,
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
    startRace(ctx) {
      if (race !== null) return false;
      if (driving === null) return false;
      const track = raceTrack({
        checkpoints: RACE_CHECKPOINTS.map(([x, z], i) => ({
          id: `cp_${i}`,
          center: [x, 2, z] as const,
          half: [10, 8, 10] as const,
        })),
        laps: 1,
      });
      race = createRaceState({ track, win: firstPastPost(1) });
      raceStartedAt = ctx.time.now();
      race.addRacer(ctx.player.userId, raceStartedAt);
      race.addRacer(RIVAL_RACER_ID, raceStartedAt);
      const start = RACE_CHECKPOINTS[RACE_CHECKPOINTS.length - 1]!;
      ctx.scene.entity.spawn("car_muscle", {
        id: RIVAL_RACER_ID,
        position: [start[0], ctx.world.groundHeightAt(start[0], start[1]), start[1]],
        role: "prop",
      });
      rivalConfig = {
        waypoints: [...RACE_CHECKPOINTS, RACE_CHECKPOINTS[0]!].map(([x, z]) => [x, 0, z] as const),
        speed: 15.5,
        loop: false,
      };
      rivalState = createPathFollow(rivalConfig);
      publishRace(ctx, {
        active: true,
        checkpoint: 0,
        total: RACE_CHECKPOINTS.length,
        position: 1,
        timeSec: 0,
        finished: false,
        won: false,
      });
      return true;
    },
    raceActive: () => race !== null,
    explodeVehicle(ctx, vehicleId, at) {
      cameraShake(0.7);
      ctx.scene.entity.effect({ from: vehicleId, at, radius: 6, effect: "damage", via: { amount: 55 } });
      if (driving === vehicleId) {
        vehicleSeats.mounts.dismount(ctx.player.userId);
        driving = null;
        lastSpeedKmh = 0;
        ctx.camera.follow(ctx.player.userId);
        const rider = ctx.scene.entity.get(ctx.player.userId);
        setRiderFrozen(ctx, ctx.player.userId, false);
        ctx.scene.entity.setPose(ctx.player.userId, { position: at, rotationY: rider?.rotationY ?? 0 });
        drivingStore.write(ctx, null);
        pendingGains.push({ amount: 60, witnessed: true });
      }
      carVehicles.delete(vehicleId);
      cruiserVehicles.delete(vehicleId);
    },
    registerRoute(entityId, waypoints, speed, startT) {
      if (waypoints.length < 2) return;
      const config: PathFollowConfig = {
        waypoints: waypoints.map(([x, z]) => [x, 0, z] as const),
        speed,
        loop: true,
      };
      let state = createPathFollow(config);
      state = advancePathFollow(config, state, startT);
      traffic.push({ entityId, config, state });
    },
    tick(ctx, dt) {
      if (driving !== null) {
        const vehicle = ctx.scene.entity.get(driving);
        if (vehicle === null) {
          driving = null;
        } else {
          const kinematic = carVehicleFor(ctx, driving);
          const axis = ctx.input.axis(DRIVE_AXIS_BINDINGS);
          const result = tickDrivableVehicle(kinematic, dt, axis, { groundHeight: (x, z) => ctx.world.groundHeightAt(x, z) });
          lastSpeedKmh = Math.abs(result.step.forwardSpeed) * 3.6;
          ctx.scene.entity.setPose(driving, result.pose);
          ctx.scene.entity.setPose(ctx.player.userId, {
            position: [result.pose.position[0], result.pose.position[1] + 0.4, result.pose.position[2]],
            rotationY: result.pose.rotationY,
          });
        }
      }
      tickTraffic(ctx, dt);
      tickWanted(ctx, dt);
      tickCops(ctx, dt);
      tickCruisers(ctx, dt);
      tickRace(ctx, dt);
    },
  };
}

export let handroll: Handroll = createHandroll();

export function resetHandroll(): Handroll {
  handroll = createHandroll();
  return handroll;
}
