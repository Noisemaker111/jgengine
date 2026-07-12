import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { steerYaw } from "@jgengine/core/movement/steering";
import { DEFAULT_GRIP_CURVE, sampleGripCurve, type GripCurve } from "@jgengine/core/physics/vehicleBody";
import { advancePathFollow, createPathFollow, type PathFollowConfig, type PathFollowState } from "@jgengine/core/nav/pathFollow";
import { seededRng } from "@jgengine/core/random/rng";
import { TRAFFIC_LOOPS } from "./world/districts";

export interface CarTuning {
  engineAccel: number;
  brakeAccel: number;
  topSpeed: number;
  reverseSpeed: number;
  turnRate: number;
  turnSpeedRef: number;
  grip: GripCurve;
  gripStrength: number;
  handbrakeGrip: number;
}

export interface CarAxis {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: number;
}

export interface CarPose {
  position: readonly [number, number, number];
  heading: number;
  speedKmh: number;
}

export interface CarState {
  x: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
}

export function stepCar(
  state: CarState,
  tuning: CarTuning,
  axis: CarAxis,
  dt: number,
  groundY: (x: number, z: number) => number,
): CarPose {
  const fx0 = Math.sin(state.heading);
  const fz0 = Math.cos(state.heading);
  const speed0 = state.vx * fx0 + state.vz * fz0;
  const steerScale = Math.min(1, Math.abs(speed0) / tuning.turnSpeedRef);
  const dir = speed0 >= 0 ? 1 : -1;
  state.heading = steerYaw(state.heading, axis.steer * steerScale * dir, tuning.turnRate, dt);

  const fx = Math.sin(state.heading);
  const fz = Math.cos(state.heading);
  let accel = 0;
  if (axis.throttle > 0 && speed0 < tuning.topSpeed) accel += axis.throttle * tuning.engineAccel;
  if (axis.brake > 0) {
    if (speed0 > 0.2) accel -= axis.brake * tuning.brakeAccel;
    else if (speed0 > -tuning.reverseSpeed) accel -= axis.brake * tuning.engineAccel;
  }
  state.vx += fx * accel * dt;
  state.vz += fz * accel * dt;

  const forwardSpeed = state.vx * fx + state.vz * fz;
  const lateralSpeed = -state.vx * fz + state.vz * fx;
  const slip = Math.abs(lateralSpeed) / (Math.abs(forwardSpeed) + 1);
  const handbrakeFactor = 1 - axis.handbrake * (1 - tuning.handbrakeGrip);
  const grip = sampleGripCurve(tuning.grip, slip) * handbrakeFactor;
  const keep = Math.max(0, 1 - grip * tuning.gripStrength * dt);
  const newLateral = lateralSpeed * keep;
  state.vx = fx * forwardSpeed - fz * newLateral;
  state.vz = fz * forwardSpeed + fx * newLateral;

  const drag = Math.max(0, 1 - 0.35 * dt);
  state.vx *= drag;
  state.vz *= drag;
  state.x += state.vx * dt;
  state.z += state.vz * dt;

  const half = 300;
  state.x = Math.max(-half, Math.min(half, state.x));
  state.z = Math.max(-half, Math.min(half, state.z));

  return {
    position: [state.x, groundY(state.x, state.z), state.z],
    heading: state.heading,
    speedKmh: Math.abs(forwardSpeed) * 3.6,
  };
}

export const CAR_TUNINGS: Record<string, CarTuning> = {
  car_compact: { engineAccel: 14, brakeAccel: 22, topSpeed: 20, reverseSpeed: 7, turnRate: 2.4, turnSpeedRef: 6, grip: DEFAULT_GRIP_CURVE, gripStrength: 8, handbrakeGrip: 0.3 },
  car_muscle: { engineAccel: 20, brakeAccel: 26, topSpeed: 28, reverseSpeed: 8, turnRate: 2.1, turnSpeedRef: 7, grip: DEFAULT_GRIP_CURVE, gripStrength: 6.5, handbrakeGrip: 0.22 },
  car_sport: { engineAccel: 26, brakeAccel: 30, topSpeed: 36, reverseSpeed: 9, turnRate: 2.5, turnSpeedRef: 8, grip: DEFAULT_GRIP_CURVE, gripStrength: 7.5, handbrakeGrip: 0.2 },
  car_cop: { engineAccel: 22, brakeAccel: 28, topSpeed: 30, reverseSpeed: 8, turnRate: 2.3, turnSpeedRef: 7, grip: DEFAULT_GRIP_CURVE, gripStrength: 7, handbrakeGrip: 0.22 },
};

export interface WantedSnapshot {
  heat: number;
  stars: number;
  peakStars: number;
}

export const WANTED_STORE_KEY = "vice.wanted";
export const DRIVING_STORE_KEY = "vice.driving";
export const HEAT_PER_STAR = 100;
export const MAX_STARS = 5;

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
  registerTrafficCar(entityId: string, loopIndex: number, startT: number): void;
}

