import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AxisBinding } from "@jgengine/core/input/axisInput";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import {
  aircraftAttitudeQuaternion,
  createRigidAircraft,
  type AircraftAssistTuning,
  type RigidAircraft,
  type RigidAircraftInput,
  type RigidAircraftOptions,
  type RigidAircraftStep,
  type RigidAircraftTuning,
} from "@jgengine/core/physics/aircraftDynamics";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { useGameStore } from "@jgengine/react/hooks";
import { defineGame } from "@jgengine/shell/defineGame";
import type { PlayableGame } from "@jgengine/shell/registry";

import {
  flightDemoBooster,
  flightDemoHelicopter,
  flightDemoHelicopterAssists,
  flightDemoPlane,
  flightDemoPlaneAssists,
  flightDemoSpawn,
  flightDemoUpperStage,
} from "./flightTuning";

const PLANE = "plane";
const TILE = 200;

type StickAxis = "pitch" | "roll" | "yaw" | "throttle";

const bindings: Record<StickAxis, AxisBinding> = {
  pitch: { positive: ["pitchUp"], negative: ["pitchDown"] },
  roll: { positive: ["rollRight"], negative: ["rollLeft"] },
  yaw: { positive: ["yawRight"], negative: ["yawLeft"] },
  throttle: { positive: ["throttleUp"], negative: ["throttleDown"] },
};

type StickSample = Record<StickAxis, number>;

interface Craft {
  kind: "plane" | "helicopter" | "rocket";
  tuning: RigidAircraftTuning;
  spawn: RigidAircraftOptions & { position: readonly [number, number, number] };
  /** Starting lever position: throttle for the plane, collective for the helicopter. */
  lever: number;
  /** Turns the stick sample and lever into sim input. */
  input(stick: StickSample, lever: number): RigidAircraftInput;
  /** Lever travel per second of a held key. */
  leverRate: number;
  /** What T switches on; the craft starts without them. */
  assists?: AircraftAssistTuning;
  onSpawn?(aircraft: RigidAircraft): void;
  afterTick?(run: FlightRun, step: RigidAircraftStep): void;
}

const PLANE_CRAFT: Craft = {
  kind: "plane",
  tuning: flightDemoPlane,
  spawn: flightDemoSpawn,
  lever: 0.35,
  leverRate: 0.8,
  assists: flightDemoPlaneAssists,
  input: (stick, lever) => ({ throttle: lever, pitch: stick.pitch, roll: stick.roll, yaw: stick.yaw }),
};

// Keyboard pedals are all-or-nothing, so a held key asks for 60% pedal: about twice the hover trim, so it can stop a swing.
const HELICOPTER_CRAFT: Craft = {
  kind: "helicopter",
  tuning: flightDemoHelicopter,
  spawn: { position: [0, 1, 0] },
  lever: 0,
  leverRate: 0.4,
  assists: flightDemoHelicopterAssists,
  input: (stick, lever) => ({ throttle: 1, collective: lever, pitch: stick.pitch * 0.5, roll: stick.roll * 0.5, yaw: stick.yaw * 0.6 }),
  onSpawn: (aircraft) => aircraft.restore({ ...aircraft.snapshot(), rotorSpeed: 1 }),
};

// Upper stage centre of mass sits this far ahead of the stack's; staging moves the pose there so nothing jumps.
const UPPER_STAGE_OFFSET = 3.8;

