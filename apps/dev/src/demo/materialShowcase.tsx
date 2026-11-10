/** @jsxImportSource @jgengine/core/ui/jsx */
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { useEffect, useMemo } from "@jgengine/core/ui/jsx";
import * as THREE from "three";
import { meshDraw, SceneObjectAttach, SceneObjectGroup, useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import type { EditorMarker } from "@jgengine/core/editor/types";
import type { MaterialAsset } from "@jgengine/core/material/materialAsset";
import { StageDraw } from "@jgengine/core/stage/stageDraw.draw";
import type { HairCardAuthoring } from "@jgengine/core/material/hairCards";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { importEditorDocumentJson } from "@jgengine/core/editor/document";
import { modelWithAuthoredMaterials } from "@jgengine/core/editor/materialAuthoring";
import { EnvironmentLighting } from "@jgengine/core/lighting/EnvironmentLighting.draw";
import { materialAssetSwatchDraw } from "@jgengine/core/material/materialAsset.draw";
import { HairCards } from "@jgengine/core/material/hairCards.draw";
import { IsolatedEntityModel } from "@jgengine/core/model/SceneModels.draw";
import { useLiveEditorDocument } from "@jgengine/core/scene/AuthoredScene.draw";
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

function AssetSwatch({ asset, flat }: { asset: MaterialAsset; flat: boolean }) {
  const draw = useMemo(() => materialAssetSwatchDraw(asset, { flat }), [asset, flat]);
  useEngineDraw(() => draw, [draw]);
  return null;
}

function BaselineSwatch({ flat, color, roughness, metalness }: { flat: boolean; color: string; roughness: number; metalness: number }) {
  const draw = useMemo(() => {
    const geometry = flat
      ? new THREE.PlaneGeometry(1.25, 1.5, 12, 12)
      : new THREE.SphereGeometry(0.65, 48, 32);
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness, side: THREE.DoubleSide });
    return meshDraw({ geometry, material, castShadow: true, receiveShadow: true });
  }, [flat, color, roughness, metalness]);
  useEngineDraw(() => draw, [draw]);
  return null;
}

function MarkerSample({ marker, asset, baseline, angle, authored }: {
  marker: EditorMarker;
  asset: MaterialAsset | undefined;
  baseline: boolean;
  angle: number;
  authored: ReturnType<typeof useLiveEditorDocument>;
}) {
  const meta = marker.meta ?? {};
  const glassBox = useMemo(() => {
    if (marker.id !== "glass") return null;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.2), new THREE.MeshStandardMaterial({ color: "#ed7754", roughness: 0.7 }));
    box.position.set(0, 0, -0.85);
    return box;
  }, [marker.id]);
  useEffect(() => () => {
    if (glassBox === null) return;
    glassBox.geometry.dispose();
    const material = glassBox.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material.dispose();
  }, [glassBox]);
  if (meta["shape"] === "model") {
    const imported: ModelConfig = { url: String(meta["url"]), targetHeight: 1.65, animation: "none" };
    const model = baseline ? imported : modelWithAuthoredMaterials(imported, authored, marker.id)!;
    return (
      <SceneObjectGroup position={[marker.position.x, marker.position.y, marker.position.z]} rotationY={angle}>
        <IsolatedEntityModel model={model} />
      </SceneObjectGroup>
    );
  }
  if (asset === undefined) return null;
  const flat = meta["shape"] === "cloth" || meta["shape"] === "hair";
  const rotationY = marker.id === "metal" ? 0 : angle;
  const rotationZ = marker.id === "metal" ? angle : 0;
  return (
    <SceneObjectGroup position={[marker.position.x, marker.position.y, marker.position.z]} rotation={[0, rotationY, rotationZ]}>
      {meta["shape"] === "hair" && !baseline ? (
        <HairCards cards={meta["cards"] as unknown as HairCardAuthoring} material={asset} />
      ) : baseline ? (
        <BaselineSwatch flat={flat} color={asset.surface.color ?? "#b7b6b2"} roughness={asset.surface.roughness ?? 0.5} metalness={asset.surface.metalness ?? 0} />
      ) : (
        <AssetSwatch asset={asset} flat={flat} />
      )}
      {glassBox === null ? null : <SceneObjectAttach object={glassBox} />}
    </SceneObjectGroup>
  );
}

function Samples() {
  const authored = useLiveEditorDocument(document);
  const materials = useMemo(() => new Map(authored.materialAssets?.map((asset) => [asset.id, asset])), [authored]);
  const direction: [number, number, number] = light === "back" ? [0, 3, -6] : light === "grazing" ? [7, 3, 0.5] : [2, 5, 7];
  const ground = useMemo(() => {
    const geo = new THREE.PlaneGeometry(16, 8);
    geo.rotateX(-Math.PI / 2);
    const groundMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#45484a", roughness: 0.9 }));
    groundMesh.position.y = -0.05;
    groundMesh.receiveShadow = true;
    return groundMesh;
  }, []);
  useEffect(() => () => { ground.geometry.dispose(); (ground.material as THREE.Material).dispose(); }, [ground]);
  return <>
    <EnvironmentLighting intensity={0.8} skyColor="#e8ecf1" groundColor="#636568" sunDirection={direction} />
    <StageDraw spec={{ lights: [{
      kind: "directional",
      position: direction,
      intensity: 4,
      castShadow: true,
      shadowMapSize: [1024, 1024],
      shadowBias: -0.0004,
      shadowNormalBias: 0.02,
    }] }} />
    <SceneObjectAttach object={ground} />
    {authored.markers.map((marker) => (
      <MarkerSample
        key={marker.id}
        marker={marker}
        asset={materials.get(String(marker.meta?.["materialId"]))}
        baseline={baseline}
        angle={angle}
        authored={authored}
      />
    ))}
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
  scene: {
    renderObject: () => null,
    renderEntity: () => null,
    editorLayers: document,
    environment: Samples,
  },
  loop: { ...demoGame.loop, onTick: () => {} },
  rendering: {
    look: "flat",
    lighting: { ambient: { intensity: 0.12 }, directional: [{ intensity: 0, position: [0, 5, 8], color: "#ffffff" }] },
    backdrop: { background: "#25292d" },
    postProcessing: { enabled: true, toneMapping: "aces", exposure: 1, bloom: false, ao: false, grade: false, stylize: false, aa: "msaa" },
  },
  GameUI: Legend,
  capture: { views: { overview: { look: "0,1.5,0", lookFrom: "11,2,0" }, upholstery: { look: "-0.8,0.8,0", lookFrom: "5,2,0" }, fibres: { look: "4,2.4,0", lookFrom: "3,0.4,0" } } },
};
