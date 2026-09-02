import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createRapierBackend } from "@jgengine/rapier";
import type { BodyHandle, PhysicsBackend } from "@jgengine/core/physics/physicsBackend";
import { defineGame } from "@jgengine/shell/defineGame";
import type { PlayableGame } from "@jgengine/shell/registry";

interface ProbeBody {
  handle: BodyHandle;
  halfExtents: readonly [number, number, number];
  color: string;
}

const slopeRotation: [number, number, number, number] = [0, 0, Math.sin(0.18), Math.cos(0.18)];

function PhysicsProbeOverlay(_props: WorldOverlayProps) {
  const [, setReady] = useState(false);
  const backend = useRef<PhysicsBackend | null>(null);
  const bodies = useRef<ProbeBody[]>([]);
  const meshes = useRef(new Map<number, THREE.Mesh>());

  useEffect(() => {
    let alive = true;
    let current: PhysicsBackend | null = null;
    void createRapierBackend({ gravity: [0, -9.81, 0] }).then((world: PhysicsBackend) => {
      if (!alive) {
        world.dispose();
        return;
      }
      current = world;
      backend.current = world;
      const add = (halfExtents: readonly [number, number, number], position: readonly [number, number, number], color: string, rotation?: readonly [number, number, number, number]) => {
        const handle = world.addBody({ shape: { kind: "box", halfExtents }, position, kind: "dynamic", ...(rotation === undefined ? {} : { rotation }) });
        bodies.current.push({ handle, halfExtents, color });
        return handle;
      };
      world.addBody({ shape: { kind: "box", halfExtents: [18, 0.4, 8] }, position: [0, -0.4, 0], kind: "static" });
      world.addBody({ shape: { kind: "box", halfExtents: [8, 0.35, 3] }, position: [-5, 2.7, 0], rotation: slopeRotation, kind: "static" });
      add([0.75, 0.75, 0.75], [-9, 8, 0], "#f59e0b", slopeRotation);
      add([0.45, 1.1, 0.45], [0, 7.4, 0], "#e879f9");
      add([0.6, 0.6, 0.6], [0, 9.0, 0], "#f0abfc");
      add([0.38, 0.85, 0.38], [-0.9, 8.0, 0], "#c026d3");
      add([0.38, 0.85, 0.38], [0.9, 8.0, 0], "#c026d3");
      world.addJoint({ kind: "ball", bodyA: bodies.current[1]!.handle, bodyB: bodies.current[2]!.handle, anchorA: [0, 0.95, 0], anchorB: [0, -0.65, 0] });
      world.addJoint({ kind: "ball", bodyA: bodies.current[1]!.handle, bodyB: bodies.current[3]!.handle, anchorA: [-0.45, -0.7, 0], anchorB: [0, 0.7, 0] });
      world.addJoint({ kind: "ball", bodyA: bodies.current[1]!.handle, bodyB: bodies.current[4]!.handle, anchorA: [0.45, -0.7, 0], anchorB: [0, 0.7, 0] });
      add([1.0, 0.35, 1.8], [7, 5, 0], "#38bdf8", slopeRotation);
      const vehicle = bodies.current.at(-1)!.handle;
      world.setVelocity(vehicle, [-1.5, 0, -3]);
      world.setAngularVelocity(vehicle, [0, 0, 1.8]);
      setReady(true);
    });
    return () => {
      alive = false;
      current?.dispose();
      backend.current = null;
      bodies.current = [];
      meshes.current.clear();
    };
  }, []);

  useFrame((_frame, dt) => {
    const world = backend.current;
    if (world === null) return;
    world.step(Math.min(dt, 1 / 30));
    for (const body of bodies.current) {
      const mesh = meshes.current.get(body.handle);
      const state = world.body(body.handle);
      if (mesh === undefined || state === null) continue;
      mesh.position.set(state.position[0], state.position[1], state.position[2]);
      mesh.quaternion.set(state.rotation[0], state.rotation[1], state.rotation[2], state.rotation[3]);
    }
  });

  return (
    <>
      <mesh position={[0, -0.4, 0]} receiveShadow>
        <boxGeometry args={[36, 0.8, 16]} />
        <meshStandardMaterial color="#334155" roughness={0.85} />
      </mesh>
      <mesh position={[-5, 2.7, 0]} rotation={[0, 0, 0.18]} receiveShadow>
        <boxGeometry args={[16, 0.7, 6]} />
        <meshStandardMaterial color="#64748b" roughness={0.8} />
      </mesh>
      {bodies.current.map((body) => (
        <mesh key={body.handle} ref={(mesh) => { if (mesh) meshes.current.set(body.handle, mesh); }} castShadow>
          <boxGeometry args={[body.halfExtents[0] * 2, body.halfExtents[1] * 2, body.halfExtents[2] * 2]} />
          <meshStandardMaterial color={body.color} roughness={0.5} metalness={0.1} />
        </mesh>
      ))}
    </>
  );
}

function PhysicsProbeUi() {
  return <div className="pointer-events-none absolute left-5 top-5 rounded bg-slate-950/75 px-4 py-3 font-mono text-sm text-slate-100">Rapier physics probe · crate slope · ball-joint ragdoll · rolling box vehicle</div>;
}

const game = defineGame({
  name: "physics-probe",
  assets: createAssetCatalog(),
  multiplayer: "off",
  world: { kind: "flat" },
  input: {},
  loop: { onInit: () => {}, onNewPlayer: () => {}, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  camera: { rig: "topDown", projection: "perspective", topDown: { yaw: 0.18, pitch: 0.9, height: 22 } },
  WorldOverlay: PhysicsProbeOverlay,
  GameUI: PhysicsProbeUi,
});

export const physicsProbeGame: PlayableGame = game;