const ROCKET_CRAFT: Craft = {
  kind: "rocket",
  tuning: flightDemoBooster,
  spawn: { position: [0, 4, 0], orientation: aircraftAttitudeQuaternion(0, Math.PI / 2 - 0.03, 0) },
  lever: 0,
  leverRate: 3,
  input: (stick, lever) => ({ throttle: lever, pitch: stick.pitch, roll: 0, yaw: stick.roll }),
  afterTick(state, step) {
    if (state.stage !== 1 || step.motor?.burnedOut !== true) return;
    const [qx, qy, qz, qw] = step.orientation;
    // Body forward in world space: the quaternion applied to [0, 0, 1].
    const forward = [2 * (qx * qz + qw * qy), 2 * (qy * qz - qw * qx), 1 - 2 * (qx * qx + qy * qy)];
    const snap = state.plane.snapshot();
    state.plane.restore({
      ...snap,
      x: snap.x + forward[0]! * UPPER_STAGE_OFFSET,
      y: snap.y + forward[1]! * UPPER_STAGE_OFFSET,
      z: snap.z + forward[2]! * UPPER_STAGE_OFFSET,
    });
    state.plane.retune(flightDemoUpperStage);
    state.stage = 2;
  },
};

interface FlightRun {
  plane: RigidAircraft;
  lever: number;
  last: RigidAircraftStep | null;
  stage: number;
  accel: number;
  assisted: boolean;
}

let craft: Craft = PLANE_CRAFT;
let run: FlightRun | null = null;

function ensureRun(): FlightRun {
  if (run === null) {
    const plane = createRigidAircraft(craft.tuning, craft.spawn);
    craft.onSpawn?.(plane);
    run = { plane, lever: craft.lever, last: null, stage: 1, accel: 0, assisted: false };
  }
  return run;
}

function resetRun(): void {
  run = null;
}

function onNewPlayer(ctx: GameContext): void {
  const id = ctx.player.userId;
  ctx.scene.entity.spawn(PLANE, { id, position: [craft.spawn.position[0], craft.spawn.position[1], craft.spawn.position[2]], role: "player" });
  ctx.scene.entity.update(id, { movement: { frozen: true } });
}

function onTick(ctx: GameContext, dt: number): void {
  const id = ctx.player.userId;
  if (ctx.scene.entity.get(id) === null) return;
  const state = ensureRun();
  const axis = ctx.input.axis(bindings);
  if (craft.assists !== undefined && ctx.input.justPressed("assist")) {
    state.assisted = !state.assisted;
    state.plane.retune({ ...state.plane.tuning(), assists: state.assisted ? craft.assists : undefined });
  }
  state.lever = Math.max(0, Math.min(1, state.lever + axis.throttle * craft.leverRate * dt));
  const step = state.plane.tick(dt, craft.input(axis, state.lever));
  if (state.last !== null && dt > 0) {
    const [vx, vy, vz] = step.velocity;
    const [px, py, pz] = state.last.velocity;
    state.accel = Math.hypot(vx - px, vy - py, vz - pz) / dt;
  }
  state.last = step;
  craft.afterTick?.(state, step);
  ctx.scene.entity.setPose(id, { position: [...step.position], rotationY: step.heading, dt });
}

const headingInverse = new THREE.Quaternion();
const attitude = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);

function PlaneBody({ entity }: { entity: SceneEntity }) {
  const body = useRef<THREE.Group>(null);
  const prop = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    const step = run?.last;
    if (step === null || step === undefined || body.current === null) return;
    // The entity group already carries the heading; the body adds pitch and bank on top of it.
    headingInverse.setFromAxisAngle(up, -step.heading);
    attitude.set(...step.orientation);
    body.current.quaternion.copy(headingInverse.multiply(attitude));
    if (prop.current !== null) prop.current.rotation.z += delta * (10 + 60 * (run?.lever ?? 0));
  });
  return (
    <group key={entity.id}>
      <group ref={body}>
        <mesh castShadow>
          <boxGeometry args={[0.9, 0.9, 6]} />
          <meshStandardMaterial color="#e11d48" roughness={0.4} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0, 0.3]} castShadow>
          <boxGeometry args={[8, 0.14, 1.4]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.1, -2.8]} castShadow>
          <boxGeometry args={[3, 0.1, 0.8]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.65, -2.8]} castShadow>
          <boxGeometry args={[0.1, 1.1, 0.9]} />
          <meshStandardMaterial color="#1d4ed8" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.55, 0.9]}>
          <boxGeometry args={[0.7, 0.4, 1.2]} />
          <meshStandardMaterial color="#0f172a" roughness={0.1} metalness={0.6} />
        </mesh>
        <mesh ref={prop} position={[0, 0, 3.05]}>
          <boxGeometry args={[2.1, 0.16, 0.05]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      </group>
    </group>
  );
}

