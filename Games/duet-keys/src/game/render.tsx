import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import type { ModelConfig, ModelMaterialOverride } from "@jgengine/core/game/playableGame";
import type { ModelAssetRef } from "@jgengine/core/scene/assetCatalog";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { useGameContext } from "@jgengine/react/provider";
import { useStore } from "@jgengine/react/store";
import { applyMaterialOverride } from "@jgengine/shell/materialOverride";
import { cloneModelScene, disposeClonedMaterials } from "@jgengine/shell/render/modelRender";

import { assets, DUNGEON } from "./assets";
import { HEROES } from "./entities/players/catalog";
import { objectStyles, type ObjectId } from "./objects/catalog";
import { ROOMS, roomBounds, type RoomDef } from "./rooms/catalog";
import { currentRoomState } from "./rooms/setup";
import { duetStore } from "./stores";
import { DIR_VECTORS, type V2 } from "./types";

const VOID_BASE = "#0b0f1e";
const VOID_HIGH = "#141a30";
const ROOM_BASE = "#232a44";

/**
 * A dedicated `LoadingManager`, not the implicit `THREE.DefaultLoadingManager` a bare
 * `useLoader(GLTFLoader, url, ...)` constructs — matches the fix in `packages/shell/GamePlayerShell.tsx`.
 * The shared default manager is process-wide singleton state — under this dev server's repeated
 * navigations it can end up with an already-aborted internal `AbortController`, which
 * `FileLoader.load()` composes into every future request's abort signal, silently stalling
 * `GLTFLoader.load()` forever with no thrown error (parsing already-fetched bytes still works fine
 * — it's a fetch-stage-only hang). A private manager sidesteps the shared state.
 */
const gltfLoader = new GLTFLoader(new THREE.LoadingManager());
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

function resolveModel(id: string): ModelAssetRef {
  const entry = assets.resolve(id);
  if (entry === null) throw new Error(`duet-keys: unknown model id "${id}"`);
  return entry;
}

/** kaykit-dungeon ships on its own ~4-unit tile grid; these scales bring each piece down to this
 * game's 1-unit grid (a pillar's 1.5-unit footprint * 0.6 ≈ 0.9, comfortably inside one cell). */
const WALL_SCALE = 0.6;
const FLOOR_SCALE = 0.5;
const GATE_SCALE = 0.55;
const SPIKE_SCALE = 0.25;
const RECEIVER_SCALE = 1.05;
const EXIT_SCALE = 0.2;
const EMITTER_SCALE = 1.05;
const HERO_SCALE = 0.4;
const PRISM_SCALE = 4.4;
const WEIGHT_SCALE = 1.6;

/** Warm every dungeon-kit id into `useLoader`'s cache before the Canvas's render loop starts
 * competing for the main thread — `useLoader` inside an active `useFrame` loop can starve the
 * fetch/parse continuation for a very long time on a busy machine; preloading while the page is
 * still quiet avoids that entirely. */
for (const id of Object.values(DUNGEON)) {
  useLoader.preload(gltfLoader, resolveModel(id).url);
}

/**
 * Every placed object routes through this one preloaded `gltfLoader` via `renderObject` — including
 * wall/emitter/exit, which have no per-instance tint and would otherwise be the obvious fit for the
 * engine's static `objectModels` map. `objectModels` resolves through the shell's own separate
 * `sharedGltfLoader` instance (`packages/shell/GamePlayerShell.tsx`), which this game's module-level
 * `useLoader.preload` never warms — that split cache reintroduces the exact main-thread-starvation
 * hang the preload exists to avoid. Keeping every model on this game's one loader keeps the preload
 * meaningful for all of them.
 */
const OBJECT_MODEL_IDS: Record<ObjectId, string> = {
  wall: DUNGEON.wall,
  emitter: DUNGEON.torch,
  exit_lumen: DUNGEON.stairs,
  exit_anchor: DUNGEON.stairs,
  gate: DUNGEON.gate,
  plate: DUNGEON.plate,
  receiver: DUNGEON.column,
  spike: DUNGEON.trap,
};

