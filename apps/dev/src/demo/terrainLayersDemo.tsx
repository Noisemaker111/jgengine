import { createEditableTerrain } from "@jgengine/core/world/terraform";
import { environment, terrain } from "@jgengine/core/world/features";
import type { TerrainMaterialLayer } from "@jgengine/core/world/terraform";
import type { PlayableGame } from "@jgengine/shell/registry";
import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import { libraryMaterialAsset } from "@jgengine/assets/catalogs/materialLibrary";

import { demoGame } from "./demoGame";

const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
/** `?procedural=1` drops the layer maps: the mask blend is still there, one procedural surface per layer. */
const procedural = params.get("procedural") === "1";

/** What `set_terrain_layers` writes: the authored library name plus the URL the editor resolved it to. */
function layerMap(name: string): { material?: string; materialUrl?: string } {
  if (procedural) return {};
  return { material: name, materialUrl: libraryMaterialAsset(name).textures?.color?.url };
}

const LAYERS: readonly TerrainMaterialLayer[] = [
  { id: "turf", surface: "grass", tiling: 6, roughness: 0.95, ...layerMap("foliage/grass") },
  { id: "rock", surface: "rock", tiling: 5, roughness: 0.82, ...layerMap("ground/rock") },
];

const sculpt = (() => {
  const editable = createEditableTerrain({ bounds: { minX: -40, minZ: -40, maxX: 40, maxZ: 40 }, cellSize: 1 });
  editable.setLayers(LAYERS);
  editable.blendRecording({ mode: "paint", center: [0, 0], radius: 60, strength: 1, surface: "grass" }, () => {});
  // Two authored rock outcrops painted into the turf; the mask, not a second mesh, blends them.
  for (const [x, z, radius] of [[-10, -6, 9], [9, 7, 11], [2, -16, 6]] as const) {
    editable.blendRecording({ mode: "paint", center: [x, z], radius, strength: 0.92, surface: "rock", falloff: "smooth" }, () => {});
  }
  return editable.snapshot();
})();

const feature = environment({
  terrain: terrain({
    bounds: { w: 80, d: 80 },
    segments: 140,
    colors: { low: "#4c5c3a", high: "#6f7f4e" },
    flatten: [{ center: [0, 0], radius: 200, height: 2, falloff: 20 }],
    detail: { strength: 0.9, snowHeight: 9999, waterLevel: -50 },
  }),
  sculpt,
});

/** Terrain painted as two authored layers, each carrying its own scanned ambientCG map. */
function TerrainLayers() {
  return (
    <group>
      <ambientLight intensity={0.35} />
      <directionalLight position={[16, 24, 12]} intensity={2.4} />
      <EnvironmentScene feature={feature} />
    </group>
  );
}

export const terrainLayersGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "terrain-layers" },
  renderEntity: () => <group />,
  renderObject: () => <group />,
  loop: { ...demoGame.loop, onTick: () => {} },
  look: "flat",
  lighting: { ambient: { intensity: 0.4 }, directional: [{ intensity: 2.4, position: [16, 24, 12], color: "#fff3df" }] },
  backdrop: { background: "#2a2f26" },
  postProcessing: { enabled: true, toneMapping: "aces", exposure: 1, bloom: false, ao: false, grade: false, stylize: false, aa: "msaa" },
  environment: TerrainLayers,
  GameUI: () => (
    <div style={{ pointerEvents: "none", position: "absolute", inset: 0, color: "#f2f3f0", fontFamily: "sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
      <div style={{ position: "absolute", top: 14, left: 18, fontSize: 15, fontWeight: 600 }}>
        Terrain layers · {procedural ? "procedural surfaces (no layer maps)" : "each layer's own scanned map, blended by the authored mask"}
      </div>
      <div style={{ position: "absolute", bottom: 14, left: 18, fontSize: 11, opacity: 0.85 }}>
        turf = foliage/grass at 6 m · rock = ground/rock at 5 m · the same painted weights drive both states
      </div>
    </div>
  ),
  capture: {
    views: {
      overview: { look: "0,2,0", lookFrom: "26,13,0.35" },
      close: { look: "-8,2,-4", lookFrom: "7,2.5,0.6" },
    },
  },
};
