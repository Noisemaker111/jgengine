import { filterLibraryMaterials, libraryMaterialAsset, type LibraryGroup, type LibraryMaterial } from "@jgengine/assets/catalogs/materialLibrary";
import { Suspense, useMemo } from "react";
import * as THREE from "three";

import type { PlayableGame } from "@jgengine/shell/registry";
import { EnvironmentLighting } from "@jgengine/shell/render/EnvironmentLighting";
import { MaterialAssetSurface } from "@jgengine/shell/render/materialAsset";
import { TriplanarAssetMaterial } from "@jgengine/shell/render/triplanarMaterial";

import { demoGame } from "./demoGame";

/** Where `assets pull library --dir apps/dev/public/library-materials` writes the maps. */
const BASE_PATH = "/library-materials/materials";
const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
/** `?sheet=flat` keeps the same layout but paints each surface with one flat colour. */
const flat = params.get("sheet") === "flat";
/** `?projection=uv` renders through the existing UV material path instead of triplanar projection. */
const uvProjection = params.get("projection") === "uv";
/** `?compare=1` renders each entry twice: UV-mapped left, world-space triplanar right. */
const compare = params.get("compare") === "1";
const group = params.get("group") as LibraryGroup | null;

const COLUMNS = 8;
const SPACING = 1.2;
/** One texture tile across the whole sphere, so the sheet shows the scan rather than a smeared average. */
const INSPECTION_TILE_METRES = Number(params.get("tile") ?? "0.9");
/** Blend sharpness override, for judging the three projections independently. */
const SHARPNESS = Number(params.get("sharp") ?? "8");

/** One flat stand-in colour per group, used only by `?sheet=flat` to show what a placeable lacks. */
const FLAT: Record<LibraryGroup, string> = {
  asphalt: "#55575a", concrete: "#9a9a96", stucco: "#c9c2b4", brick: "#8d5b48", tile: "#a9a49b",
  metal: "#8e949a", wood: "#7d5a3c", foliage: "#5c7a3d", ground: "#8a7a5c", fabric: "#a8a49c",
  stone: "#b5b2ac", glass: "#a9c4c9", water: "#37555e",
};

/** Geometry without a `uv` attribute: the triplanar path must still show a textured surface. */
function sphereFor(mode: "uv" | "triplanar"): THREE.SphereGeometry {
  const geometry = new THREE.SphereGeometry(0.52, 40, 28);
  if (mode === "triplanar") geometry.deleteAttribute("uv");
  return geometry;
}

const SPHERE = sphereFor(uvProjection ? "uv" : "triplanar");
/** UV sphere for side-by-side comparisons against the world-space path. */
const SPHERE_UV = sphereFor("uv");

/** One 1 m plane with no UVs; world-space projection makes scale and placement irrelevant. */
const WORLD_PLANE = (() => {
  const geometry = new THREE.PlaneGeometry(1, 1);
  if (!uvProjection) geometry.deleteAttribute("uv");
  return geometry;
})();

interface WorldSurface {
  name: string;
  /** Position and Euler rotation in radians. */
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number];
}

/** World surfaces at their authored tile metres: a street, its buildings and a station interior. */
const WORLD: readonly WorldSurface[] = [
  { name: "road/marked", position: [0, 0, 0], rotation: [-Math.PI / 2, 0, 0], scale: [26, 22] },
  { name: "asphalt/wet", position: [-9.2, 0.01, 2], rotation: [-Math.PI / 2, 0, 0], scale: [7, 14] },
  { name: "brick/red", position: [-13, 4, -11], rotation: [0, 0, 0], scale: [26, 8] },
  { name: "stucco/painted", position: [13, 4, -11], rotation: [0, 0, 0], scale: [26, 8] },
  { name: "metal/painted", position: [0, 5.2, -11.5], rotation: [0, 0, 0], scale: [10, 4] },
  { name: "wood/deck", position: [-6, 0.02, 8], rotation: [-Math.PI / 2, 0, 0], scale: [8, 6] },
  { name: "foliage/grass", position: [7, 0.02, 8], rotation: [-Math.PI / 2, 0, 0], scale: [10, 6] },
];

function World() {
  return <>
    <ambientLight intensity={0.25} />
    <EnvironmentLighting intensity={0.5} skyColor="#cfe0f5" groundColor="#4a4d50" sunDirection={[8, 12, 6]} />
    <directionalLight position={[8, 12, 6]} intensity={1.6} castShadow />
    {WORLD.map((surface) => <mesh key={surface.name} geometry={WORLD_PLANE} position={surface.position} rotation={surface.rotation} scale={[surface.scale[0], surface.scale[1], 1]} receiveShadow>
      {flat
        ? <meshStandardMaterial color={FLAT[findGroup(surface.name)]} roughness={0.8} />
        : <Suspense fallback={<meshStandardMaterial color="#4a4a4a" roughness={1} />}>
            {uvProjection
              ? <MaterialAssetSurface asset={libraryMaterialAsset(surface.name, { basePath: BASE_PATH })} />
              : <TriplanarAssetMaterial asset={libraryMaterialAsset(surface.name, { basePath: BASE_PATH })} />}
          </Suspense>}
    </mesh>)}
  </>;
}

function findGroup(name: string): LibraryGroup {
  return (filterLibraryMaterials("").find((entry) => entry.name === name)?.group ?? "concrete");
}

