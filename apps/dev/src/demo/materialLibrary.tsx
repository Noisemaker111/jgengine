import { hdriEnvironment, HDRI_LIBRARY, type HdriId } from "@jgengine/assets/catalogs/hdriLibrary";
import { lutGrade, LUT_GRADES, type LutGradeId } from "@jgengine/assets/catalogs/lutGrades";
import { filterLibraryMaterials, libraryMaterialAsset, type LibraryGroup, type LibraryMaterial } from "@jgengine/assets/catalogs/materialLibrary";
import { useMemo } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { PlayableGame } from "@jgengine/shell/registry";
import type { MaterialAsset } from "@jgengine/core/material/materialAsset";
import { EnvironmentLighting } from "@jgengine/core/lighting/EnvironmentLighting.draw";
import { leasedMaterialMeshDraw, materialAssetMaterial } from "@jgengine/core/material/materialAsset.draw";
import { triplanarAssetMaterial } from "@jgengine/core/material/triplanarMaterial.draw";
import { meshDraw, useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { StageDraw } from "@jgengine/core/stage/stageDraw.draw";

import { demoGame } from "./demoGame";
import { MATERIAL_SHEET_FLAT as FLAT } from "./materialLibraryFlat";

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

/** `?hdri=golden-hour` lights the sheet with a shipped HDRI; `?lut=cold-teal` grades it with a shipped colour grade. */
const hdriId = HDRI_LIBRARY.find((entry) => entry.id === params.get("hdri"))?.id as HdriId | undefined; // type-escape: the query value was just matched against the id list
const lutId = LUT_GRADES.find((entry) => entry.id === params.get("lut"))?.id as LutGradeId | undefined; // type-escape: the query value was just matched against the id list

const COLUMNS = 8;
const SPACING = 1.2;
/** One texture tile across the whole sphere, so the sheet shows the scan rather than a smeared average. */
const INSPECTION_TILE_METRES = Number(params.get("tile") ?? "0.9");
/** Blend sharpness override, for judging the three projections independently. */
const SHARPNESS = Number(params.get("sharp") ?? "8");

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

type SheetMode = "flat" | "uv" | "triplanar";

/** One library surface as a draw: flat colour, UV-mapped or world-space triplanar leased material. */
function LibraryCell({ geometry, position, rotation, scale, asset, mode, flatColor, tileMetres, sharpness, castShadow = false, receiveShadow = false }: {
  geometry: THREE.BufferGeometry;
  position: readonly [number, number, number];
  rotation?: readonly [number, number, number] | undefined;
  scale?: readonly [number, number, number] | undefined;
  asset: MaterialAsset;
  mode: SheetMode;
  flatColor?: string | undefined;
  tileMetres?: number | undefined;
  sharpness?: number | undefined;
  castShadow?: boolean | undefined;
  receiveShadow?: boolean | undefined;
}) {
  const draw = useMemo(() => {
    const transform = {
      position,
      ...(rotation === undefined ? {} : { rotation }),
      ...(scale === undefined ? {} : { scale }),
      castShadow,
      receiveShadow,
      disposeGeometry: false,
    };
    if (mode === "flat") {
      return meshDraw({
        ...transform,
        geometry,
        material: new THREE.MeshStandardMaterial({ color: flatColor ?? "#4a4a4a", roughness: 0.85 }),
      });
    }
    const load = mode === "uv"
      ? (renderer: THREE.WebGLRenderer | null) => materialAssetMaterial(asset, tileMetres === undefined ? {} : { repeatMetres: tileMetres }, renderer)
      : () => triplanarAssetMaterial(asset, { ...(tileMetres === undefined ? {} : { tileMetres }), ...(sharpness === undefined ? {} : { sharpness }) });
    return leasedMaterialMeshDraw({
      ...transform,
      geometry,
      load,
      fallback: new THREE.MeshStandardMaterial({ color: "#4a4a4a", roughness: 1 }),
    });
  }, [geometry, position, rotation, scale, asset, mode, flatColor, tileMetres, sharpness, castShadow, receiveShadow]);
  useEngineDraw(() => draw, [draw]);
  return null;
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
  const mode: SheetMode = flat ? "flat" : uvProjection ? "uv" : "triplanar";
  return <>
    <StageDraw spec={{ lights: [
      { kind: "ambient", intensity: 0.25 },
      { kind: "directional", position: [8, 12, 6], intensity: 1.6, castShadow: true },
    ] }} />
    <EnvironmentLighting intensity={0.5} skyColor="#cfe0f5" groundColor="#4a4d50" sunDirection={[8, 12, 6]} />
    {WORLD.map((surface) => (
      <LibraryCell
        key={surface.name}
        geometry={WORLD_PLANE}
        position={surface.position}
        rotation={surface.rotation}
        scale={[surface.scale[0], surface.scale[1], 1]}
        asset={libraryMaterialAsset(surface.name, { basePath: BASE_PATH })}
        mode={mode}
        flatColor={FLAT[findGroup(surface.name)]}
        receiveShadow
      />
    ))}
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
  const mode: SheetMode = flat ? "flat" : uvProjection || compare ? "uv" : "triplanar";
  const triplanarMode: SheetMode = "triplanar";
  return <>
    <StageDraw spec={{ lights: [
      { kind: "ambient", intensity: 0.35 },
      ...(hdriId === undefined ? [
        { kind: "directional" as const, position: [6, 9, 8] as const, intensity: 2 },
        { kind: "directional" as const, position: [-7, 4, -6] as const, intensity: 0.55, color: "#cfe0ff" },
      ] : []),
    ] }} />
    <EnvironmentLighting intensity={0.9} skyColor="#dfe7ef" groundColor="#4a4d50" sunDirection={[6, 9, 8]} source={hdriId === undefined ? undefined : hdriEnvironment(hdriId, { intensity: 1.1 })} />
    {cells.map(({ entry, position }) => (
      <LibraryCell
        key={entry.name}
        geometry={compare ? SPHERE_UV : SPHERE}
        position={position}
        asset={libraryMaterialAsset(entry.name, { basePath: BASE_PATH })}
        mode={mode}
        flatColor={FLAT[entry.group]}
        {...(uvProjection ? { tileMetres: INSPECTION_TILE_METRES } : {})}
        {...(mode === triplanarMode ? { tileMetres: INSPECTION_TILE_METRES, sharpness: SHARPNESS } : {})}
        castShadow
      />
    ))}
    {compare ? cells.map(({ entry, position }) => (
      <LibraryCell
        key={`tri:${entry.name}`}
        geometry={SPHERE}
        position={[position[0] + SPACING / 2, position[1], position[2]]}
        asset={libraryMaterialAsset(entry.name, { basePath: BASE_PATH })}
        mode={triplanarMode}
        tileMetres={INSPECTION_TILE_METRES}
        sharpness={SHARPNESS}
        castShadow
      />
    )) : null}
  </>;
}

function Legend({ entries }: { entries: readonly LibraryMaterial[] }) {
  const groups = Array.from(new Set(entries.map((entry) => entry.group)));
  return <div style={{ pointerEvents: "none", position: "absolute", inset: 0, color: "#f2f3f0", fontFamily: "sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}>
    <div style={{ position: "absolute", top: 14, left: 18, fontSize: 15, fontWeight: 600 }}>
      Material library · {entries.length} ambientCG PBR surfaces · sky {hdriId ?? "none"} · grade {lutId ?? "none"} · {flat ? "flat colour baseline" : uvProjection ? "UV-mapped" : "triplanar, geometry has no UVs"}
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
  scene: {
    renderEntity: () => null,
    renderObject: () => null,
    environment: () => (worldMode ? <World /> : <Sheet entries={entries} />),
  },
  loop: { ...demoGame.loop, onTick: () => {} },
  rendering: {
    look: "flat",
    lighting: { ambient: { intensity: 0 }, directional: [] },
    backdrop: { background: "#1c1f22" },
    postProcessing: { enabled: true, toneMapping: "agx", exposure: 1, bloom: false, ao: false, grade: lutId === undefined ? false : { lut: lutGrade(lutId), lift: [0, 0, 0], gain: [1, 1, 1], gamma: 1, saturation: 1, vignette: 0, grain: 0 }, stylize: false, aa: "msaa" },
  },
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
