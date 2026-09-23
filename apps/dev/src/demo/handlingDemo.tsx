import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import type { AxisBinding } from "@jgengine/core/input/axisInput";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import { tickDrivableVehicle } from "@jgengine/core/physics/drivableVehicle";
import { createVehicleDynamics, type VehicleDynamics, type VehicleDynamicsStep } from "@jgengine/core/physics/vehicleDynamics";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { useGameStore } from "@jgengine/react/hooks";
import { defineGame } from "@jgengine/shell/defineGame";
import type { PlayableGame } from "@jgengine/shell/registry";

import { handlingDemoGround, handlingDemoRamp, handlingDemoTuning as tuning } from "./handlingTuning";

const CAR = "car";


const bindings: Record<"throttle" | "brake" | "steer" | "handbrake", AxisBinding> = {
  throttle: { positive: ["throttle"] },
  brake: { positive: ["brake"] },
  steer: { positive: ["steerRight"], negative: ["steerLeft"] },
  handbrake: { positive: ["handbrake"] },
};
const pedal = { min: 0, max: 1 };

const CONES: readonly (readonly [number, number])[] = Array.from({ length: 14 }, (_, i) => [(i % 2 === 0 ? 3.5 : -3.5), 30 + i * 18]);

interface HandlingRun {
  car: VehicleDynamics;
  last: VehicleDynamicsStep | null;
  rumbleCooldown: number;
}

let run: HandlingRun | null = null;

function ensureRun(): HandlingRun {
  run ??= { car: createVehicleDynamics(tuning, { groundHeight: handlingDemoGround }), last: null, rumbleCooldown: 0 };
  return run;
}

function onInit(): void {
  run = null;
}

function onNewPlayer(ctx: GameContext): void {
  const id = ctx.player.userId;
  ctx.scene.entity.spawn(CAR, { id, position: [0, 0, 0], role: "player" });
  ctx.scene.entity.update(id, { movement: { frozen: true } });
}

function onTick(ctx: GameContext, dt: number): void {
  const id = ctx.player.userId;
  if (ctx.scene.entity.get(id) === null) return;
  const state = ensureRun();
  const axis = ctx.input.axis(bindings, { throttle: pedal, brake: pedal, handbrake: pedal });
  // Throttle keeps driving in the air here; only steer yaws the body, so a held W never noses the car down.
  const drive = tickDrivableVehicle(state.car, dt, axis, {
    groundHeight: handlingDemoGround,
    modifiers: { air: { pitch: 0, yaw: axis.steer, roll: 0 } },
  });
  state.last = drive.step;
  ctx.scene.entity.setPose(id, drive.pose);
  if (ctx.input.justPressed("jump")) state.car.jump();

  const step = drive.step;
  const at = drive.pose.position;
  ctx.game.audio.loop("engine", "engine", { at });
  ctx.game.audio.loop("tires", "tires", { at });
  ctx.game.audio.setLoop("engine", { rate: step.rpm / 3000, gain: 0.25 + 0.55 * step.engineLoad, at });
  const scrub = Math.max(0, Math.max(step.frontSaturation, step.rearSaturation) - 0.85);
  const moving = Math.min(1, Math.abs(step.forwardSpeed) / 4);
  ctx.game.audio.setLoop("tires", { rate: 0.85 + Math.min(0.5, Math.abs(step.sideslip)), gain: Math.min(1, scrub * 2.5) * moving, at });

  if (step.landingSpeed > 1.5) {
    ctx.game.audio.play("thud", at);
    void ctx.input.rumble(id, { strong: Math.min(1, step.landingSpeed / 8), weak: 0.3, ms: 180 });
  }

  state.rumbleCooldown -= dt;
  if (state.rumbleCooldown <= 0 && (scrub > 0.15 || step.wheelspin)) {
    state.rumbleCooldown = 0.1;
    void ctx.input.rumble(id, { strong: Math.min(1, step.rearSaturation - 0.85), weak: Math.min(1, step.frontSaturation - 0.85), ms: 110 });
  }
}