export function createHandroll(): Handroll {
  const carStates = new Map<string, CarState>();
  let driving: string | null = null;
  let lastSpeedKmh = 0;
  let heat = 0;
  let peakStars = 0;
  let copTimer = 0;
  let copCounter = 0;
  const traffic: TrafficCar[] = [];
  const rng = seededRng("vice-isle-cops");

  function stars(): number {
    return Math.min(MAX_STARS, Math.floor(heat / HEAT_PER_STAR));
  }

  function publishWanted(ctx: GameContext): void {
    ctx.game.store.set(WANTED_STORE_KEY, { heat, stars: stars(), peakStars } satisfies WantedSnapshot);
  }

  function carStateFor(ctx: GameContext, vehicleId: string): CarState {
    const existing = carStates.get(vehicleId);
    if (existing !== undefined) return existing;
    const entity = ctx.scene.entity.get(vehicleId);
    const created: CarState = {
      x: entity?.position[0] ?? 0,
      z: entity?.position[2] ?? 0,
      heading: entity?.rotationY ?? 0,
      vx: 0,
      vz: 0,
    };
    carStates.set(vehicleId, created);
    return created;
  }

  function sampleAxis(ctx: GameContext): CarAxis {
    return {
      throttle: ctx.input.isDown("moveForward") ? 1 : 0,
      brake: ctx.input.isDown("moveBack") ? 1 : 0,
      steer: (ctx.input.isDown("moveRight") ? 1 : 0) - (ctx.input.isDown("moveLeft") ? 1 : 0),
      handbrake: ctx.input.isDown("jump") ? 1 : 0,
    };
  }

  function tickCops(ctx: GameContext, dt: number): void {
    const level = stars();
    const player = ctx.scene.entity.get(ctx.player.userId);
    if (player === null) return;
    const playerPos = driving !== null ? (ctx.scene.entity.get(driving)?.position ?? player.position) : player.position;

    const cops = ctx.scene.entity
      .list()
      .filter((e) => e.name === "cop_patrol" || e.name === "cop_swat");

    if (level > 0) {
      copTimer -= dt;
      const wantedCops = level * 2;
      if (copTimer <= 0 && cops.length < wantedCops) {
        copTimer = Math.max(2, 8 - level * 1.2);
        copCounter += 1;
        const angle = rng() * Math.PI * 2;
        const distance = 46 + rng() * 20;
        const x = playerPos[0] + Math.sin(angle) * distance;
        const z = playerPos[2] + Math.cos(angle) * distance;
        ctx.scene.entity.spawn(level >= 4 ? "cop_swat" : "cop_patrol", {
          id: `cop_${copCounter}`,
          position: [x, ctx.world.groundHeightAt(x, z), z],
          role: "npc",
        });
      }
    }

    let anyCopClose = false;
    for (const cop of cops) {
      const dist = Math.hypot(cop.position[0] - playerPos[0], cop.position[2] - playerPos[2]);
      if (dist < 60) anyCopClose = true;
      if (level === 0) {
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
        const now = ctx.time.now();
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

    if (level > 0) {
      const decay = anyCopClose ? 1.6 : 7;
      heat = Math.max(0, heat - decay * dt);
      publishWanted(ctx);
    }
  }

  function tickTraffic(ctx: GameContext, dt: number): void {
    for (const car of traffic) {
      if (car.entityId === driving) continue;
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
      driving = vehicleId;
      carStateFor(ctx, vehicleId);
      ctx.camera.follow(vehicleId);
      ctx.game.store.set(DRIVING_STORE_KEY, vehicleId);
    },
    exitVehicle(ctx) {
      if (driving === null) return;
      const vehicle = ctx.scene.entity.get(driving);
      driving = null;
      lastSpeedKmh = 0;
      ctx.camera.follow(null);
      ctx.game.store.set(DRIVING_STORE_KEY, null);
      if (vehicle !== null) {
        const side = vehicle.rotationY + Math.PI / 2;
        const x = vehicle.position[0] + Math.sin(side) * 2.2;
        const z = vehicle.position[2] + Math.cos(side) * 2.2;
        ctx.scene.entity.setPose(ctx.player.userId, {
          position: [x, ctx.world.groundHeightAt(x, z), z],
          rotationY: vehicle.rotationY,
        });
      }
    },
    drivingVehicleId: () => driving,
    carSpeedKmh: () => lastSpeedKmh,
    addHeat(ctx, amount) {
      heat = Math.min(MAX_STARS * HEAT_PER_STAR, heat + amount);
      peakStars = Math.max(peakStars, stars());
      publishWanted(ctx);
    },
    clearWanted(ctx) {
      heat = 0;
      peakStars = 0;
      publishWanted(ctx);
    },
    wanted: () => ({ heat, stars: stars(), peakStars }),
    registerTrafficCar(entityId, loopIndex, startT) {
      const loop = TRAFFIC_LOOPS[loopIndex % TRAFFIC_LOOPS.length];
      if (loop === undefined) return;
      const waypoints = loop.map(([x, z]) => [x, 0, z] as const);
      const config: PathFollowConfig = { waypoints, speed: 7, loop: true };
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
          const tuning = CAR_TUNINGS[vehicle.name] ?? CAR_TUNINGS.car_compact!;
          const state = carStateFor(ctx, driving);
          const pose = stepCar(state, tuning, sampleAxis(ctx), dt, (x, z) => ctx.world.groundHeightAt(x, z));
          lastSpeedKmh = pose.speedKmh;
          ctx.scene.entity.setPose(driving, { position: pose.position, rotationY: pose.heading, dt });
          ctx.scene.entity.setPose(ctx.player.userId, {
            position: [pose.position[0], pose.position[1] + 0.4, pose.position[2]],
            rotationY: pose.heading,
          });
        }
      }
      tickTraffic(ctx, dt);
      tickCops(ctx, dt);
    },
  };
}

export let handroll: Handroll = createHandroll();

export function resetHandroll(): Handroll {
  handroll = createHandroll();
  return handroll;
}
