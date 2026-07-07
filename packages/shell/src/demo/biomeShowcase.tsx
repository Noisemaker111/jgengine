import { useMemo } from "react";
import * as THREE from "three";

import { defineGame } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createRegionField, isRegionField, type RegionDef } from "@jgengine/core/world/regions";
import { pickWeighted, scatterItems, type ScatterLayer } from "@jgengine/core/world/scatter";
import { usePlayer, useGameStore } from "@jgengine/react/hooks";

import type { PlayableGame } from "../registry";

// ─────────────────────────────────────────────────────────────────────────────
// Game-owned content. The engine knows nothing about "jungle" or "oak"; this
// game defines its regions (with the engine's generic tint/water/fog/speed
// knobs) plus its own opaque payload — display name, spawn table, prop palette —
// and maps each opaque prop id to a mesh below.
// ─────────────────────────────────────────────────────────────────────────────

interface Spawn {
  entity: string;
  weight: number;
  night?: boolean;
}

interface BiomeTags {
  displayName: string;
  spawns: readonly Spawn[];
  flora: readonly ScatterLayer[];
}

const HERO = "wanderer";
const GRAZER = "grazer";
const PROWLER = "prowler";

const REGIONS: readonly RegionDef<BiomeTags>[] = [
  { id: "ocean", selector: [0.52, 0.5, 0.12], height: { baseHeight: -8, amplitude: 2, frequency: 0.012 }, tint: "#4a5a68", water: "#245070", data: { displayName: "Ocean", spawns: [], flora: [] } },
  { id: "frozen_ocean", selector: [0.06, 0.5, 0.14], height: { baseHeight: -5, amplitude: 1.5, frequency: 0.012 }, tint: "#7f8a95", water: "#7fa8c4", fog: "#cdd8e2", fogDensity: 0.3, speedMultiplier: 0.85, data: { displayName: "Frozen Ocean", spawns: [], flora: [] } },
  { id: "beach", selector: [0.55, 0.3, 0.33], height: { baseHeight: 0.4, amplitude: 0.4, frequency: 0.03 }, tint: "#d9cf9a", water: "#2b6f90", data: { displayName: "Beach", spawns: [], flora: [{ item: "reeds", density: 0.05 }] } },
  { id: "plains", selector: [0.55, 0.4, 0.55], height: { baseHeight: 1, amplitude: 1.3, frequency: 0.02 }, tint: "#5a8a3c", steepTint: "#6b6f55", data: { displayName: "Plains", spawns: [{ entity: GRAZER, weight: 2 }], flora: [{ item: "tree_oak", density: 0.03 }] } },
  { id: "forest", selector: [0.5, 0.62, 0.58], height: { baseHeight: 1.5, amplitude: 1.8, frequency: 0.022 }, tint: "#3f6f2e", steepTint: "#5c5a44", data: { displayName: "Forest", spawns: [{ entity: GRAZER, weight: 1 }, { entity: PROWLER, weight: 1, night: true }], flora: [{ item: "tree_oak", density: 0.5, minScale: 0.8, maxScale: 1.4 }, { item: "boulder", density: 0.02 }] } },
  { id: "birch_forest", selector: [0.46, 0.56, 0.58], height: { baseHeight: 1.5, amplitude: 1.8, frequency: 0.022 }, tint: "#5a8a4a", data: { displayName: "Birch Forest", spawns: [{ entity: GRAZER, weight: 1 }], flora: [{ item: "tree_birch", density: 0.5, minScale: 0.9, maxScale: 1.5 }] } },
  { id: "dark_forest", selector: [0.5, 0.72, 0.6], height: { baseHeight: 1.5, amplitude: 2, frequency: 0.022 }, tint: "#2c4a24", fog: "#141b14", fogDensity: 0.6, data: { displayName: "Dark Forest", spawns: [{ entity: PROWLER, weight: 1 }], flora: [{ item: "tree_dark", density: 0.6, minScale: 1, maxScale: 1.6 }, { item: "mushroom", density: 0.05 }] } },
  { id: "taiga", selector: [0.3, 0.6, 0.58], height: { baseHeight: 1.5, amplitude: 2, frequency: 0.022 }, tint: "#3a5a40", data: { displayName: "Taiga", spawns: [{ entity: GRAZER, weight: 1 }], flora: [{ item: "tree_spruce", density: 0.45, minScale: 0.9, maxScale: 1.6 }] } },
  { id: "snowy_taiga", selector: [0.14, 0.52, 0.58], height: { baseHeight: 1.5, amplitude: 2, frequency: 0.022 }, tint: "#cdd6cf", speedMultiplier: 0.9, data: { displayName: "Snowy Taiga", spawns: [], flora: [{ item: "tree_spruce", density: 0.4, minScale: 0.9, maxScale: 1.5 }] } },
  { id: "snowy_plains", selector: [0.08, 0.3, 0.55], height: { baseHeight: 1, amplitude: 1.2, frequency: 0.02 }, tint: "#e6ecee", speedMultiplier: 0.85, data: { displayName: "Snowy Plains", spawns: [{ entity: PROWLER, weight: 1, night: true }], flora: [{ item: "tree_spruce", density: 0.04 }] } },
  { id: "swamp", selector: [0.62, 0.85, 0.46], height: { baseHeight: -0.4, amplitude: 0.6, frequency: 0.03 }, tint: "#4a5a30", water: "#3f4a2a", fog: "#43502f", fogDensity: 0.35, speedMultiplier: 0.6, data: { displayName: "Swamp", spawns: [{ entity: PROWLER, weight: 2 }], flora: [{ item: "tree_oak", density: 0.12, minScale: 0.7, maxScale: 1.1 }, { item: "reeds", density: 0.2 }, { item: "mushroom", density: 0.06 }] } },
  { id: "jungle", selector: [0.88, 0.9, 0.6], height: { baseHeight: 3, amplitude: 4, frequency: 0.03 }, tint: "#2f6b1f", steepTint: "#4a5a2a", fog: "#254d1c", fogDensity: 0.25, data: { displayName: "Jungle", spawns: [{ entity: GRAZER, weight: 1 }], flora: [{ item: "tree_jungle", density: 0.65, minScale: 1, maxScale: 2 }, { item: "mushroom", density: 0.04 }] } },
  { id: "savanna", selector: [0.82, 0.25, 0.55], height: { baseHeight: 1.5, amplitude: 1.4, frequency: 0.02 }, tint: "#8a9a4a", data: { displayName: "Savanna", spawns: [{ entity: GRAZER, weight: 1 }], flora: [{ item: "tree_acacia", density: 0.14, minScale: 0.9, maxScale: 1.5 }] } },
  { id: "desert", selector: [0.96, 0.05, 0.55], height: { baseHeight: 1, amplitude: 1.4, frequency: 0.022 }, tint: "#e0cd82", data: { displayName: "Desert", spawns: [{ entity: PROWLER, weight: 2, night: true }, { entity: GRAZER, weight: 1 }], flora: [{ item: "cactus", density: 0.08 }, { item: "deadbush", density: 0.06 }] } },
  { id: "badlands", selector: [0.92, 0.1, 0.66], height: { baseHeight: 6, amplitude: 7, frequency: 0.024, ridged: true }, tint: "#b5622f", steepTint: "#8a4a28", data: { displayName: "Badlands", spawns: [], flora: [{ item: "deadbush", density: 0.08 }, { item: "boulder", density: 0.03 }] } },
  { id: "windswept_hills", selector: [0.4, 0.4, 0.84], height: { baseHeight: 12, amplitude: 14, frequency: 0.015, ridged: true }, tint: "#5a6a4a", steepTint: "#787c74", data: { displayName: "Windswept Hills", spawns: [{ entity: GRAZER, weight: 1 }], flora: [{ item: "tree_spruce", density: 0.1 }, { item: "boulder", density: 0.08 }] } },
  { id: "stony_peaks", selector: [0.6, 0.4, 0.95], height: { baseHeight: 20, amplitude: 18, frequency: 0.014, ridged: true }, tint: "#7a7d82", steepTint: "#8f9298", data: { displayName: "Stony Peaks", spawns: [], flora: [{ item: "boulder", density: 0.06 }] } },
  { id: "snowy_peaks", selector: [0.08, 0.45, 0.95], height: { baseHeight: 22, amplitude: 20, frequency: 0.014, ridged: true }, tint: "#eef3f6", steepTint: "#b9c4cc", fog: "#dfe8ee", fogDensity: 0.2, speedMultiplier: 0.8, data: { displayName: "Snowy Peaks", spawns: [], flora: [{ item: "boulder", density: 0.03 }] } },
];