function CarBody({ entity }: { entity: SceneEntity }) {
  const frontLeft = useRef<THREE.Group>(null);
  const frontRight = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  useFrame(() => {
    const step = run?.last;
    if (step === null || step === undefined) return;
    const steer = -step.steerAngle;
    if (frontLeft.current !== null) frontLeft.current.rotation.y = steer;
    if (frontRight.current !== null) frontRight.current.rotation.y = steer;
    if (body.current !== null) {
      // +x is the car's left, and a positive roll means a right-hand turn, so the body leans outward by rolling -z.
      body.current.rotation.z = -step.bodyRoll;
      body.current.rotation.x = step.bodyPitch;
    }
  });
  const wheel = (
    <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[0.32, 0.32, 0.24, 18]} />
      <meshStandardMaterial color="#111827" roughness={0.9} />
    </mesh>
  );
  return (
    <group key={entity.id}>
      <group ref={body} position={[0, 0.62, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1.74, 0.5, 4.1]} />
          <meshStandardMaterial color="#dc2626" roughness={0.35} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.42, -0.25]} castShadow>
          <boxGeometry args={[1.46, 0.42, 1.9]} />
          <meshStandardMaterial color="#1f2937" roughness={0.2} metalness={0.5} />
        </mesh>
        <mesh position={[0, 0.05, 2.06]}>
          <boxGeometry args={[1.5, 0.12, 0.04]} />
          <meshStandardMaterial color="#fde68a" emissive="#fde68a" emissiveIntensity={0.6} />
        </mesh>
      </group>
      <group ref={frontLeft} position={[0.84, 0.32, 1.28]}>{wheel}</group>
      <group ref={frontRight} position={[-0.84, 0.32, 1.28]}>{wheel}</group>
      <group position={[0.84, 0.32, -1.27]}>{wheel}</group>
      <group position={[-0.84, 0.32, -1.27]}>{wheel}</group>
    </group>
  );
}

function Course(_props: WorldOverlayProps) {
  const stripes = useMemo(() => Array.from({ length: 40 }, (_, i) => i * 12 - 60), []);
  return (
    <>
      <mesh position={[0, -0.06, 150]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1400, 1400]} />
        <meshStandardMaterial color="#4d7c3a" roughness={1} />
      </mesh>
      <mesh position={[0, 0.03, 150]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 460]} />
        <meshStandardMaterial color="#374151" roughness={0.95} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      {stripes.map((z) => (
        <mesh key={z} position={[0, 0.05, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.25, 5]} />
          <meshStandardMaterial color="#f8fafc" polygonOffset polygonOffsetFactor={-4} />
        </mesh>
      ))}
      <mesh position={[0, 0.02, -40]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[34, 64]} />
        <meshStandardMaterial color="#4b5563" roughness={0.9} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      <mesh
        position={[handlingDemoRamp.center[0], handlingDemoRamp.center[1] - 0.05, handlingDemoRamp.center[2]]}
        rotation={[-handlingDemoRamp.pitch, 0, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[handlingDemoRamp.width, 0.1, handlingDemoRamp.length]} />
        <meshStandardMaterial color="#eab308" roughness={0.8} />
      </mesh>
      {CONES.map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, 0.35, z]} castShadow>
          <coneGeometry args={[0.28, 0.7, 14]} />
          <meshStandardMaterial color="#f97316" />
        </mesh>
      ))}
    </>
  );
}

