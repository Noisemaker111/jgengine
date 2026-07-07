import { PhysicsWorld, type CollisionEvent, type PhysicsBounds } from "@jgengine/core/physics/physicsWorld";
import { createVehicleBody, type VehicleBody } from "@jgengine/core/physics/vehicleBody";
import { AxisChannel, DRIVE_AXIS_BINDINGS, NEUTRAL_AXIS, type AxisInput } from "@jgengine/core/input/axisInput";
import { createDamageModel, type DamageModel } from "@jgengine/core/physics/damageZones";
import { createRaceState, raceTrack, type Checkpoint, type RaceEvent, type RaceState } from "@jgengine/core/game/race";

const RX = 30;
const RZ = 20;
const CHECKPOINT_COUNT = 8;
const LAPS = 3;
const RIVAL_LAP_SECONDS = 26;

export interface CircuitStats {
  speedKmh: number;
  gear: string;
  lap: number;
  totalLaps: number;
  position: number;
  racers: number;
  nextCheckpoint: number;
  totalCheckpoints: number;
  damageStage: number;
  damagePct: number;
  disabled: boolean;
  finished: boolean;
  lastSplit: number;
  feed: readonly string[];
}

export const circuitStats: CircuitStats = {
  speedKmh: 0,
  gear: "N",
  lap: 1,
  totalLaps: LAPS,
  position: 1,
  racers: 2,
  nextCheckpoint: 0,
  totalCheckpoints: CHECKPOINT_COUNT,
  damageStage: 0,
  damagePct: 0,
  disabled: false,
  finished: false,
  lastSplit: 0,
  feed: [],
};

export interface Obstacle {
  x: number;
  z: number;
  half: readonly [number, number, number];
}

export interface Circuit {
  world: PhysicsWorld;
  bounds: PhysicsBounds;
  car: VehicleBody;
  race: RaceState;
  damage: DamageModel;
  checkpoints: readonly Checkpoint[];
  obstacles: readonly Obstacle[];
  rival: { x: number; z: number; heading: number };
  elapsed: number;
}

let circuit: Circuit | null = null;
const heldKeys = new Set<string>();
const axis = new AxisChannel({ bindings: DRIVE_AXIS_BINDINGS, smoothing: 5 });
const feed: string[] = [];

function ringPoint(index: number): readonly [number, number] {
  const angle = (index / CHECKPOINT_COUNT) * Math.PI * 2;
  return [RX * Math.sin(angle), RZ * Math.cos(angle)];
}

function buildCheckpoints(): Checkpoint[] {
  const cps: Checkpoint[] = [];
  for (let i = 0; i < CHECKPOINT_COUNT; i += 1) {
    const [x, z] = ringPoint(i);
    cps.push({ id: i === 0 ? "start" : `cp${i}`, center: [x, 0.5, z], half: [5, 6, 5] });
  }
  return cps;
}

function normalizeAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

export function initCircuit(): Circuit {
  const bounds: PhysicsBounds = { min: [-48, -20, -40], max: [48, 20, 40] };
  const world = new PhysicsWorld({
    capacity: 32,
    bounds,
    gravity: -20,
    linearDamping: 0,
    cellSize: 8,
    sleepThresholdSteps: 1e9,
  });

  const checkpoints = buildCheckpoints();
  const [sx, sz] = ringPoint(0);
  const startHeading = Math.atan2(RX, 0);
  const car = createVehicleBody(world, {
    position: [sx, 1.4, sz],
    heading: startHeading,
    chassisHalfExtents: [0.9, 0.35, 1.8],
    groundHeight: () => 0,
  });

  const obstacles: Obstacle[] = [
    { x: RX + 7, z: 0, half: [1, 1, 3] },
    { x: -RX - 7, z: 0, half: [1, 1, 3] },
    { x: 0, z: RZ + 6, half: [3, 1, 1] },
  ];
  for (const o of obstacles) {
    world.addBody({ position: [o.x, o.half[1], o.z], halfExtents: o.half, static: true });
  }

  const damage = createDamageModel({
    zones: [
      { id: "front", thresholds: [6, 14, 26], detachStage: 3 },
      { id: "rear", thresholds: [6, 14, 26] },
      { id: "left", thresholds: [8, 18] },
      { id: "right", thresholds: [8, 18] },
    ],
    disableAt: 60,
    onStage: (t) => {
      if (t.detached) pushFeed(`${t.zone} panel torn off`);
      else if (t.disabled) pushFeed("engine disabled");
      else pushFeed(`${t.zone} damage stage ${t.stage}`);
    },
  });

  const race = createRaceState({ track: raceTrack({ checkpoints, laps: LAPS }) });
  race.addRacer("kart");
  race.addRacer("rival");

  world.onCollision((event: CollisionEvent) => {
    if (event.a !== car.chassis && event.b !== car.chassis) return;
    damage.routeCollision(event, () => resolveZone(car, event));
  }, 3);

  circuit = {
    world,
    bounds,
    car,
    race,
    damage,
    checkpoints,
    obstacles,
    rival: { x: sx, z: sz, heading: startHeading },
    elapsed: 0,
  };
  return circuit;
}