const field = createRegionField<BiomeTags>({
  regions: REGIONS,
  seed: 1904,
  selectorFrequencies: [0.004, 0.005, 0.0026],
  axisWeights: [1, 1, 1.7],
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { stats: { health: { max: 100 } }, movement: { poses: ["standing", "running"], walkSpeed: 3.6 } },
  [GRAZER]: { stats: { health: { max: 40 } }, movement: { poses: ["standing"], walkSpeed: 1 }, role: "npc" },
  [PROWLER]: { stats: { health: { max: 60 } }, movement: { poses: ["standing"], walkSpeed: 1.4 }, role: "enemy" },
};

const game = defineGame({
  name: "biome-showcase",
  assets: createAssetCatalog(),
  multiplayer: null,
  input: {
    moveForward: ["KeyW"],
    moveBack: ["KeyS"],
    moveLeft: ["KeyA"],
    moveRight: ["KeyD"],
    jump: ["Space"],
    sprint: ["Shift"],
    turnLeft: ["KeyQ"],
    turnRight: ["KeyE"],
  },
});

function spawnHero(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

function populate(ctx: GameContext): void {
  for (let index = 0; index < 14; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 8 + Math.random() * 60;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (field.sampleHeight(x, z) < field.seaLevel + 0.2) continue;
    const spawns = field.sampleRegion(x, z).data?.spawns ?? [];
    const entity = pickWeighted(
      spawns.filter((spawn) => spawn.night !== true).map((spawn) => ({ value: spawn.entity, weight: spawn.weight })),
      Math.random(),
    );
    if (entity !== null) ctx.scene.entity.spawn(entity, { position: [x, 0, z], role: "npc" });
  }
}

function onInit(): void {}

function onNewPlayer(ctx: GameContext): void {
  spawnHero(ctx);
  populate(ctx);
}

function onTick(ctx: GameContext): void {
  if (ctx.scene.entity.get(ctx.player.userId) === null) spawnHero(ctx);
}

// ─── Flora meshes (game-owned; the engine placed opaque item ids) ────────────

interface FloraPart {
  geo: "cyl" | "sphere" | "cone" | "box" | "dodeca";
  color: string;
  y: number;
  rxz: number;
  ry: number;
}

const FLORA_PARTS: Record<string, readonly FloraPart[]> = {
  tree_oak: [{ geo: "cyl", color: "#6b4a2f", y: 0.9, rxz: 0.18, ry: 1.8 }, { geo: "sphere", color: "#3f7a34", y: 2.2, rxz: 1.1, ry: 1.2 }],
  tree_birch: [{ geo: "cyl", color: "#d8d8cf", y: 0.9, rxz: 0.14, ry: 1.8 }, { geo: "sphere", color: "#6fae52", y: 2.2, rxz: 1, ry: 1.2 }],
  tree_spruce: [{ geo: "cyl", color: "#5a3f28", y: 0.8, rxz: 0.15, ry: 1.6 }, { geo: "cone", color: "#2f5a34", y: 2.4, rxz: 1, ry: 2.6 }],
  tree_jungle: [{ geo: "cyl", color: "#6b5a3a", y: 1.6, rxz: 0.2, ry: 3.4 }, { geo: "sphere", color: "#2f6b24", y: 3.8, rxz: 1.5, ry: 1.4 }],
  tree_acacia: [{ geo: "cyl", color: "#7a5a34", y: 1.2, rxz: 0.17, ry: 2.4 }, { geo: "sphere", color: "#8a9a4a", y: 2.8, rxz: 1.6, ry: 0.5 }],
  tree_dark: [{ geo: "cyl", color: "#4a3420", y: 1.1, rxz: 0.24, ry: 2.2 }, { geo: "sphere", color: "#244a1c", y: 2.8, rxz: 1.5, ry: 1.1 }],
  cactus: [{ geo: "box", color: "#3f7a3a", y: 0.9, rxz: 0.22, ry: 1.8 }],
  deadbush: [{ geo: "box", color: "#8a6a3a", y: 0.4, rxz: 0.3, ry: 0.7 }],
  boulder: [{ geo: "dodeca", color: "#7a7d82", y: 0.4, rxz: 0.9, ry: 0.7 }],
  mushroom: [{ geo: "cyl", color: "#e8e0d0", y: 0.25, rxz: 0.08, ry: 0.5 }, { geo: "sphere", color: "#b23a2f", y: 0.6, rxz: 0.35, ry: 0.25 }],
  reeds: [{ geo: "box", color: "#4a7a3a", y: 0.5, rxz: 0.06, ry: 1 }],
};

function BiomeFlora() {
  const geometries = useMemo(
    () => ({
      cyl: new THREE.CylinderGeometry(1, 1, 1, 7),
      sphere: new THREE.SphereGeometry(1, 8, 6),
      cone: new THREE.ConeGeometry(1, 1, 7),
      box: new THREE.BoxGeometry(1, 1, 1),
      dodeca: new THREE.DodecahedronGeometry(1, 0),
    }),
    [],
  );
  const instances = useMemo(
    () =>
      isRegionField(field)
        ? scatterItems(field, { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, (sample) => sample.data?.flora ?? [], {
            cell: 6,
            max: 600,
          })
        : [],
    [],
  );
  return (
    <>
      {instances.map((instance) => {
        const parts = FLORA_PARTS[instance.item];
        if (parts === undefined) return null;
        return (
          <group key={instance.id} position={[instance.x, instance.y, instance.z]} rotation-y={instance.rotation}>
            {parts.map((part, partIndex) => (
              <mesh
                key={partIndex}
                geometry={geometries[part.geo]}
                position-y={part.y * instance.scale}
                scale={[part.rxz * instance.scale, part.ry * instance.scale, part.rxz * instance.scale]}
              >
                <meshStandardMaterial color={part.color} roughness={0.9} />
              </mesh>
            ))}
          </group>
        );
      })}
    </>
  );
}

function BiomeReadout() {
  const { userId } = usePlayer();
  const position = useGameStore((ctx) => ctx.scene.entity.get(userId)?.position ?? null);
  if (position === null || !isRegionField(field)) return null;
  const sample = field.sampleRegion(position[0], position[2]);
  const data = sample.region.data as BiomeTags | undefined;
  const [temperature, humidity, continentalness] = sample.selector;
  return (
    <div className="rounded bg-black/60 px-3 py-2 text-white">
      <p className="text-sm font-semibold text-emerald-300">{data?.displayName ?? sample.region.id}</p>
      <p className="text-[11px] text-white/60">
        temp {temperature!.toFixed(2)} · humidity {humidity!.toFixed(2)} · continent {continentalness!.toFixed(2)}
      </p>
      {sample.speedMultiplier < 0.99 ? (
        <p className="text-[11px] text-amber-300">move ×{sample.speedMultiplier.toFixed(2)}</p>
      ) : null}
      {data !== undefined && data.spawns.length > 0 ? (
        <p className="text-[11px] text-white/50">spawns: {data.spawns.map((spawn) => spawn.entity).join(", ")}</p>
      ) : null}
    </div>
  );
}

function ShowcaseUI() {
  return (
    <div className="pointer-events-none absolute inset-0 font-mono">
      <div className="absolute left-4 top-4 w-64">
        <BiomeReadout />
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] text-white/40">
        WASD move · Shift sprint · Q/E turn — walk across biomes
      </div>
    </div>
  );
}

export const biomeShowcaseGame: PlayableGame = {
  game,
  terrain: field,
  camera: { initialDistance: 26, initialHeight: 16, maxDistance: 90, targetHeight: 3 },
  content: {
    itemById: () => null,
    entityById: (catalogId) => entityCatalog[catalogId] ?? null,
  },
  loop: { onInit, onNewPlayer, onTick },
  GameUI: ShowcaseUI,
  WorldOverlay: BiomeFlora,
};