function Sheet({ entries }: { entries: readonly LibraryMaterial[] }) {
  const cells = useMemo(() => {
    const rows = Math.ceil(entries.length / COLUMNS);
    const top = ((rows - 1) / 2) * SPACING;
    return entries.map((entry, index) => {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      return { entry, position: [(column - (COLUMNS - 1) / 2) * SPACING, top - row * SPACING, 0] as [number, number, number] };
    });
  }, [entries]);
  return <>
    <ambientLight intensity={0.35} />
    <EnvironmentLighting intensity={0.9} skyColor="#dfe7ef" groundColor="#4a4d50" sunDirection={[6, 9, 8]} />
    <directionalLight position={[6, 9, 8]} intensity={2} />
    <directionalLight position={[-7, 4, -6]} intensity={0.55} color="#cfe0ff" />
    {cells.map(({ entry, position }) => <mesh key={entry.name} geometry={compare ? SPHERE_UV : SPHERE} position={position} castShadow>
      {flat
        ? <meshStandardMaterial color={entry.response.color ?? FLAT[entry.group]} roughness={entry.response.roughness ?? 0.85} metalness={entry.response.metalness ?? 0} transparent={(entry.response.transmission ?? 0) > 0} opacity={(entry.response.transmission ?? 0) > 0 ? 0.35 : 1} />
        : <Suspense fallback={<meshStandardMaterial color="#4a4a4a" roughness={1} />}>
            {uvProjection || compare
              ? <MaterialAssetSurface asset={libraryMaterialAsset(entry.name, { basePath: BASE_PATH })} {...(uvProjection ? { repeatMetres: INSPECTION_TILE_METRES } : {})} />
              : <TriplanarAssetMaterial asset={libraryMaterialAsset(entry.name, { basePath: BASE_PATH })} tileMetres={INSPECTION_TILE_METRES} sharpness={SHARPNESS} />}
          </Suspense>}
    </mesh>)}
    {compare ? cells.map(({ entry, position }) => <mesh key={`tri:${entry.name}`} geometry={SPHERE} position={[position[0] + SPACING / 2, position[1], position[2]]}>
      <Suspense fallback={null}>
        <TriplanarAssetMaterial asset={libraryMaterialAsset(entry.name, { basePath: BASE_PATH })} tileMetres={INSPECTION_TILE_METRES} sharpness={SHARPNESS} />
      </Suspense>
    </mesh>) : null}
  </>;
}

function Legend({ entries }: { entries: readonly LibraryMaterial[] }) {
  const groups = Array.from(new Set(entries.map((entry) => entry.group)));
  return <div style={{ pointerEvents: "none", position: "absolute", inset: 0, color: "#f2f3f0", fontFamily: "sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}>
    <div style={{ position: "absolute", top: 14, left: 18, fontSize: 15, fontWeight: 600 }}>
      Material library · {entries.length} ambientCG PBR surfaces · {flat ? "flat colour baseline" : uvProjection ? "UV-mapped" : "triplanar, geometry has no UVs"}
    </div>
    <div style={{ position: "absolute", top: 36, left: 18, fontSize: 11, opacity: 0.85 }}>
      {groups.join(" · ")} · one texture tile per sphere for inspection; each name authors its own world tile size
    </div>
    <div style={{ position: "absolute", bottom: 14, left: 18, fontSize: 11, opacity: 0.85 }}>
      {entries.map((entry) => entry.name).join("  ·  ")}
    </div>
  </div>;
}

const entries = group === null ? filterLibraryMaterials("") : filterLibraryMaterials("", group);
/** `?world=1` swaps the inspection spheres for world surfaces at their authored tile sizes. */
const worldMode = params.get("world") === "1";
export const materialLibraryGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, name: "material-library" },
  renderEntity: () => <group />,
  renderObject: () => <group />,
  loop: { ...demoGame.loop, onTick: () => {} },
  look: "flat",
  lighting: { ambient: { intensity: 0 }, directional: [] },
  backdrop: { background: "#1c1f22" },
  postProcessing: { enabled: true, toneMapping: "agx", exposure: 1, bloom: false, ao: false, grade: false, stylize: false, aa: "msaa" },
  environment: () => (worldMode ? <World /> : <Sheet entries={entries} />),
  GameUI: () => (worldMode ? <div style={{ pointerEvents: "none", position: "absolute", inset: 0, color: "#f2f3f0", fontFamily: "sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
    <div style={{ position: "absolute", top: 14, left: 18, fontSize: 15, fontWeight: 600 }}>
      World surfaces by library name · {flat ? "flat colour baseline" : uvProjection ? "UV-mapped" : "triplanar, no UVs"}
    </div>
    <div style={{ position: "absolute", bottom: 14, left: 18, fontSize: 11, opacity: 0.85 }}>
      road/marked · asphalt/wet · brick/red · stucco/painted · metal/painted · wood/deck · foliage/grass — each at its authored tile metres
    </div>
  </div> : <Legend entries={entries} />),
  capture: {
    views: {
      sheet: { look: "0,0,0", lookFrom: "15,1.2,0" },
      closeup: { look: "0,0,0", lookFrom: "7,1,0" },
      street: { look: "0,3.2,0", lookFrom: "17,4.5,0.32" },
      detail: { look: "-9,0.6,2", lookFrom: "5,1.2,0.1" },
    },
  },
};

/** Contact sheet for the shared material library; `?sheet=flat`, `?projection=uv`, `?group=metal`. */