function HelicopterBody({ entity }: { entity: SceneEntity }) {
  const body = useRef<THREE.Group>(null);
  const rotor = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    const step = run?.last;
    if (step === null || step === undefined || body.current === null) return;
    headingInverse.setFromAxisAngle(up, -step.heading);
    attitude.set(...step.orientation);
    body.current.quaternion.copy(headingInverse.multiply(attitude));
    const spin = (step.rotor?.speed ?? 0) * 40 * delta;
    if (rotor.current !== null) rotor.current.rotation.y += spin;
    if (tail.current !== null) tail.current.rotation.x += spin * 4;
  });
  return (
    <group key={entity.id}>
      <group ref={body}>
        <mesh position={[0, 0.2, 0.4]} castShadow>
          <boxGeometry args={[1.5, 1.6, 3]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.4} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0.45, 1.6]}>
          <boxGeometry args={[1.3, 0.9, 0.8]} />
          <meshStandardMaterial color="#0f172a" roughness={0.1} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.5, -3.6]} castShadow>
          <boxGeometry args={[0.3, 0.3, 5.2]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.9, -6.4]} castShadow>
          <boxGeometry args={[0.1, 1, 0.8]} />
          <meshStandardMaterial color="#1d4ed8" roughness={0.5} />
        </mesh>
        <mesh ref={tail} position={[0.25, 0.6, -7.3]}>
          <boxGeometry args={[0.05, 1.4, 0.12]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
        <mesh position={[0, -0.85, 0.3]}>
          <boxGeometry args={[1.8, 0.08, 2.6]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
        <group ref={rotor} position={[0, 1.2, 0.3]}>
          <mesh>
            <boxGeometry args={[10.2, 0.06, 0.3]} />
            <meshStandardMaterial color="#111827" />
          </mesh>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <boxGeometry args={[10.2, 0.06, 0.3]} />
            <meshStandardMaterial color="#111827" />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function RocketBody({ entity }: { entity: SceneEntity }) {
  const body = useRef<THREE.Group>(null);
  const booster = useRef<THREE.Group>(null);
  const upper = useRef<THREE.Group>(null);
  const flame = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const step = run?.last;
    if (step === null || step === undefined || body.current === null) return;
    headingInverse.setFromAxisAngle(up, -step.heading);
    attitude.set(...step.orientation);
    body.current.quaternion.copy(headingInverse.multiply(attitude));
    const staged = (run?.stage ?? 1) === 2;
    if (booster.current !== null) booster.current.visible = !staged;
    if (upper.current !== null) upper.current.position.z = staged ? 0 : UPPER_STAGE_OFFSET;
    if (flame.current !== null) {
      const thrust = step.motor?.thrust ?? 0;
      flame.current.visible = thrust > 0;
      flame.current.position.z = staged ? -2.4 : -5.2;
      flame.current.scale.setScalar(staged ? 0.5 : 1);
    }
  });
  // The cylinder axis is y; rotating by π/2 about x lays it along body forward (+z).
  const along: [number, number, number] = [Math.PI / 2, 0, 0];
  return (
    <group key={entity.id}>
      <group ref={body}>
        <group ref={booster}>
          <mesh rotation={along} castShadow>
            <cylinderGeometry args={[0.45, 0.45, 8, 20]} />
            <meshStandardMaterial color="#e5e7eb" roughness={0.4} metalness={0.3} />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[Math.cos((i * Math.PI) / 2) * 0.8, Math.sin((i * Math.PI) / 2) * 0.8, -3.5]} rotation={[0, 0, (i * Math.PI) / 2]} castShadow>
              <boxGeometry args={[0.8, 0.06, 1.2]} />
              <meshStandardMaterial color="#dc2626" />
            </mesh>
          ))}
        </group>
        <group ref={upper} position={[0, 0, UPPER_STAGE_OFFSET]}>
          <mesh rotation={along} castShadow>
            <cylinderGeometry args={[0.3, 0.3, 3, 16]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, 2]} rotation={along}>
            <coneGeometry args={[0.3, 1, 16]} />
            <meshStandardMaterial color="#1d4ed8" />
          </mesh>
        </group>
        <mesh ref={flame} position={[0, 0, -5.2]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.4, 2.4, 12]} />
          <meshStandardMaterial color="#fb923c" emissive="#f97316" emissiveIntensity={2} transparent opacity={0.85} />
        </mesh>
      </group>
    </group>
  );
}