const OBJECT_SCALE: Record<ObjectId, number> = {
  wall: WALL_SCALE,
  emitter: EMITTER_SCALE,
  exit_lumen: EXIT_SCALE,
  exit_anchor: EXIT_SCALE,
  gate: GATE_SCALE,
  plate: FLOOR_SCALE,
  receiver: RECEIVER_SCALE,
  spike: SPIKE_SCALE,
};

/** Objects with no dynamic `object.visual` (wall) or whose tint never changes at runtime
 * (emitter/exit) get their look fixed here; gate/plate/receiver/spike fall through to
 * `object.visual.color`, set live by `applyRoomVisuals`. */
const OBJECT_STATIC_MATERIAL: Partial<Record<ObjectId, ModelMaterialOverride>> = {
  emitter: { color: objectStyles.emitter.color, emissive: "#bafcff", emissiveIntensity: 0.55 },
  exit_lumen: { color: HEROES.lumen.color, emissive: HEROES.lumen.glow, emissiveIntensity: 0.45 },
  exit_anchor: { color: HEROES.anchor.color, emissive: HEROES.anchor.glow, emissiveIntensity: 0.45 },
};

class ModelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

function ModelBoundary({ children }: { children: ReactNode }) {
  return (
    <ModelErrorBoundary>
      <Suspense fallback={null}>{children}</Suspense>
    </ModelErrorBoundary>
  );
}

function centeredPosition(entry: ModelAssetRef, baseY = 0, scale = 1): [number, number, number] {
  const dims = entry.dims;
  if (dims === undefined) return [0, baseY, 0];
  return [-scale * dims.center.x, baseY - scale * dims.minY, -scale * dims.center.z];
}

function useDungeonScene(id: string, material: ModelMaterialOverride | undefined, poseClip?: string) {
  const entry = resolveModel(id);
  const gltf = useLoader(gltfLoader, entry.url);
  const materialKey =
    material === undefined
      ? ""
      : `${material.color ?? ""}|${material.emissive ?? ""}|${material.emissiveIntensity ?? ""}`;
  const scene = useMemo(
    () => {
      const cloned = cloneModelScene(gltf.scene);
      if (material !== undefined) applyMaterialOverride(cloned, material, { clone: false });
      if (poseClip !== undefined) {
        const clip = THREE.AnimationClip.findByName(gltf.animations, poseClip);
        if (clip !== null) {
          const mixer = new THREE.AnimationMixer(cloned);
          mixer.clipAction(clip).play();
          mixer.update(0);
        }
      }
      return cloned;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gltf, materialKey, poseClip],
  );
  useEffect(() => () => disposeClonedMaterials(scene), [scene]);
  return { scene, entry };
}

function setOpacity(root: THREE.Object3D, opacity: number): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const standard = material as THREE.MeshStandardMaterial;
      standard.transparent = opacity < 1;
      standard.opacity = opacity;
    }
  });
}

/** The two heroes, rendered as real kaykit-adventurers characters — cyan-tinted Mage (Lumen) and
 * orange-tinted Barbarian (Anchor) — with a floor ring marking which one the player is driving. */
