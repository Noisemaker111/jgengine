import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { Suspense, useMemo } from "react";
import type { HairCardAuthoring } from "@jgengine/core/material/hairCards";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { importEditorDocumentJson } from "@jgengine/core/editor/document";
import { modelWithAuthoredMaterials } from "@jgengine/core/editor/materialAuthoring";
import { EnvironmentLighting } from "@jgengine/shell/render/EnvironmentLighting";
import { MaterialAssetSurface } from "@jgengine/shell/render/materialAsset";
import { HairCards } from "@jgengine/shell/render/HairCards";
import { IsolatedEntityModel } from "@jgengine/shell/render/SceneModels";
import { useLiveEditorDocument } from "@jgengine/shell/scene/AuthoredScene";
import type { PlayableGame } from "@jgengine/shell/registry";
import source from "./materialShowcase.scene.json";
import { demoGame } from "./demoGame";

const catalog = createAssetCatalog();
catalog.register("material-chair", { url: "/models/material-showcase/SheenChair.glb" });
const document = importEditorDocumentJson(JSON.stringify(source));
const parameters = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
const baseline = parameters.get("materialView") === "baseline";
const light = parameters.get("materialLight") ?? "front";
const angle = Number(parameters.get("materialAngle") ?? 0) * Math.PI / 180;

function Samples() {
  const authored = useLiveEditorDocument(document);
  const materials = useMemo(() => new Map(authored.materialAssets?.map((asset) => [asset.id, asset])), [authored]);
  const direction: [number, number, number] = light === "back" ? [0, 3, -6] : light === "grazing" ? [7, 3, 0.5] : [2, 5, 7];
  return <>
    <EnvironmentLighting intensity={0.8} skyColor="#e8ecf1" groundColor="#636568" sunDirection={direction} />
    <directionalLight position={direction} intensity={4} castShadow shadow-bias={-0.0004} shadow-normalBias={0.02} shadow-mapSize={[1024, 1024]} />
    <mesh rotation-x={-Math.PI / 2} position-y={-0.05} receiveShadow><planeGeometry args={[16, 8]} /><meshStandardMaterial color="#45484a" roughness={0.9} /></mesh>
    <Suspense fallback={null}>
      {authored.markers.map((marker) => {
        const meta = marker.meta ?? {};
        const asset = materials.get(String(meta.materialId));
        if (meta.shape === "model") {
          const imported: ModelConfig = { url: String(meta.url), targetHeight: 1.65, animation: "none" };
          const model = baseline ? imported : modelWithAuthoredMaterials(imported, authored, marker.id)!;
          return <group key={marker.id} position={[marker.position.x, marker.position.y, marker.position.z]} rotation-y={angle}><IsolatedEntityModel model={model} /></group>;
        }
        if (!asset) return null;
        return <group key={marker.id} position={[marker.position.x, marker.position.y, marker.position.z]} rotation-y={marker.id === "metal" ? 0 : angle} rotation-z={marker.id === "metal" ? angle : 0}>
          {meta.shape === "hair" && !baseline ? <HairCards cards={meta.cards as unknown as HairCardAuthoring} material={asset} /> : <mesh castShadow receiveShadow>
            {meta.shape === "cloth" || meta.shape === "hair" ? <planeGeometry args={[1.25, 1.5, 12, 12]} /> : <sphereGeometry args={[0.65, 48, 32]} />}
            {baseline ? <meshStandardMaterial color={asset.surface.color ?? "#b7b6b2"} roughness={asset.surface.roughness ?? 0.5} metalness={asset.surface.metalness ?? 0} side={2} /> : <MaterialAssetSurface asset={asset} />}
          </mesh>}
          {marker.id === "glass" ? <mesh position={[0, 0, -0.85]}><boxGeometry args={[0.55, 0.9, 0.2]} /><meshStandardMaterial color="#ed7754" roughness={0.7} /></mesh> : null}
        </group>;
      })}
    </Suspense>
  </>;
}

function Legend() {
  return <div style={{ pointerEvents: "none", position: "absolute", inset: 0, color: "#eef0ed", fontFamily: "sans-serif" }}>
    <div style={{ position: "absolute", top: 16, left: 20, fontSize: 16 }}>Material authoring · {baseline ? "color / roughness baseline" : "physical appearance"} · {light} light · {Math.round(angle * 180 / Math.PI)}°</div>
    <div style={{ position: "absolute", bottom: 16, left: 20, right: 20, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, fontSize: 11 }}>Wool fuzz · Silk weave · Coated brushed metal · Volume glass · Textured stone · Hair cards<br />Left chair: preserved import · Right chair: named upholstery edit · Other imported slots untouched</div>
  </div>;
}

/** Deterministic material proof scene; placements and guide geometry are editor-authored data. */
export const materialShowcaseGame: PlayableGame = {
  ...demoGame,
  game: { ...demoGame.game, assets: catalog },
  renderObject: () => <group />,
  loop: { ...demoGame.loop, onTick: () => {} },
  renderEntity: () => <group />,
  editorLayers: document,
  look: "flat",
  lighting: { ambient: { intensity: 0.12 }, directional: [{ intensity: 0, position: [0, 5, 8], color: "#ffffff" }] },
  backdrop: { background: "#25292d" },
  postProcessing: { enabled: true, toneMapping: "aces", exposure: 1, bloom: false, ao: false, grade: false, stylize: false, aa: "msaa" },
  environment: Samples,
  GameUI: Legend,
  capture: { views: { overview: { look: "0,1.5,0", lookFrom: "11,2,0" }, upholstery: { look: "-0.8,0.8,0", lookFrom: "5,2,0" }, fibres: { look: "4,2.4,0", lookFrom: "3,0.4,0" } } },
};