function Telemetry() {
  useGameStore((ctx) => ctx.version());
  const step = run?.last ?? null;
  if (step === null) return null;
  const kmh = Math.abs(step.forwardSpeed) * 3.6;
  const gear = step.gear === -1 ? "R" : String(step.gear);
  const bar = (value: number) => (
    <div className="h-1.5 w-24 overflow-hidden rounded bg-white/15">
      <div className={value >= 1 ? "h-full bg-red-400" : "h-full bg-emerald-400"} style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
  return (
    <div className="pointer-events-none absolute right-3 top-3 rounded bg-slate-950/70 px-3 py-2 font-mono text-xs text-slate-100">
      <div className="text-2xl font-bold tabular-nums">{kmh.toFixed(0)} <span className="text-sm font-normal text-slate-300">km/h</span></div>
      <div className="tabular-nums">gear {gear} · {Math.round(step.rpm)} rpm</div>
      <div className="tabular-nums">lat {(step.lateralAccel / 9.81).toFixed(2)} g · slip {((step.sideslip * 180) / Math.PI).toFixed(0)}°</div>
      <div className="mt-1 flex items-center gap-2">front {bar(step.frontSaturation)}</div>
      <div className="flex items-center gap-2">rear&nbsp; {bar(step.rearSaturation)}</div>
      <div className="mt-1 text-[10px] text-slate-400">W/S throttle·brake · A/D steer · Space handbrake · J jump</div>
    </div>
  );
}

const game = defineGame({
  name: "handling",
  assets: createAssetCatalog(),
  multiplayer: "off",
  world: { kind: "flat" },
  backdrop: { sky: { preset: "day" }, fog: { color: "#c7d7e6", near: 80, far: 320 } },
  input: {
    throttle: ["KeyW", "ArrowUp"],
    brake: ["KeyS", "ArrowDown"],
    steerLeft: ["KeyA", "ArrowLeft"],
    steerRight: ["KeyD", "ArrowRight"],
    handbrake: ["Space"],
    jump: ["KeyJ"],
  },
  loop: { onInit, onNewPlayer, onTick, onReset: onInit, onDispose: onInit },
  camera: {
    rig: "chase",
    chase: {
      distance: 7,
      height: 2.7,
      lookHeight: 1.1,
      springDamping: 7,
      fov: { base: 58, max: 76, speedForMax: 50 },
      lead: { time: 0.12, max: 2.5 },
      bank: { perYawRate: 0.05, max: 0.06 },
      velocityYaw: { blend: 0.35, minSpeed: 5, response: 7 },
      yawResponse: 9,
    },
  },
  audio: {
    sounds: {
      engine: {
        id: "engine",
        bus: "sfx",
        loop: true,
        synth: {
          gain: 0.5,
          voices: [
            { kind: "tone", wave: "sawtooth", freq: 100, duration: 1, sustain: 1, gain: 0.5 },
            { kind: "tone", wave: "square", freq: 50, duration: 1, sustain: 1, gain: 0.25 },
            { kind: "tone", wave: "triangle", freq: 200, duration: 1, sustain: 1, gain: 0.2 },
          ],
        },
      },
      thud: {
        id: "thud",
        bus: "sfx",
        synth: {
          gain: 0.8,
          voices: [
            { kind: "noise", duration: 0.25, filterFreq: 220, filterType: "lowpass" },
            { kind: "tone", wave: "sine", freq: 70, slideTo: 40, duration: 0.3 },
          ],
        },
      },
      tires: {
        id: "tires",
        bus: "sfx",
        loop: true,
        synth: { gain: 0.6, voices: [{ kind: "noise", duration: 1, sustain: 1, filterFreq: 1800, filterType: "bandpass" }] },
      },
    },
  },
  renderEntity: (entity) => (entity.name === CAR ? <CarBody entity={entity} /> : null),
  WorldOverlay: Course,
  GameUI: Telemetry,
  capture: {
    probe: (): Record<string, number> => {
      const step = run?.last;
      if (step === null || step === undefined) return {};
      return {
        x: step.position[0],
        z: step.position[2],
        y: step.position[1],
        airborne: step.airborne ? 1 : 0,
        speed: step.forwardSpeed,
        heading: step.heading,
        yawRate: step.yawRate,
        lateralG: step.lateralAccel / 9.81,
        sideslipDeg: (step.sideslip * 180) / Math.PI,
        gear: step.gear,
        rpm: step.rpm,
        frontSaturation: step.frontSaturation,
        rearSaturation: step.rearSaturation,
      };
    },
  },
});

export const handlingDemoGame: PlayableGame = game;