// Ground tiles and pylons follow the plane in whole tiles, so the world looks endless at any speed.
function Landscape(_props: WorldOverlayProps) {
  const group = useRef<THREE.Group>(null);
  const tiles = useMemo(() => {
    const list: { x: number; z: number; color: string; pylon: boolean }[] = [];
    for (let i = -8; i <= 8; i += 1) {
      for (let j = -8; j <= 8; j += 1) {
        const hash = Math.abs((i * 73856093) ^ (j * 19349663)) % 7;
        list.push({ x: i * TILE, z: j * TILE, color: (i + j) % 2 === 0 ? "#4d7c3a" : "#5b8c42", pylon: hash === 0 && (Math.abs(i) > 1 || Math.abs(j) > 1) });
      }
    }
    return list;
  }, []);
  useFrame(() => {
    const step = run?.last;
    if (step === null || step === undefined || group.current === null) return;
    group.current.position.set(Math.round(step.position[0] / (TILE * 2)) * TILE * 2, 0, Math.round(step.position[2] / (TILE * 2)) * TILE * 2);
  });
  return (
    <group ref={group}>
      {tiles.map((tile) => (
        <group key={`${tile.x}:${tile.z}`} position={[tile.x, 0, tile.z]}>
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[TILE, TILE]} />
            <meshStandardMaterial color={tile.color} roughness={1} />
          </mesh>
          {tile.pylon ? (
            <mesh position={[0, 30, 0]}>
              <boxGeometry args={[8, 60, 8]} />
              <meshStandardMaterial color="#e5e7eb" roughness={0.8} />
            </mesh>
          ) : null}
        </group>
      ))}
    </group>
  );
}

function Telemetry() {
  useGameStore((ctx) => ctx.version());
  const step = run?.last ?? null;
  if (step === null) return null;
  const deg = (rad: number) => ((rad * 180) / Math.PI).toFixed(0);
  return (
    <div className="pointer-events-none absolute right-3 top-3 rounded bg-slate-950/70 px-3 py-2 font-mono text-xs text-slate-100">
      <div className="text-2xl font-bold tabular-nums">{(step.airspeed * 1.944).toFixed(0)} <span className="text-sm font-normal text-slate-300">kt</span></div>
      <div className="tabular-nums">alt {step.position[1].toFixed(0)} m · {craft.kind === "helicopter" ? "coll" : "thr"} {Math.round((run?.lever ?? 0) * 100)}%</div>
      {step.motor === undefined ? null : (
        <div className="tabular-nums">stage {run?.stage ?? 1} · {(step.motor.thrust / 1000).toFixed(1)} kN · {step.massKg.toFixed(0)} kg · {((run?.accel ?? 0) / 9.81).toFixed(1)} g accel</div>
      )}
      {step.rotor === undefined ? null : (
        <div className="tabular-nums">hdg {deg(step.heading)}° · yaw {deg(step.yawRate)}°/s · torque {(step.rotor.torque / 1000).toFixed(1)} kN·m</div>
      )}
      <div className="tabular-nums">pitch {deg(step.pitch)}° · bank {deg(step.bank)}°</div>
      {craft.assists === undefined ? null : <div className="tabular-nums">assists {run?.assisted === true ? "ON" : "off"}{step.limited ? " · LIMIT" : ""}</div>}
      <div className="tabular-nums">AoA {deg(step.angleOfAttack)}° · {step.gLoad.toFixed(1)} g{step.stalled && step.rotor === undefined ? " · STALL" : ""}</div>
      <div className="mt-1 text-[10px] text-slate-400">{craft.kind === "helicopter" ? "W/S A/D cyclic · Q/E pedals · R/F collective · T assists" : craft.kind === "rocket" ? "W/S A/D gimbal · R ignite" : "W/S pitch · A/D roll · Q/E yaw · R/F throttle · T assists"}</div>
    </div>
  );
}

