import { cameraShake } from "@jgengine/shell/camera";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { ChaseCameraTuning } from "@jgengine/core/runtime/cameraDirector";
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
import { setTouchControlsMode } from "@jgengine/core/input/touchControlsMode";
import { createVehicleSeats, type VehicleSeats } from "@jgengine/core/scene/vehicleSeat";
import { behaviorControl } from "@jgengine/core/scene/behaviorRuntime";
import { streets } from "../../world";
import { vehicleById, type VehicleDef } from "../entities/vehicles/catalog";
import { objectById as objectDefById } from "../objects/catalog";
import { createDrivingAudio, type DrivingAudio } from "../audio/driving";
import { drivingStore, type VehicleTelemetry } from "./shared";
import { landBlast, landHit } from "../combat/hitModel";
import { crashVehicle, forgetVehicleDamage, rebaseVehicleDamage, restoreVehicleDamage, vehicleDamageSave } from "./bodywork";
import { crashShare, moddedTuning } from "../progression/upgrades";
import type { VehicleDamageState } from "@jgengine/core/physics/vehicleDamage";

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

/**
 * Driving-feel camera overlay (#1299): speed→FOV, velocity lead, bank-into-turns, speed shake, and
 * drift-lag apply only while a vehicle is piloted. The static `camera.chase` config in game.config.ts
 * is the on-foot baseline (flat FOV, none of these), so walking never pumps the lens or rolls the
 * horizon; enter/exit/explode swap this patch in and out via `ctx.camera.setChaseTuning`.
 */
const DRIVE_CAMERA_TUNING: ChaseCameraTuning = {
  // speedForMax tracks the retuned fleet tops (~34–52 m/s) so FOV still sells mid-speed punch.
  fov: { base: 60, max: 88, speedForMax: 48 },
  velocityYaw: { blend: 0.65, minSpeed: 12, response: 5.5 },
  shakePerSpeed: 0.0016,
  lead: { time: 0.24, max: 9 },
  bank: { perYawRate: 0.1, max: 0.18, damping: 6.5 },
};

/** A long body pulls the chase camera back and up so the bus is framed, not filling the screen. */
const LONG_BODY_CAMERA: Record<string, ChaseCameraTuning> = {
  car_bus: { ...DRIVE_CAMERA_TUNING, distance: 12.5, height: 4.6, lookHeight: 2.1 },
};

/** Drive axes bound to this game's own action names, not raw key codes — the `ctx.input.axis` contract (#533.7). */
const DRIVE_AXIS_BINDINGS: AxisBindingMap = {
  throttle: { positive: ["moveForward"] },
  brake: { positive: ["moveBack"] },
  steer: { positive: ["moveRight"], negative: ["moveLeft"] },
  handbrake: { positive: ["jump"] },
};

/**
 * The driving slice: the player's car/aircraft sims, per-car slide-along clamps, the vehicle-seat
 * mounts, and the shared vehicle registry (`makeCarSim`/`refreshClamp`/`dropCarSim`/`cruiserVehicles`)
 * the pursuit cruisers borrow. Owns `driving` (the currently piloted vehicle) and the latest telemetry.
 */
export interface Driving {
  enterVehicle(ctx: GameContext, vehicleId: string): void;
  exitVehicle(ctx: GameContext, force?: boolean): void;
  drivingVehicleId(): string | null;
  carSpeedKmh(): number;
  telemetry(): VehicleTelemetry;
  tickDriving(ctx: GameContext, dt: number): void;
  /** Blow up a vehicle; returns true when it was the one the player was driving (so heat can be added). */
  explodeVehicle(ctx: GameContext, vehicleId: string, at: readonly [number, number, number]): boolean;
  /** Each live car's bodywork stages, for the save document. */
  vehicleDamageSave(ctx: GameContext): Record<string, VehicleDamageState>;
  /** Re-apply saved bodywork to the cars a reload still has, handling included. */
  restoreVehicleDamage(ctx: GameContext, sections: Record<string, VehicleDamageState>): void;
  /** Re-bake every owned car's handling after a mod was bought; dents stay. */
  retuneOwnedCars(ctx: GameContext): void;
  playerWorldPos(ctx: GameContext): readonly [number, number, number] | null;
  /** Put a ground car somewhere else, at rest: the sim is rebuilt from the new pose on its next tick. */
  placeVehicle(ctx: GameContext, vehicleId: string, position: readonly [number, number, number], heading: number): void;
  makeCarSim(
    vehicleId: string,
    tuning: KinematicVehicleTuning,
    radius: number,
    position: readonly [number, number, number],
    heading: number,
  ): KinematicVehicle;
  refreshClamp(ctx: GameContext, vehicleId: string, position: readonly [number, number, number], dt: number): void;
  dropCarSim(vehicleId: string): void;
  readonly cruiserVehicles: Map<string, KinematicVehicle>;
}

