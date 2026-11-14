/** @jsxImportSource @jgengine/core/ui/jsx */
import * as THREE from "three";
import type { ReactNode } from "@jgengine/core/ui/jsx";

import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { hashString } from "@jgengine/core/random/rng";
import { useGameContext } from "@jgengine/ui/provider";

import { session } from "../session";
import { bugBodyFor, PROCEDURAL_KINDS, staticBodyFor } from "./bugMeshes";

const BODY_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05 });
const CHAMBER_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
const SHINY_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.1 });
const WING_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
const LOAD_GEOMETRY = new THREE.DodecahedronGeometry(0.3, 0);
// A team ring on the lawn under every walker: sunflower for the red colony, violet for the black
// ants and their wasps, so a column reads at any zoom and friend from foe at a glance.
const TEAM_RING = (() => {
  const g = new THREE.RingGeometry(0.78, 1, 28);
  g.rotateX(-Math.PI / 2);
  return g;
})();
const TEAM_RING_MATERIAL = {
  player: new THREE.MeshBasicMaterial({ color: "#ffd23f", transparent: true, opacity: 0.85, depthWrite: false }),
  enemy: new THREE.MeshBasicMaterial({ color: "#b18cff", transparent: true, opacity: 0.85, depthWrite: false }),
};
/** How wide each walker's team ring is, by caste. */
const RING_RADIUS: Record<string, number> = { worker: 1.2, scout: 1.25, soldier: 1.45, spitter: 1.4, hero: 1.9, beetle: 2.2, raider: 1.35, major: 1.6, wasp: 1.5 };
const LOAD_MATERIALS: Record<string, THREE.MeshStandardMaterial> = {
  sugar: new THREE.MeshStandardMaterial({ color: "#f3c25c", roughness: 0.6, emissive: "#5a3a00", emissiveIntensity: 0.25 }),
  leaf: new THREE.MeshStandardMaterial({ color: "#6cbf3a", roughness: 0.7 }),
};
const SHINY = new Set(["popsicle", "dewdrop", "beetle", "acid_mound"]);
const KNOWN = new Set(PROCEDURAL_KINDS);

/** What a forager is hauling home right now (drawn in its mandibles), or null. */
function haulOf(id: string): string | null {
  const command = session.units.get(id)?.command;
  return command?.kind === "gather" && command.phase === "toDepot" ? command.resource : null;
}

function meshOf(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * One entity's procedural body as an {@link EngineDraw}: static chambers and food are a single mesh;
 * ants, the beetle and the wasp scuttle on two alternating leg tripods while they move, bob as they
 * walk, and a forager carries its crumb or leaf scrap home in its jaws.
 */
export function bugDraw(ctx: GameContext | null, entity: SceneEntity): EngineDraw {
  const root = new THREE.Group();
  const kind = entity.name;
  const phase = (hashString(entity.id) % 628) / 100;
  const body = bugBodyFor(kind);
  const scale = ctx?.scene.entity.visualScaleOf(entity.id) ?? 1;
  root.scale.setScalar(scale);
  let last: [number, number] | null = null;
  let stride = phase;
  let parts: { trunk: THREE.Group; legsA: THREE.Mesh; legsB: THREE.Mesh; wings: THREE.Mesh | null; load: THREE.Mesh; ring: THREE.Mesh } | null = null;

  if (body === null) {
    const geometry = staticBodyFor(kind);
    if (geometry !== null) {
      const mesh = meshOf(geometry, SHINY.has(kind) ? SHINY_MATERIAL : CHAMBER_MATERIAL);
      mesh.rotation.y = phase;
      root.add(mesh);
    }
  } else {
    const trunk = new THREE.Group();
    trunk.position.y = body.ride;
    const bodyMesh = meshOf(body.body, SHINY.has(kind) ? SHINY_MATERIAL : BODY_MATERIAL);
    const legsA = meshOf(body.legsA, BODY_MATERIAL);
    const legsB = meshOf(body.legsB, BODY_MATERIAL);
    const wings = body.wings === undefined ? null : new THREE.Mesh(body.wings, WING_MATERIAL);
    const load = new THREE.Mesh(LOAD_GEOMETRY, LOAD_MATERIALS["sugar"]);
    load.position.set(0, 0.7, 2.35);
    const ring = new THREE.Mesh(TEAM_RING, TEAM_RING_MATERIAL.player);
    ring.scale.setScalar(RING_RADIUS[kind] ?? 1.3);
    ring.position.y = 0.06;
    ring.visible = false;
    root.add(ring);
    load.visible = false;
    trunk.add(bodyMesh, legsA, legsB, load);
    if (wings !== null) trunk.add(wings);
    root.add(trunk);
    parts = { trunk, legsA, legsB, wings, load, ring };
  }

  return {
    mount(state: EngineFrameState) {
      state.scene.add(root);
    },
    frame(state: EngineFrameState, delta: number) {
      if (parts === null || ctx === null) return;
      const live = ctx.scene.entity.get(entity.id);
      if (live === null) return;
      const faction = session.units.get(entity.id)?.faction;
      if (faction !== undefined) {
        parts.ring.visible = true;
        parts.ring.material = TEAM_RING_MATERIAL[faction];
      }
      const x = live.position[0];
      const z = live.position[2];
      const moved = last === null ? 0 : Math.hypot(x - last[0], z - last[1]);
      last = [x, z];
      const speed = delta > 0 ? moved / delta : 0;
      const walking = speed > 0.3;
      stride += walking ? delta * (8 + speed * 2.2) : 0;
      const swing = walking ? Math.sin(stride) * 0.28 : 0;
      parts.legsA.rotation.y = swing;
      parts.legsB.rotation.y = -swing;
      parts.legsA.position.y = walking ? Math.max(0, Math.sin(stride)) * 0.06 : 0;
      parts.legsB.position.y = walking ? Math.max(0, -Math.sin(stride)) * 0.06 : 0;
      const t = state.clock.elapsedTime + phase;
      if (parts.wings !== null) {
        parts.trunk.position.y = 1.6 + Math.sin(t * 3) * 0.18;
        parts.wings.scale.x = 0.55 + Math.abs(Math.sin(t * 38)) * 0.45;
      } else {
        parts.trunk.position.y = walking ? Math.abs(Math.sin(stride)) * 0.04 : Math.sin(t * 1.4) * 0.01;
        parts.trunk.rotation.z = walking ? Math.sin(stride) * 0.03 : 0;
      }
      const haul = haulOf(entity.id);
      parts.load.visible = haul !== null;
      if (haul !== null) parts.load.material = LOAD_MATERIALS[haul] ?? LOAD_MATERIALS["sugar"]!;
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(root);
      root.clear();
    },
  };
}

function BugMesh({ entity }: { entity: SceneEntity }) {
  const ctx = useGameContext();
  return <EngineDrawMount create={() => bugDraw(ctx, entity)} deps={[ctx, entity.id, entity.name]} />;
}

/** The scene's per-entity override: every LAWN ORDER kind draws its own procedural body. */
export function renderEntity(entity: SceneEntity): ReactNode {
  if (!KNOWN.has(entity.name)) return null;
  return <BugMesh entity={entity} />;
}
