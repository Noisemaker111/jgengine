import { cameraShake } from "@jgengine/shell/camera";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import type { AxisBindingMap } from "@jgengine/core/input/axisInput";
import {
  createAircraftDynamics,
  createKinematicVehicle,
  createVehicleObstacleClamp,
  distanceToRoadEdge,
  roadSurfaceSampler,
  type AircraftDynamics,
  type AircraftStep,
  type CollisionObstacle,
  type KinematicVehicle,
  type KinematicVehicleStep,
  type KinematicVehicleTuning,
  type VehicleObstacleClamp,
} from "@jgengine/core/world";
import type { AxisInput } from "@jgengine/core/input/axisInput";
import { tickDrivableVehicle } from "@jgengine/core/physics/drivableVehicle";
import { createVehicleSeats, type VehicleSeats } from "@jgengine/core/scene/vehicleSeat";
import { advanceHeat, createHeatState, type HeatConfig, type HeatGain, type HeatState } from "@jgengine/core/ai/heatSystem";
import { advancePathFollow, createPathFollow, type PathFollowConfig, type PathFollowState } from "@jgengine/core/nav/pathFollow";
import { behaviorControl } from "@jgengine/core/scene/behaviorRuntime";
import { seededRng } from "@jgengine/core/random/rng";
import { createRaceState, firstPastPost, raceTrack, type RaceState } from "@jgengine/core/game/race";
import { streets } from "../world";
import { RACE_CHECKPOINTS } from "./world/districts";
import { vehicleById, type VehicleDef } from "./entities/vehicles/catalog";
import { objectById as objectDefById } from "./objects/catalog";
import { createDrivingAudio, type DrivingAudio } from "./audio/driving";

/** Road-grip sampler for the car sims: full bite on asphalt, a linear washout across the curb, less off-road. */
const SURFACE_SAMPLER = roadSurfaceSampler(streets, { onRoad: 1, offRoad: 0.72, shoulder: 3 });
/** Extra velocity drag once off the road, ramping to ~0.35/s across the shoulder band — grass slows a car. */
function offRoadDrag(x: number, z: number): number {
  const edge = distanceToRoadEdge(streets, x, z);
  if (edge <= 0) return 0;
  return 0.35 * Math.min(1, edge / 3);
}
/** How far around a car to gather solids (buildings, other cars) for the obstacle clamp, world units. */
const OBSTACLE_GATHER = 30;

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

export interface RaceSnapshot {
  active: boolean;
  checkpoint: number;
  total: number;
  position: number;
  timeSec: number;
  finished: boolean;
  won: boolean;
}

export interface VehicleTelemetry {
  mode: "ground" | "aircraft";
  speedKmh: number;
  altitude: number;
  verticalSpeed: number;
  gear: number;
  rpm: number;
  stalled: boolean;
  vtol: boolean;
}

export const wantedStore = defineStore<WantedSnapshot | undefined>("vice.wanted", undefined);
export const drivingStore = defineStore<string | null | undefined>("vice.driving", undefined);
export const raceStore = defineStore<RaceSnapshot | undefined>("vice.race", undefined);

export interface Handroll {
  enterVehicle(ctx: GameContext, vehicleId: string): void;
  exitVehicle(ctx: GameContext): void;
  drivingVehicleId(): string | null;
  carSpeedKmh(): number;
  telemetry(): VehicleTelemetry;
  tick(ctx: GameContext, dt: number): void;
  addHeat(ctx: GameContext, amount: number): void;
  clearWanted(ctx: GameContext): void;
  wanted(): WantedSnapshot;
  startRace(ctx: GameContext): boolean;
  raceActive(): boolean;
  explodeVehicle(ctx: GameContext, vehicleId: string, at: readonly [number, number, number]): void;
}