function HeroMesh({ entity }: { entity: SceneEntity }) {
  const active = useStore(duetStore, (state) => state.active);
  const hero = entity.name === "anchor" ? HEROES.anchor : HEROES.lumen;
  const isActive = active === hero.id;
  const modelId = hero.id === "anchor" ? DUNGEON.orcHero : DUNGEON.humanHero;
  const { scene, entry } = useDungeonScene(
    modelId,
    {
      color: hero.color,
      emissive: hero.glow,
      emissiveIntensity: isActive ? 0.35 : 0.12,
    },
    "Idle",
  );
  const position = centeredPosition(entry, 0, HERO_SCALE);
  return (
    <group>
      <primitive object={scene} position={position} scale={HERO_SCALE} />
      <mesh rotation-x={-Math.PI / 2} position-y={0.05}>
        <ringGeometry args={[0.5, 0.62, 24]} />
        <meshBasicMaterial color={hero.glow} transparent opacity={isActive ? 0.95 : 0.25} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function renderHero(entity: SceneEntity): ReactNode {
  if (entity.name !== "lumen" && entity.name !== "anchor") return null;
  return (
    <ModelBoundary>
      <HeroMesh entity={entity} />
    </ModelBoundary>
  );
}

/** Every placed object — wall/emitter/exit statically tinted, gate/plate/receiver/spike live-tinted
 * (and, via the object's own position — sunk/raised by `applyRoomVisuals`) from real dungeon-kit
 * models on this game's single preloaded loader. */
function DungeonObjectMesh({ object }: { object: SceneObject }) {
  const catalogId = object.catalogId as ObjectId;
  const modelId = OBJECT_MODEL_IDS[catalogId];
  const scale = OBJECT_SCALE[catalogId];
  const dynamicColor = object.visual?.color;
  const material =
    dynamicColor !== undefined
      ? { color: dynamicColor, emissive: dynamicColor, emissiveIntensity: 0.5 }
      : OBJECT_STATIC_MATERIAL[catalogId];
  const opacity = object.visual?.opacity ?? 1;
  const { scene, entry } = useDungeonScene(modelId, material);
  useEffect(() => setOpacity(scene, opacity), [scene, opacity]);
  const position = centeredPosition(entry, 0, scale);
  return <primitive object={scene} position={position} scale={scale} />;
}

export function renderDuetObject(object: SceneObject): ReactNode {
  if (!(object.catalogId in OBJECT_MODEL_IDS)) return null;
  return (
    <ModelBoundary>
      <DungeonObjectMesh object={object} />
    </ModelBoundary>
  );
}

function hashCell({ x, z }: V2): number {
  return Math.abs((x * 92821 + z * 68917) | 0);
}

const FLOOR_VARIANT_IDS = [DUNGEON.floor, DUNGEON.floorDetail, DUNGEON.dirt] as const;

/** Tiles the room's walkable footprint with real dungeon-kit floor GLBs (three variants, hashed
 * per cell for texture variety) instead of one flat color plane. */
function FloorTiles({ room }: { room: RoomDef }) {
  const floor = useLoader(gltfLoader, resolveModel(FLOOR_VARIANT_IDS[0]).url);
  const detail = useLoader(gltfLoader, resolveModel(FLOOR_VARIANT_IDS[1]).url);
  const dirt = useLoader(gltfLoader, resolveModel(FLOOR_VARIANT_IDS[2]).url);

  const tiles = useMemo(
    () => {
      const variants = [floor, detail, dirt];
      return room.floor.map((cell) => {
        const hash = hashCell(cell);
        const gltf = variants[hash % variants.length]!;
        return {
          key: `${cell.x}:${cell.z}`,
          cell,
          scene: cloneModelScene(gltf.scene),
          rotationY: (hash % 4) * (Math.PI / 2),
        };
      });
    },
    [room, floor, detail, dirt],
  );

  useEffect(
    () => () => {
      for (const tile of tiles) disposeClonedMaterials(tile.scene);
    },
    [tiles],
  );

  return (
    <>
      {tiles.map((tile) => (
        <primitive
          key={tile.key}
          object={tile.scene}
          position={[tile.cell.x, 0, tile.cell.z]}
          rotation-y={tile.rotationY}
          scale={FLOOR_SCALE}
        />
      ))}
    </>
  );
}

function voidGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(200, 200, 48, 48);
  const positions = geometry.attributes.position!;
  const base = new THREE.Color(VOID_BASE);
  const high = new THREE.Color(VOID_HIGH);
  const colors = new Float32Array(positions.count * 3);
  const tmp = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const blend = 0.5 + Math.sin(x * 0.08) * 0.3 + Math.cos(y * 0.06) * 0.3;
    tmp.copy(base).lerp(high, Math.min(1, Math.max(0, blend)));
    colors[index * 3] = tmp.r;
    colors[index * 3 + 1] = tmp.g;
    colors[index * 3 + 2] = tmp.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function DuetEnvironment() {
  const roomIndex = useStore(duetStore, (s) => s.roomIndex);
  const room = ROOMS[roomIndex] ?? ROOMS[0]!;
  const bounds = roomBounds(room);
  const voidGeo = useMemo(voidGeometry, []);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.4} geometry={voidGeo} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} metalness={0} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[bounds.centerX, -0.02, bounds.centerZ]} receiveShadow>
        <planeGeometry args={[bounds.width + 0.4, bounds.depth + 0.4]} />
        <meshStandardMaterial color={ROOM_BASE} roughness={0.85} metalness={0.05} />
      </mesh>
      <ModelBoundary>
        <FloorTiles room={room} />
      </ModelBoundary>
    </group>
  );
}