export function createDriving(): Driving {
  const carVehicles = new Map<string, KinematicVehicle>();
  const cruiserVehicles = new Map<string, KinematicVehicle>();
  /** Per-car slide-along clamp + the tick-fresh solid set / dt its hooks read. Keyed by scene entity id. */
  const carClamps = new Map<string, { clamp: VehicleObstacleClamp; frame: { obstacles: CollisionObstacle[]; dt: number }; radius: number }>();
  /** A crashed car's re-baked tuning, so a car re-entered after a reload still drives dented. */
  const carTunings = new Map<string, KinematicVehicleTuning>();
  const drivingAudio: DrivingAudio = createDrivingAudio();
  const aircraft = new Map<string, AircraftDynamics>();
  const flightThrottles = new Map<string, number>();
  const vtolModes = new Map<string, boolean>();
  const vehicleSeats: VehicleSeats = createVehicleSeats();
  let driving: string | null = null;
  let lastTelemetry: VehicleTelemetry = { mode: "ground", speedMs: 0, altitude: 0, verticalSpeed: 0, gear: 1, rpm: 0, stalled: false, vtol: false };

  /**
   * The solids a car should slide along this tick (#1051): nearby *solid* scene objects (buildings,
   * crates — never light props a car flattens) plus other ground vehicles, excluding self. Uses the
   * object spatial `inBox` so a dense city does not re-scan every placed prop every tick.
   */
  function gatherObstacles(
    ctx: GameContext,
    selfId: string,
    position: readonly [number, number, number],
    radius: number,
  ): CollisionObstacle[] {
    const cx = position[0];
    const cy = position[1];
    const cz = position[2];
    const gather = OBSTACLE_GATHER + radius;
    const result: CollisionObstacle[] = [];
    for (const obj of ctx.scene.object.inBox(
      [cx - gather, cy - 4, cz - gather],
      [cx + gather, cy + 12, cz + gather],
    )) {
      const def = objectDefById(obj.catalogId);
      if (def === undefined || !def.solid) continue;
      result.push({
        position: obj.position,
        halfExtents: [def.footprint.w / 2, def.footprint.h / 2, def.footprint.d / 2],
      });
    }
    const reachSq = gather * gather;
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

  /** A car's handling before dents: stock for a stranger's car, with the bay's mods for one you own. */
  function baseTuning(ctx: GameContext, vehicleId: string, def: VehicleDef): KinematicVehicleTuning | null {
    if (def.dynamics.type !== "ground") return null;
    const owned = (ctx.scene.entity.get(vehicleId)?.meta as { owned?: boolean } | undefined)?.owned === true;
    return owned ? moddedTuning(ctx, def.dynamics.tuning) : def.dynamics.tuning;
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
      carTunings.get(vehicleId) ?? baseTuning(ctx, vehicleId, def) ?? def.dynamics.tuning,
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
      // Armored panels soak part of every crash an owned car takes.
      const share = (entity.meta as { owned?: boolean } | undefined)?.owned === true ? crashShare(ctx) : 1;
      const cs = impact.closingSpeed;
      cameraShake(Math.min(0.15 + cs * 0.02, 0.8));
      ctx.game.audio.play(cs > 8 ? "crash_hard" : "crash_soft", pos);
      if (cs > 8) {
        landHit(ctx, { from: vehicleId, to: vehicleId, type: "impact", base: Math.round((cs - 8) * 7 * share) });
        ctx.scene.entity.vfx({ kind: "spark", color: 0xffc24a, from: vehicleId, radius: 1.6 });
        // The bodywork takes the same hit: a zone steps a stage and the sim is re-baked with its cost.
        if (def !== undefined && def.dynamics.type === "ground") {
          const yaw = entity.rotationY;
          // The clamp's normal points back at the car, so the blow travels along its negation.
          const pushX = -impact.normal[0];
          const pushZ = -impact.normal[1];
          crashVehicle(
            ctx,
            vehicleId,
            baseTuning(ctx, vehicleId, def) ?? def.dynamics.tuning,
            {
              closingSpeed: cs * share,
              offsetRight: pushX * Math.cos(yaw) - pushZ * Math.sin(yaw),
              offsetForward: pushX * Math.sin(yaw) + pushZ * Math.cos(yaw),
            },
            (next) => {
              carTunings.set(vehicleId, next);
              sim.retune(next);
            },
          );
        }
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
        // Knock them off the path with a short fling + stun instead of a silent sit-jank death pose (#1519).
        behaviorControl(ctx).disable(otherId, "vehicle_hit");
        const ox = other.position[0] - pos[0];
        const oz = other.position[2] - pos[2];
        const len = Math.hypot(ox, oz) || 1;
        const push = Math.min(4.2, 1.2 + speed * 0.18);
        const nextX = other.position[0] + (ox / len) * push;
        const nextZ = other.position[2] + (oz / len) * push;
        const groundY = ctx.world.groundHeightAt(nextX, nextZ);
        ctx.scene.entity.setPose(otherId, {
          position: [nextX, groundY + 0.05, nextZ],
          rotationY: Math.atan2(ox, oz),
        });
        ctx.scene.entity.update(otherId, {
          movement: { ...(other.movement ?? {}), frozen: true, walkSpeed: 0 },
        });
        const amount = Math.round(8 + 1.4 * speed);
        landHit(ctx, { from: vehicleId, to: otherId, type: "impact", base: amount });
        ctx.scene.entity.vfx({ kind: "spark", color: 0xffe0a0, from: other.position, radius: 0.9 });
        ctx.scene.entity.floatText({ instanceId: otherId, text: speed > 14 ? "OOF" : "HEY!", kind: "warn" });
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
    // Analog stick sample (#1370): a touch joystick banks/pitches at its deflection; held keys
    // still read as full ±1 through the same axis contract.
    const stick = ctx.input.axis({
      pitch: { positive: ["moveBack"], negative: ["moveForward"] },
      roll: { positive: ["moveRight"], negative: ["moveLeft"] },
      yaw: { positive: ["flightYawRight"], negative: ["flightYawLeft"] },
    });
    const step = model.tick(dt, {
      throttle,
      collective: throttle,
      pitch: stick.pitch,
      roll: stick.roll,
      yaw: stick.yaw,
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
      speedMs: step.airspeed,
      altitude: step.position[1] - ctx.world.groundHeightAt(step.position[0], step.position[2]),
      verticalSpeed: step.verticalSpeed,
      gear: 0,
      rpm: throttle * 100,
      stalled: step.stalled,
      vtol: vtolModes.get(vehicleId) === true,
    };
    return step;
  }

  /** Seated riders freeze their own movement AND stop rendering (#1299) — the character model
   * otherwise pokes through the vehicle body it's posed inside every tick. */
  function setRiderSeated(ctx: GameContext, riderId: string, seated: boolean): void {
    const rider = ctx.scene.entity.get(riderId);
    ctx.scene.entity.update(riderId, { movement: { ...(rider?.movement ?? {}), frozen: seated }, hidden: seated });
  }

  function playerWorldPos(ctx: GameContext): readonly [number, number, number] | null {
    if (driving !== null) {
      const vehicle = ctx.scene.entity.get(driving);
      if (vehicle !== null) return vehicle.position;
    }
    return ctx.scene.entity.get(ctx.player.userId)?.position ?? null;
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
      ctx.camera.setChaseTuning(LONG_BODY_CAMERA[definition.id] ?? DRIVE_CAMERA_TUNING);
      setRiderSeated(ctx, ctx.player.userId, result.riderMovementPatch.frozen);
      drivingStore.write(ctx, vehicleId);
      setTouchControlsMode(ctx, definition.dynamics.type === "aircraft" ? "aircraft" : "car");
    },
    exitVehicle(ctx, force = false) {
      if (driving === null) return;
      const vehicle = ctx.scene.entity.get(driving);
      const definition = vehicleById(vehicle?.name ?? "");
      if (!force && definition?.dynamics.type === "aircraft" && vehicle !== null) {
        const altitude = vehicle.position[1] - ctx.world.groundHeightAt(vehicle.position[0], vehicle.position[2]);
        if (altitude > 3) {
          ctx.game.notices.push({ text: "Land before exiting.", tone: "deny" });
          return;
        }
      }
      const result = vehicleSeats.exit(ctx.player.userId, {
        position: vehicle?.position ?? [0, 0, 0],
        rotationY: vehicle?.rotationY ?? 0,
      });
      behaviorControl(ctx).resume(driving);
      driving = null;
      drivingAudio.stop(ctx);
      lastTelemetry = { mode: "ground", speedMs: 0, altitude: 0, verticalSpeed: 0, gear: 1, rpm: 0, stalled: false, vtol: false };
      drivingStore.write(ctx, null);
      setTouchControlsMode(ctx, null);
      ctx.camera.setChaseTuning(null);
      if (!result.ok) return;
      ctx.camera.follow(result.cameraTarget);
      setRiderSeated(ctx, result.cameraTarget, result.riderMovementPatch.frozen);
      ctx.scene.entity.setPose(ctx.player.userId, { position: result.placement.position, rotationY: result.placement.rotationY });
    },
    drivingVehicleId: () => driving,
    carSpeedKmh: () => lastTelemetry.speedMs * 3.6,
    telemetry: () => lastTelemetry,
    playerWorldPos,
    placeVehicle(ctx, vehicleId, position, heading) {
      dropCarSim(vehicleId);
      ctx.scene.entity.setPose(vehicleId, { position, rotationY: heading });
    },
    makeCarSim,
    refreshClamp,
    dropCarSim,
    cruiserVehicles,
    vehicleDamageSave: (ctx: GameContext) => vehicleDamageSave(ctx),
    restoreVehicleDamage(ctx, sections) {
      restoreVehicleDamage(
        ctx,
        sections,
        (vehicleId) => {
          const def = vehicleById(ctx.scene.entity.get(vehicleId)?.name ?? "");
          return def === undefined ? null : baseTuning(ctx, vehicleId, def);
        },
        (vehicleId, next) => {
          carTunings.set(vehicleId, next);
          carVehicles.get(vehicleId)?.retune(next);
        },
      );
    },
    retuneOwnedCars(ctx) {
      for (const entity of ctx.scene.entity.list()) {
        if ((entity.meta as { owned?: boolean } | undefined)?.owned !== true) continue;
        const def = vehicleById(entity.name);
        const base = def === undefined ? null : baseTuning(ctx, entity.id, def);
        if (base === null) continue;
        const next = rebaseVehicleDamage(ctx, entity.id, base);
        carTunings.set(entity.id, next);
        carVehicles.get(entity.id)?.retune(next);
      }
    },
    explodeVehicle(ctx, vehicleId, at) {
      cameraShake(0.7);
      forgetVehicleDamage(ctx, vehicleId);
      carTunings.delete(vehicleId);
      landBlast(ctx, { from: vehicleId, at, radius: 6, type: "blast", base: 55 });
      let wasDriven = false;
      if (driving === vehicleId) {
        vehicleSeats.mounts.dismount(ctx.player.userId);
        driving = null;
        drivingAudio.stop(ctx);
        lastTelemetry = { mode: "ground", speedMs: 0, altitude: 0, verticalSpeed: 0, gear: 1, rpm: 0, stalled: false, vtol: false };
        ctx.camera.follow(ctx.player.userId);
        ctx.camera.setChaseTuning(null);
        const rider = ctx.scene.entity.get(ctx.player.userId);
        setRiderSeated(ctx, ctx.player.userId, false);
        ctx.scene.entity.setPose(ctx.player.userId, { position: at, rotationY: rider?.rotationY ?? 0 });
        drivingStore.write(ctx, null);
        setTouchControlsMode(ctx, null);
        wasDriven = true;
      }
      dropCarSim(vehicleId);
      aircraft.delete(vehicleId);
      flightThrottles.delete(vehicleId);
      vtolModes.delete(vehicleId);
      return wasDriven;
    },
    tickDriving(ctx, dt) {
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
            lastTelemetry = {
              mode: "ground",
              speedMs: Math.abs(result.step.forwardSpeed),
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
    },
  };
}
