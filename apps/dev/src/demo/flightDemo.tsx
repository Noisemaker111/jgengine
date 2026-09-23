import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AxisBinding } from "@jgengine/core/input/axisInput";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import { createRigidAircraft, type RigidAircraft, type RigidAircraftStep } from "@jgengine/core/physics/aircraftDynamics";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { useGameStore } from "@jgengine/react/hooks";
import { defineGame } from "@jgengine/shell/defineGame";
import type { PlayableGame } from "@jgengine/shell/registry";

import { flightDemoPlane, flightDemoSpawn } from "./flightTuning";

const PLANE = "plane";
const TILE = 200;

type StickAxis = "pitch" | "roll" | "yaw" | "throttle";

const bindings: Record<StickAxis, AxisBinding> = {
  pitch: { positive: ["pitchUp"], negative: ["pitchDown"] },
  roll: { positive: ["rollRight"], negative: ["rollLeft"] },
  yaw: { positive: ["yawRight"], negative: ["yawLeft"] },
  throttle: { positive: ["throttleUp"], negative: ["throttleDown"] },
};

interface FlightRun {
  plane: RigidAircraft;
  throttle: number;
  last: RigidAircraftStep | null;
}

let run: FlightRun | null = null;

function ensureRun(): FlightRun {
  run ??= { plane: createRigidAircraft(flightDemoPlane, flightDemoSpawn), throttle: 0.35, last: null };
  return run;
}

function resetRun(): void {
  run = null;
}

function onNewPlayer(ctx: GameContext): void {
  const id = ctx.player.userId;
  ctx.scene.entity.spawn(PLANE, { id, position: [...flightDemoSpawn.position], role: "player" });
  ctx.scene.entity.update(id, { movement: { frozen: true } });
}

function onTick(ctx: GameContext, dt: number): void {
  const id = ctx.player.userId;
  if (ctx.scene.entity.get(id) === null) return;
  const state = ensureRun();
  const axis = ctx.input.axis(bindings);
  state.throttle = Math.max(0, Math.min(1, state.throttle + axis.throttle * 0.8 * dt));
  const step = state.plane.tick(dt, { throttle: state.throttle, pitch: axis.pitch, roll: axis.roll, yaw: axis.yaw });
  state.last = step;
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
    if (prop.current !== null) prop.current.rotation.z += delta * (10 + 60 * (run?.throttle ?? 0));
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

// Ground tiles and pylons follow the plane in whole tiles, so the world looks endless at any speed.
function Landscape(_props: WorldOverlayProps) {
  const group = useRef<THREE.Group>(null);
  const tiles = useMemo(() => {
    const list: { x: number; z: number; color: string; pylon: boolean }[] = [];
    for (let i = -8; i <= 8; i += 1) {
      for (let j = -8; j <= 8; j += 1) {
        const hash = Math.abs((i * 73856093) ^ (j * 19349663)) % 7;
        list.push({ x: i * TILE, z: j * TILE, color: (i + j) % 2 === 0 ? "#4d7c3a" : "#5b8c42", pylon: hash === 0 });
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
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
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
      <div className="tabular-nums">alt {step.position[1].toFixed(0)} m · thr {Math.round((run?.throttle ?? 0) * 100)}%</div>
      <div className="tabular-nums">pitch {deg(step.pitch)}° · bank {deg(step.bank)}°</div>
      <div className="tabular-nums">AoA {deg(step.angleOfAttack)}° · {step.gLoad.toFixed(1)} g{step.stalled ? " · STALL" : ""}</div>
      <div className="mt-1 text-[10px] text-slate-400">W/S pitch · A/D roll · Q/E yaw · R/F throttle</div>
    </div>
  );
}

export const flightDemoGame: PlayableGame = defineGame({
  name: "flight",
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
  },
  loop: { onInit: resetRun, onNewPlayer, onTick, onReset: resetRun, onDispose: resetRun },
  camera: {
    rig: "chase",
    frustum: { far: 3000 },
    chase: {
      distance: 16,
      height: 4,
      lookHeight: 1,
      springDamping: 8,
      fov: { base: 60, max: 72, speedForMax: 110 },
      yawResponse: 4,
    },
  },
  renderEntity: (entity) => (entity.name === PLANE ? <PlaneBody entity={entity} /> : null),
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
        throttle: run?.throttle ?? 0,
      };
    },
  },
});