export function createHandroll(): Handroll {
  const carVehicles = new Map<string, KinematicVehicle>();
  const cruiserVehicles = new Map<string, KinematicVehicle>();
  /** Per-car slide-along clamp + the tick-fresh solid set / dt its hooks read. Keyed by scene entity id. */
  const carClamps = new Map<string, { clamp: VehicleObstacleClamp; frame: { obstacles: CollisionObstacle[]; dt: number }; radius: number }>();
  const drivingAudio: DrivingAudio = createDrivingAudio();
  const aircraft = new Map<string, AircraftDynamics>();
  const flightThrottles = new Map<string, number>();
  const vtolModes = new Map<string, boolean>();
  const vehicleSeats: VehicleSeats = createVehicleSeats();
  let driving: string | null = null;
  let lastSpeedKmh = 0;
  let lastTelemetry: VehicleTelemetry = { mode: "ground", speedKmh: 0, altitude: 0, verticalSpeed: 0, gear: 1, rpm: 0, stalled: false, vtol: false };
  let heatState: HeatState = createHeatState(HEAT_CONFIG);
  let peakStars = 0;
  let pendingGains: HeatGain[] = [];
  let copTimer = 0;
  let copCounter = 0;
  let lastPanicking = false;
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

  /**
   * The solids a car should slide along this tick (#1051): every nearby *solid* scene object (buildings,
   * crates, planters — never the light `obj_*` props a car flattens) plus every other ground vehicle,
   * excluding the car itself. A bounded ~30u gather over the scene lists, cheap enough for the hot path.
   */
  function gatherObstacles(
    ctx: GameContext,
    selfId: string,
    position: readonly [number, number, number],
    radius: number,
  ): CollisionObstacle[] {
    const cx = position[0];
    const cz = position[2];
    const reachSq = OBSTACLE_GATHER * OBSTACLE_GATHER;
    const result: CollisionObstacle[] = [];
    for (const obj of ctx.scene.object.list()) {
      const def = objectDefById(obj.catalogId);
      if (def === undefined || !def.solid) continue;
      const dx = obj.position[0] - cx;
      const dz = obj.position[2] - cz;
      if (dx * dx + dz * dz > reachSq) continue;
      result.push({
        position: obj.position,
        halfExtents: [def.footprint.w / 2, def.footprint.h / 2, def.footprint.d / 2],
      });
    }
    for (const entity of ctx.scene.entity.list()) {
      if (entity.id === selfId) continue;
      const vdef = vehicleById(entity.name);
      if (vdef === undefined || vdef.dynamics.type !== "ground") continue;
      const dx = entity.position[0] - cx;
      const dz = entity.position[2] - cz;
      if (dx * dx + dz * dz > reachSq) continue;
      const r = vdef.collisionRadius;
      result.push({ position: entity.position, halfExtents: [r, 1.2, r] });
    }
    return result;
  }

  /** Build a road-aware car sim with a slide-along obstacle clamp, and register the clamp for tick refresh. */
  function makeCarSim(
    vehicleId: string,
    tuning: KinematicVehicleTuning,
    radius: number,
    position: readonly [number, number, number],
    heading: number,
  ): KinematicVehicle {
    const frame = { obstacles: [] as CollisionObstacle[], dt: 0 };
    const clamp = createVehicleObstacleClamp({
      obstacles: () => frame.obstacles,
      dt: () => frame.dt,
      radius,
    });
    carClamps.set(vehicleId, { clamp, frame, radius });
    return createKinematicVehicle(tuning, {
      position,
      heading,
      surfaceFriction: SURFACE_SAMPLER,
      dragAt: offRoadDrag,
      clampMove: clamp.clampMove,
    });
  }

  /** Refresh a car's clamp with this tick's nearby solids and dt, right before stepping its sim. */
  function refreshClamp(ctx: GameContext, vehicleId: string, position: readonly [number, number, number], dt: number): void {
    const record = carClamps.get(vehicleId);
    if (record === undefined) return;
    record.frame.obstacles = gatherObstacles(ctx, vehicleId, position, record.radius);
    record.frame.dt = dt;
  }

  function dropCarSim(vehicleId: string): void {
    carVehicles.delete(vehicleId);
    cruiserVehicles.delete(vehicleId);
    carClamps.delete(vehicleId);
  }

  function carVehicleFor(ctx: GameContext, vehicleId: string): KinematicVehicle {
    const existing = carVehicles.get(vehicleId);
    if (existing !== undefined) return existing;
    const entity = ctx.scene.entity.get(vehicleId);
    const definition = vehicleById(entity?.name ?? "");
    const fallback = vehicleById("car_compact");
    const def = definition?.dynamics.type === "ground" ? definition : fallback;
    if (def === undefined || def.dynamics.type !== "ground") throw new Error("car_compact must use ground dynamics");
    const created = makeCarSim(
      vehicleId,
      def.dynamics.tuning,
      def.collisionRadius,
      entity?.position ?? [0, 0, 0],
      entity?.rotationY ?? 0,
    );
    carVehicles.set(vehicleId, created);
    return created;
  }

  /**
   * Crash / prop / pedestrian reactions plus engine audio for the player's driven car (#1051): consume
   * the obstacle clamp's impact for shake + a metal-crunch cue (and hull damage on a hard hit), flatten
   * light props the car drove through, run over any ped/cop under the wheels, and feed the driving audio.
   */
  function tickDrivingReactions(
    ctx: GameContext,
    vehicleId: string,
    sim: KinematicVehicle,
    step: KinematicVehicleStep,
    axis: AxisInput,
    def: VehicleDef | undefined,
  ): void {
    const entity = ctx.scene.entity.get(vehicleId);
    if (entity === null) return;
    const pos = entity.position;
    const record = carClamps.get(vehicleId);
    const radius = record?.radius ?? 1.4;
    const speed = Math.abs(step.forwardSpeed);

    const impact = record?.clamp.takeImpact() ?? null;
    if (impact !== null && impact.closingSpeed > 3) {
      const cs = impact.closingSpeed;
      cameraShake(Math.min(0.15 + cs * 0.02, 0.8));
      ctx.game.audio.play(cs > 8 ? "crash_hard" : "crash_soft", pos);
      if (cs > 8) {
        ctx.scene.entity.effect({ from: vehicleId, to: vehicleId, effect: "damage", via: { amount: Math.round((cs - 8) * 7) } });
        ctx.scene.entity.vfx({ kind: "spark", color: 0xffc24a, from: vehicleId, radius: 1.6 });
      }
    }

    if (speed > 4) {
      const reach = radius + 1;
      const reachSq = reach * reach;
      for (const obj of ctx.scene.object.list()) {
        const objDef = objectDefById(obj.catalogId);
        if (objDef === undefined || objDef.solid || !obj.catalogId.startsWith("obj_")) continue;
        const dx = obj.position[0] - pos[0];
        const dz = obj.position[2] - pos[2];
        if (dx * dx + dz * dz > reachSq) continue;
        ctx.scene.object.remove(obj.instanceId);
        ctx.scene.entity.vfx({ kind: "spark", color: 0x9a7b4f, from: obj.position, radius: 1 });
        ctx.game.audio.play("prop_thunk", obj.position);
        sim.scaleVelocity(0.985);
      }
    }

    if (speed > 5) {
      const reach = radius + 0.6;
      for (const otherId of ctx.scene.entity.inRadius(pos, reach)) {
        const other = ctx.scene.entity.get(otherId);
        if (other === null) continue;
        if (!(other.name.startsWith("ped_") || other.name === "cop_patrol" || other.name === "cop_swat")) continue;
        ctx.scene.entity.effect({ from: vehicleId, to: otherId, effect: "damage", via: { amount: Math.round(20 + 2 * speed) } });
        ctx.game.audio.play("ped_thump", other.position);
        sim.scaleVelocity(0.99);
      }
    }

    const powertrain = def?.dynamics.type === "ground" ? def.dynamics.tuning.powertrain : undefined;
    const idle = powertrain?.idleRpm ?? 850;
    const redline = powertrain?.redlineRpm ?? 7600;
    drivingAudio.tick(ctx, {
      position: pos,
      throttle: axis.throttle,
      normRpm: (step.rpm - idle) / Math.max(1, redline - idle),
      slip: step.slip,
      wheelspin: step.wheelspin,
      speed,
      gear: step.gear,
    });
  }

  function aircraftFor(ctx: GameContext, vehicleId: string): AircraftDynamics {
    const existing = aircraft.get(vehicleId);
    if (existing !== undefined) return existing;
    const entity = ctx.scene.entity.get(vehicleId);
    const definition = vehicleById(entity?.name ?? "");
    if (definition?.dynamics.type !== "aircraft") throw new Error(`vehicle ${entity?.name ?? vehicleId} has no aircraft tuning`);
    const created = createAircraftDynamics(definition.dynamics.tuning, {
      position: entity?.position ?? [0, 0, 0],
      rotation: [entity?.rotationX ?? 0, entity?.rotationY ?? 0, entity?.rotationZ ?? 0],
      groundHeight: (x, z) => ctx.world.groundHeightAt(x, z),
    });
    aircraft.set(vehicleId, created);
    flightThrottles.set(vehicleId, definition.dynamics.tuning.kind === "rotorcraft" ? 0.78 : 0.62);
    vtolModes.set(vehicleId, definition.dynamics.tuning.kind === "vtol");
    return created;
  }

  function tickAircraft(ctx: GameContext, vehicleId: string, dt: number): AircraftStep {
    const entity = ctx.scene.entity.get(vehicleId)!;
    const definition = vehicleById(entity.name)!;
    const model = aircraftFor(ctx, vehicleId);
    const throttleRate = 0.42;
    const throttle = Math.max(0, Math.min(1, (flightThrottles.get(vehicleId) ?? 0.6) + ((ctx.input.isDown("flightThrottleUp") ? 1 : 0) - (ctx.input.isDown("flightThrottleDown") ? 1 : 0)) * throttleRate * dt));
    flightThrottles.set(vehicleId, throttle);
    if (ctx.input.justPressed("flightVectorToggle") && definition.dynamics.type === "aircraft" && definition.dynamics.tuning.kind === "vtol") {
      vtolModes.set(vehicleId, !(vtolModes.get(vehicleId) ?? true));
    }
    const step = model.tick(dt, {
      throttle,
      collective: throttle,
      pitch: (ctx.input.isDown("moveBack") ? 1 : 0) - (ctx.input.isDown("moveForward") ? 1 : 0),
      roll: (ctx.input.isDown("moveRight") ? 1 : 0) - (ctx.input.isDown("moveLeft") ? 1 : 0),
      yaw: (ctx.input.isDown("flightYawRight") ? 1 : 0) - (ctx.input.isDown("flightYawLeft") ? 1 : 0),
      airbrake: ctx.input.isDown("flightAirbrake") ? 1 : 0,
      afterburner: ctx.input.isDown("jump") ? 1 : 0,
      vectoring: vtolModes.get(vehicleId) === true ? 1 : 0,
    });
    ctx.scene.entity.setPose(vehicleId, {
      position: step.position,
      rotationX: step.rotation[0],
      rotationY: step.rotation[1],
      rotationZ: step.rotation[2],
      dt,
    });
    lastTelemetry = {
      mode: "aircraft",
      speedKmh: step.airspeed * 3.6,
      altitude: step.position[1] - ctx.world.groundHeightAt(step.position[0], step.position[2]),
      verticalSpeed: step.verticalSpeed,
      gear: 0,
      rpm: throttle * 100,
      stalled: step.stalled,
      vtol: vtolModes.get(vehicleId) === true,
    };
    lastSpeedKmh = lastTelemetry.speedKmh;
    return step;
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
        dropCarSim(cruiser.id);
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
    const playerPos = playerWorldPos(ctx);
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
        const copDef = vehicleById("car_cop")!;
        if (copDef.dynamics.type === "ground") {
          cruiserVehicles.set(
            id,
            makeCarSim(id, copDef.dynamics.tuning, copDef.collisionRadius, [x, 0, z], Math.atan2(target[0] - x, target[2] - z)),
          );
        }
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
          dropCarSim(cruiser.id);
        }
        continue;
      }
      const desired = Math.atan2(target[0] - pose.position[0], target[2] - pose.position[2]);
      let error = desired - pose.heading;
      while (error > Math.PI) error -= Math.PI * 2;
      while (error < -Math.PI) error += Math.PI * 2;
      const axis = { throttle: dist > 6 ? 1 : 0.2, brake: 0, steer: Math.max(-1, Math.min(1, error * 2)), handbrake: 0 };
      refreshClamp(ctx, cruiser.id, pose.position, dt);
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
    enterVehicle(ctx, vehicleId) {
      if (driving !== null) return;
      const definition = vehicleById(ctx.scene.entity.get(vehicleId)?.name ?? "");
      if (definition === undefined) return;
      if (!vehicleSeats.mounts.isRegistered(vehicleId)) {
        vehicleSeats.register({ id: vehicleId, kit: { kind: definition.dynamics.type === "aircraft" ? "flying" : "ground" } });
      }
      const result = vehicleSeats.enter(ctx.player.userId, vehicleId);
      if (!result.ok) return;
      driving = vehicleId;
      if (definition.dynamics.type === "aircraft") {
        aircraftFor(ctx, vehicleId);
      } else {
        // A route car the player commandeers stops its patrol; player input owns its pose now.
        behaviorControl(ctx).pause(vehicleId, "driven");
        carVehicleFor(ctx, vehicleId);
      }
      ctx.camera.follow(result.cameraTarget);
      setRiderFrozen(ctx, ctx.player.userId, result.riderMovementPatch.frozen);
      drivingStore.write(ctx, vehicleId);
    },
    exitVehicle(ctx) {
      if (driving === null) return;
      // Hand the car back to its route follower (if it had one) where it left off.
      behaviorControl(ctx).resume(driving);
      const vehicle = ctx.scene.entity.get(driving);
      const definition = vehicleById(vehicle?.name ?? "");
      if (definition?.dynamics.type === "aircraft" && vehicle !== null) {
        const altitude = vehicle.position[1] - ctx.world.groundHeightAt(vehicle.position[0], vehicle.position[2]);
        if (altitude > 3) {
          ctx.scene.entity.floatText({ instanceId: driving, text: "LAND BEFORE EXITING", kind: "warn" });
          return;
        }
      }
      const result = vehicleSeats.exit(ctx.player.userId, {
        position: vehicle?.position ?? [0, 0, 0],
        rotationY: vehicle?.rotationY ?? 0,
      });
      driving = null;
      drivingAudio.stop(ctx);
      lastSpeedKmh = 0;
      lastTelemetry = { mode: "ground", speedKmh: 0, altitude: 0, verticalSpeed: 0, gear: 1, rpm: 0, stalled: false, vtol: false };
      drivingStore.write(ctx, null);
      if (!result.ok) return;
      ctx.camera.follow(result.cameraTarget);
      setRiderFrozen(ctx, result.cameraTarget, result.riderMovementPatch.frozen);
      ctx.scene.entity.setPose(ctx.player.userId, { position: result.placement.position, rotationY: result.placement.rotationY });
    },
    drivingVehicleId: () => driving,
    carSpeedKmh: () => lastSpeedKmh,
    telemetry: () => lastTelemetry,
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
      if (vehicleById(ctx.scene.entity.get(driving)?.name ?? "")?.dynamics.type !== "ground") return false;
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
        drivingAudio.stop(ctx);
        lastSpeedKmh = 0;
        lastTelemetry = { mode: "ground", speedKmh: 0, altitude: 0, verticalSpeed: 0, gear: 1, rpm: 0, stalled: false, vtol: false };
        ctx.camera.follow(ctx.player.userId);
        const rider = ctx.scene.entity.get(ctx.player.userId);
        setRiderFrozen(ctx, ctx.player.userId, false);
        ctx.scene.entity.setPose(ctx.player.userId, { position: at, rotationY: rider?.rotationY ?? 0 });
        drivingStore.write(ctx, null);
        pendingGains.push({ amount: 60, witnessed: true });
      }
      dropCarSim(vehicleId);
      aircraft.delete(vehicleId);
      flightThrottles.delete(vehicleId);
      vtolModes.delete(vehicleId);
    },
    tick(ctx, dt) {
      if (driving !== null) {
        const vehicle = ctx.scene.entity.get(driving);
        if (vehicle === null) {
          driving = null;
        } else {
          const definition = vehicleById(vehicle.name);
          if (definition?.dynamics.type === "aircraft") {
            tickAircraft(ctx, driving, dt);
          } else {
            const kinematic = carVehicleFor(ctx, driving);
            const axis = ctx.input.axis(DRIVE_AXIS_BINDINGS);
            refreshClamp(ctx, driving, kinematic.pose().position, dt);
            const result = tickDrivableVehicle(kinematic, dt, axis, { groundHeight: (x, z) => ctx.world.groundHeightAt(x, z) });
            lastSpeedKmh = Math.abs(result.step.forwardSpeed) * 3.6;
            lastTelemetry = {
              mode: "ground",
              speedKmh: lastSpeedKmh,
              altitude: 0,
              verticalSpeed: 0,
              gear: result.step.gear,
              rpm: result.step.rpm,
              stalled: false,
              vtol: false,
            };
            ctx.scene.entity.setPose(driving, result.pose);
            tickDrivingReactions(ctx, driving, kinematic, result.step, axis, definition);
          }
          const driven = ctx.scene.entity.get(driving);
          if (driven === null) return;
          ctx.scene.entity.setPose(ctx.player.userId, {
            position: [driven.position[0], driven.position[1] + 0.4, driven.position[2]],
            rotationX: driven.rotationX,
            rotationY: driven.rotationY,
            rotationZ: driven.rotationZ,
          });
        }
      }
      tickWanted(ctx, dt);
      tickPedPanic(ctx);
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