/** Dynamic devices the heroes latch: Lumen's spinning prism crystal + light beam, Anchor's dropped
 * weight — real dungeon-kit props instead of primitive octahedron/cylinder geometry. */
function PrismProp({ position }: { position: [number, number, number] }) {
  const { scene, entry } = useDungeonScene(DUNGEON.coin, {
    color: HEROES.lumen.glow,
    emissive: HEROES.lumen.color,
    emissiveIntensity: 1.1,
  });
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_state, delta) => {
    if (groupRef.current !== null) groupRef.current.rotation.y += delta * 1.6;
  });
  const local = centeredPosition(entry, 0.55, PRISM_SCALE);
  return (
    <group ref={groupRef} position={position}>
      <primitive object={scene} position={local} scale={PRISM_SCALE} />
    </group>
  );
}

function AnchorWeightProp({ position }: { position: [number, number, number] }) {
  const { scene, entry } = useDungeonScene(DUNGEON.trunk, {
    color: "#2a2f3d",
    metalness: 0.5,
    roughness: 0.5,
  });
  const local = centeredPosition(entry, 0, WEIGHT_SCALE);
  return (
    <group position={position}>
      <primitive object={scene} position={local} scale={WEIGHT_SCALE} />
    </group>
  );
}

export function DuetVfx() {
  const ctx = useGameContext();
  const beamRef = useRef<THREE.Mesh>(null);
  const latch = useStore(duetStore, (s) => s.latch);

  useFrame(() => {
    const room = ROOMS[duetStore.peek(ctx)?.roomIndex ?? 0];
    const beam = beamRef.current;
    if (latch.prism === null || room === undefined) {
      if (beam !== null) beam.visible = false;
      return;
    }
    const state = currentRoomState(ctx, room);
    const dir = DIR_VECTORS[latch.prism.dir];
    const start = latch.prism.cell;
    const end = state.beamPath.length > 0 ? state.beamPath[state.beamPath.length - 1]! : start;
    const length = Math.abs(end.x - start.x) + Math.abs(end.z - start.z);
    if (beam !== null) {
      beam.visible = length > 0;
      if (length > 0) {
        beam.position.set((start.x + end.x) / 2 + dir.x * 0.5, 0.5, (start.z + end.z) / 2 + dir.z * 0.5);
        beam.scale.set(dir.x !== 0 ? length + 1 : 0.14, 0.14, dir.z !== 0 ? length + 1 : 0.14);
      }
    }
  });

  return (
    <group>
      <mesh ref={beamRef} visible={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={HEROES.lumen.color}
          emissive={HEROES.lumen.glow}
          emissiveIntensity={1.4}
          transparent
          opacity={0.8}
        />
      </mesh>
      {latch.anchorCell !== null ? (
        <ModelBoundary>
          <AnchorWeightProp position={[latch.anchorCell.x, 0, latch.anchorCell.z]} />
        </ModelBoundary>
      ) : null}
      {latch.prism !== null ? (
        <ModelBoundary>
          <PrismProp position={[latch.prism.cell.x, 0, latch.prism.cell.z]} />
        </ModelBoundary>
      ) : null}
    </group>
  );
}