function resolveZone(car: VehicleBody, event: CollisionEvent): string {
  const [fx, fz] = car.forward;
  const forwardDot = event.nx * fx + event.nz * fz;
  if (forwardDot > 0.5) return "front";
  if (forwardDot < -0.5) return "rear";
  const rightDot = event.nx * fz - event.nz * fx;
  return rightDot > 0 ? "right" : "left";
}

export function currentCircuit(): Circuit | null {
  return circuit;
}

function pushFeed(line: string): void {
  feed.unshift(line);
  if (feed.length > 5) feed.pop();
}

function autoInput(c: Circuit): AxisInput {
  const progress = c.race.progressOf("kart");
  const nextIdx = progress?.nextCheckpoint ?? 0;
  const target = c.checkpoints[nextIdx]!;
  const [cx, , cz] = c.car.position;
  const desired = Math.atan2(target.center[0] - cx, target.center[2] - cz);
  const diff = normalizeAngle(desired - c.car.heading);
  const steer = Math.max(-1, Math.min(1, diff * 1.8));
  const throttle = 0.6 - Math.min(0.35, Math.abs(steer) * 0.3);
  return { throttle, brake: 0, steer, handbrake: 0 };
}

function driveInput(c: Circuit, dt: number): AxisInput {
  if (heldKeys.size > 0) return axis.sample(dt, (code) => heldKeys.has(code));
  axis.reset();
  return autoInput(c);
}

function advanceRival(c: Circuit): readonly [number, number, number] {
  c.rival.heading = 0;
  const speed = (Math.PI * 2) / RIVAL_LAP_SECONDS;
  const angle = c.elapsed * speed + 0.6;
  c.rival.x = RX * Math.sin(angle);
  c.rival.z = RZ * Math.cos(angle);
  return [c.rival.x, 0.5, c.rival.z];
}

export function stepCircuit(dt: number): void {
  const c = circuit;
  if (c === null) return;
  c.elapsed += dt;

  const input = c.damage.disabled ? NEUTRAL_AXIS : driveInput(c, dt);
  c.car.update(dt, input);
  c.world.step(dt);

  const [cx, cy, cz] = c.car.position;
  const rivalPos = advanceRival(c);
  const events = c.race.update(c.elapsed, { kart: [cx, cy, cz], rival: rivalPos });
  applyEvents(events);

  const progress = c.race.progressOf("kart");
  const speed = c.car.speed;
  circuitStats.speedKmh = Math.abs(speed) * 3.6;
  circuitStats.gear = speed > 0.4 ? "D" : speed < -0.4 ? "R" : "N";
  circuitStats.lap = progress?.lap ?? 1;
  circuitStats.position = progress?.position ?? 1;
  circuitStats.nextCheckpoint = progress?.nextCheckpoint ?? 0;
  circuitStats.damageStage = Math.max(...c.damage.states().map((s) => s.stage), 0);
  circuitStats.damagePct = Math.min(100, (c.damage.total / 60) * 100);
  circuitStats.disabled = c.damage.disabled;
  circuitStats.finished = c.race.finished;
  circuitStats.feed = [...feed];
}

function applyEvents(events: readonly RaceEvent[]): void {
  const c = circuit;
  if (c === null) return;
  for (const event of events) {
    if (event.type === "checkpoint.hit" && event.racerId === "kart") {
      circuitStats.lastSplit = event.time;
    } else if (event.type === "lap.completed" && event.racerId === "kart") {
      pushFeed(`lap ${event.lap} — ${event.time.toFixed(1)}s`);
    } else if (event.type === "race.finished") {
      pushFeed(`finish — P${c.race.progressOf("kart")?.position ?? 1}`);
    }
  }
}

export function resetCar(): void {
  const c = circuit;
  if (c === null) return;
  const respawn = c.race.resetToCheckpoint("kart");
  if (respawn === null) return;
  c.car.resetTo([respawn.position[0], 1.4, respawn.position[2]], respawn.heading);
  c.damage.reset();
  pushFeed("reset to checkpoint");
}

export function attachInput(): () => void {
  if (typeof window === "undefined") return () => {};
  const down = (e: KeyboardEvent) => {
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      heldKeys.add(e.code);
    }
  };
  const up = (e: KeyboardEvent) => heldKeys.delete(e.code);
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
  };
}
