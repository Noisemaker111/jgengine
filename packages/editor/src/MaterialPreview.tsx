import { Canvas, useLoader } from "@react-three/fiber";
import { Component, Suspense, useEffect, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { inspectModelMaterialSlots, type ModelMaterialSlotInfo } from "@jgengine/shell/render/materialAsset";
import { sharedGltfLoader } from "@jgengine/shell/render/modelLoad";
import { EntityModel } from "@jgengine/shell/render/SceneModels";
import { DEFAULT_SUN_ELEVATION_DEG, sunDirectionFromBearing } from "@jgengine/shell/environment/daylightCycle";
import type { MaterialAsset } from "@jgengine/core/material/materialAsset";
import type { EditorEnvironment } from "@jgengine/core/editor/types";
import { MaterialAssetSurface } from "@jgengine/shell/render/materialAsset";
import { EnvironmentLighting } from "@jgengine/shell/render/EnvironmentLighting";
import { INPUT_CLS } from "./shell/theme";

function SlotProbe({ model, onSlots }: { model: ModelConfig; onSlots?: (slots: ModelMaterialSlotInfo[]) => void }) {
  const gltf = useLoader(sharedGltfLoader, model.url);
  useEffect(() => { onSlots?.(inspectModelMaterialSlots(gltf.scene)); }, [gltf.scene, onSlots]);
  return null;
}

function PreviewReady({ onError }: { onError?: (message: string | null) => void }) {
  useEffect(() => { onError?.(null); }, [onError]);
  return null;
}

class PreviewBoundary extends Component<{ children: ReactNode; onError?: (message: string | null) => void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(error: unknown) { this.props.onError?.(error instanceof Error ? error.message : String(error)); }
  override render() { return this.state.failed ? null : this.props.children; }
}

/**
 * Material preview lighting uses an isolated renderer; document settings never modify the game.
 * @internal Mounted by the material workspace.
 */
export function MaterialPreview({ asset, mode, environment, model, onSlots, onError }: { asset: MaterialAsset; mode: "neutral" | "game"; environment?: EditorEnvironment; model?: ModelConfig; onSlots?: (slots: ModelMaterialSlotInfo[]) => void; onError?: (message: string | null) => void }) {
  const [view, setView] = useState<"front" | "grazing" | "back">("front");
  const [orientation, setOrientation] = useState(0);
  const game = mode === "game";
  const sky = game ? environment?.zenithColor ?? "#87b5e0" : "#eeeeee";
  const ground = game ? environment?.horizonColor ?? "#3d4a38" : "#666666";
  const sceneLight = sunDirectionFromBearing(environment?.sunAzimuth ?? 0, environment?.sunElevation ?? DEFAULT_SUN_ELEVATION_DEG).map((axis) => axis * 5) as [number, number, number];
  const light: [number, number, number] = game ? sceneLight : view === "back" ? [0, 1, -4] : view === "grazing" ? [4, 0.5, 0.2] : [2, 3, 4];
  const flat = asset.family === "hair" || asset.family === "fabric";
  return <div className="space-y-1">
    <div className="flex flex-wrap items-center gap-1 text-[10px]">
      {!game ? <select aria-label="Material lighting view" value={view} onChange={(event) => setView(event.target.value as typeof view)} className={INPUT_CLS}><option value="front">Front light</option><option value="grazing">Grazing light</option><option value="back">Back light</option></select> : <span>Document sun direction</span>}
      <label>{model ? "Model yaw" : "Surface orientation"}<input aria-label="Preview orientation" style={{ width: 100 }} type="range" min={0} max={360} value={orientation} onChange={(event) => setOrientation(Number(event.target.value))} /></label>
    </div>
    <div style={{ height: 210 }} data-jg-material-preview="">
      <Canvas key={`${view}:${asset.id}`} dpr={1} camera={{ position: [0, 0.35, 3.6], fov: 38 }} shadows gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1, outputColorSpace: THREE.SRGBColorSpace }}>
        <color attach="background" args={["#24272c"]} />
        <ambientLight intensity={game ? environment?.ambientIntensity ?? 0.2 : 0.12} />
        <directionalLight position={light} intensity={game ? environment?.sunIntensity ?? 3 : 3} castShadow shadow-bias={-0.0004} shadow-normalBias={0.02} />
        <PreviewBoundary key={JSON.stringify([asset, model])} onError={onError}><Suspense fallback={null}>
          <EnvironmentLighting {...(game && environment?.source !== undefined ? { source: environment.source } : {})} intensity={0.65} skyColor={sky} groundColor={ground} sunDirection={light} />
          {model ? <group rotation-y={orientation * Math.PI / 180} position-y={-0.85}><SlotProbe model={model} onSlots={onSlots} /><EntityModel model={model} /></group> : <mesh rotation={[0, 0, orientation * Math.PI / 180]} castShadow receiveShadow>
            {flat ? <planeGeometry args={[2.1, 1.7, 24, 20]} /> : <sphereGeometry args={[0.8, 64, 32]} />}
            <MaterialAssetSurface asset={asset} />
          </mesh>}
          <mesh position={[0, -0.95, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[7, 7]} /><meshStandardMaterial color="#393b3f" roughness={0.95} /></mesh>
          <PreviewReady onError={onError} />
        </Suspense></PreviewBoundary>
      </Canvas>
    </div>
    <p className="text-[9px] text-neutral-500">{model ? "Selected model displays its saved slot assignments. Choosing another library asset changes controls; assign it to a slot to change this model." : "Parameter sample; imported values require a selected model."} {game ? "Document environment and fixed sun; game lighting may add other lights or motion." : "Neutral front, grazing or back light."} ACES, exposure 1. Geometry, tangents and UVs determine the response.</p>
  </div>;
}