function makeGame(name: string, choice: Craft): PlayableGame {
  const onInit = () => {
    craft = choice;
    resetRun();
  };
  return defineGame({
    name,
    assets: createAssetCatalog(),
    multiplayer: "off",
    world: { kind: "flat" },
    backdrop: { sky: { preset: "day", radius: 2800 }, fog: { color: "#c7d7e6", near: 600, far: 2400 } },
    input: {
      pitchUp: ["KeyS", "ArrowDown"],
      pitchDown: ["KeyW", "ArrowUp"],
      rollLeft: ["KeyA", "ArrowLeft"],
      rollRight: ["KeyD", "ArrowRight"],
      yawLeft: ["KeyQ"],
      yawRight: ["KeyE"],
      throttleUp: ["KeyR"],
      throttleDown: ["KeyF"],
      assist: ["KeyT"],
    },
    loop: { onInit, onNewPlayer, onTick, onReset: onInit, onDispose: resetRun },
    camera: {
      rig: "chase",
      frustum: { far: 3000 },
      chase: {
        distance: choice.kind === "helicopter" ? 18 : choice.kind === "rocket" ? 34 : 16,
        height: choice.kind === "helicopter" ? 6 : choice.kind === "rocket" ? 3 : 4,
        lookHeight: 1,
        springDamping: 8,
        fov: { base: 60, max: 72, speedForMax: 110 },
        yawResponse: 4,
      },
    },
    renderEntity: (entity) =>
      entity.name !== PLANE ? null : choice.kind === "helicopter" ? <HelicopterBody entity={entity} /> : choice.kind === "rocket" ? <RocketBody entity={entity} /> : <PlaneBody entity={entity} />,
    WorldOverlay: Landscape,
    GameUI: Telemetry,
    capture: {
      probe: (): Record<string, number> => {
        const step = run?.last;
        if (step === null || step === undefined) return {};
        return {
          x: step.position[0],
          y: step.position[1],
          z: step.position[2],
          airspeed: step.airspeed,
          pitchDeg: (step.pitch * 180) / Math.PI,
          bankDeg: (step.bank * 180) / Math.PI,
          headingDeg: (step.heading * 180) / Math.PI,
          aoaDeg: (step.angleOfAttack * 180) / Math.PI,
          gLoad: step.gLoad,
          stalled: step.stalled ? 1 : 0,
          lever: run?.lever ?? 0,
          yawRateDeg: (step.yawRate * 180) / Math.PI,
          rotorTorque: step.rotor?.torque ?? 0,
        stage: run?.stage ?? 1,
        massKg: step.massKg,
        accelG: (run?.accel ?? 0) / 9.81,
        motorThrust: step.motor?.thrust ?? 0,
        assisted: run?.assisted === true ? 1 : 0,
        speedOverGround: Math.hypot(step.velocity[0], step.velocity[2]),
        };
      },
    },
  });
}

export const flightDemoGame: PlayableGame = makeGame("flight", PLANE_CRAFT);
export const flightHelicopterDemoGame: PlayableGame = makeGame("flight-heli", HELICOPTER_CRAFT);
export const flightRocketDemoGame: PlayableGame = makeGame("flight-rocket", ROCKET_CRAFT);
