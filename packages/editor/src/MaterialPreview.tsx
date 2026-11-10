/** @jsxImportSource @jgengine/core/ui/jsx */
import { Component, useEffect, useMemo, useState, type ReactNode } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineCanvas } from "@jgengine/core/frame/engineCanvas.draw";
import { EngineDrawMount, SceneObjectGroup } from "@jgengine/core/frame/useEngineDraw.draw";
import { useEngineRendererFactory } from "@jgengine/core/webgpu/engineRenderer.draw";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import {
  inspectModelMaterialSlots,
  materialAssetMaterial,
  type MaterialAssetLease,
  type ModelMaterialSlotInfo,
} from "@jgengine/core/material/materialAsset.draw";
import { loadGltf } from "@jgengine/core/model/entityModelDraw.draw";
import { EntityModel } from "@jgengine/core/model/SceneModels.draw";
import { DEFAULT_SUN_ELEVATION_DEG, sunDirectionFromBearing } from "@jgengine/core/sky/daylightCycle";
import type { MaterialAsset } from "@jgengine/core/material/materialAsset";
import type { EditorEnvironment } from "@jgengine/core/editor/types";
import { EnvironmentLighting } from "@jgengine/core/lighting/EnvironmentLighting.draw";
import { CameraPoseDraw, StageDraw, type StageSpec } from "@jgengine/core/stage/stageDraw.draw";
import { INPUT_CLS } from "./shell/theme";

/** Reports the model's material slots once its GLTF resolves — the old SlotProbe's useLoader replaced by the shared cache. */
function slotProbeDraw(url: string, onSlots: ((slots: ModelMaterialSlotInfo[]) => void) | undefined): EngineDraw {
  let cancelled = false;
  return {
    mount() {
      void loadGltf(url)
        .then((gltf) => {
          if (!cancelled) onSlots?.(inspectModelMaterialSlots(gltf.scene));
        })
        .catch(() => {});
    },
    dispose() {
      cancelled = true;
    },
  };
}

/** Sphere (or flat card for hair/fabric) swatch wearing the asset's physical material — replaces `<MaterialAssetSurface>`. */
function assetSwatchDraw(asset: MaterialAsset, flat: boolean, orientationDeg: number): EngineDraw {
  let mesh: THREE.Mesh | null = null;
  let lease: MaterialAssetLease | null = null;
  return {
    mount(state: EngineFrameState) {
      const geometry = flat
        ? new THREE.PlaneGeometry(2.1, 1.7, 24, 20)
        : new THREE.SphereGeometry(0.8, 64, 32);
      const next = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
      next.rotation.z = (orientationDeg * Math.PI) / 180;
      next.castShadow = true;
      next.receiveShadow = true;
      mesh = next;
      state.scene.add(next);
      void materialAssetMaterial(asset, {}, state.gl)
        .then((loaded) => {
          if (mesh === null) {
            loaded.dispose();
            return;
          }
          lease = loaded;
          next.material = loaded.material;
        })
        .catch((error: unknown) => {
          if (typeof console !== "undefined") console.warn(`[jgengine] material preview "${asset.id}" failed to build.`, error);
        });
    },
    dispose(state: EngineFrameState) {
      if (mesh !== null) {
        state.scene.remove(mesh);
        mesh.geometry.dispose();
        mesh = null;
      }
      lease?.dispose();
      lease = null;
    },
  };
}

function PreviewReady({ onError }: { onError?: ((message: string | null) => void) | undefined }) {
  useEffect(() => { onError?.(null); }, [onError]);
  return null;
}

class PreviewBoundary extends Component<{ children: ReactNode; onError?: ((message: string | null) => void) | undefined }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(error: unknown) { this.props.onError?.(error instanceof Error ? error.message : String(error)); }
  override render() { return this.state.failed ? null : this.props.children; }
}

/**
 * Material preview lighting uses an isolated renderer; document settings never modify the game.
 * @internal Mounted by the material workspace.
 */
export function MaterialPreview({ asset, mode, environment, model, onSlots, onError }: { asset?: MaterialAsset | undefined; mode: "neutral" | "game"; environment?: EditorEnvironment | undefined; model?: ModelConfig | undefined; onSlots?: (slots: ModelMaterialSlotInfo[]) => void; onError?: (message: string | null) => void }) {
  const rendererFactory = useEngineRendererFactory("webgl");
  const [view, setView] = useState<"front" | "grazing" | "back">("front");
  const [orientation, setOrientation] = useState(0);
  const game = mode === "game";
  const sky = game ? environment?.zenithColor ?? "#87b5e0" : "#eeeeee";
  const ground = game ? environment?.horizonColor ?? "#3d4a38" : "#666666";
  const sceneLight = sunDirectionFromBearing(environment?.sunAzimuth ?? 0, environment?.sunElevation ?? DEFAULT_SUN_ELEVATION_DEG).map((axis) => axis * 5) as [number, number, number];
  const light: [number, number, number] = game ? sceneLight : view === "back" ? [0, 1, -4] : view === "grazing" ? [4, 0.5, 0.2] : [2, 3, 4];
  const flat = asset?.family === "hair" || asset?.family === "fabric";
  const stage = useMemo<StageSpec>(
    () => ({
      background: "#24272c",
      lights: [
        { kind: "ambient", intensity: game ? environment?.ambientIntensity ?? 0.2 : 0.12 },
        {
          kind: "directional",
          position: light,
          intensity: game ? environment?.sunIntensity ?? 3 : 3,
          castShadow: true,
          shadowBias: -0.0004,
          shadowNormalBias: 0.02,
        },
      ],
      ground: { size: 7, color: "#393b3f", roughness: 0.95, y: -0.95 },
    }),
    [game, environment?.ambientIntensity, environment?.sunIntensity, light],
  );
  const swatch = useMemo(
    () => (asset === undefined ? null : assetSwatchDraw(asset, flat, orientation)),
    [asset, flat, orientation],
  );
  const probe = useMemo(() => (model === undefined ? null : slotProbeDraw(model.url, onSlots)), [model, onSlots]);
  return <div className="space-y-1">
    <div className="flex flex-wrap items-center gap-1 text-[10px]">
      {!game ? <select aria-label="Material lighting view" value={view} onChange={(event) => setView(event.target.value as typeof view)} className={INPUT_CLS}><option value="front">Front light</option><option value="grazing">Grazing light</option><option value="back">Back light</option></select> : <span>Document sun direction</span>}
      <label>{model ? "Model yaw" : "Surface orientation"}<input aria-label="Preview orientation" style={{ width: 100 }} type="range" min={0} max={360} value={orientation} onChange={(event) => setOrientation(Number(event.target.value))} /></label>
    </div>
    <div style={{ height: 210, position: "relative" }} data-jg-material-preview="">
      {rendererFactory === null ? null : (
        <EngineCanvas
          key={`${view}:${asset?.id ?? model?.url ?? "empty"}`}
          rendererFactory={rendererFactory}
          dpr={1}
          camera={{ fov: 38, near: 0.1, far: 1000 }}
          shadows
        >
          <PreviewBoundary key={JSON.stringify([asset, model])} onError={onError}>
            <StageDraw spec={stage} />
            <CameraPoseDraw spec={{ position: [0, 0.35, 3.6] }} />
            <EnvironmentLighting {...(game && environment?.source !== undefined ? { source: environment.source } : {})} intensity={0.65} skyColor={sky} groundColor={ground} sunDirection={light} />
            {model ? (
              <SceneObjectGroup rotationY={(orientation * Math.PI) / 180} position={[0, -0.85, 0]}>
                {probe === null ? null : <EngineDrawMount create={() => probe} deps={[probe]} />}
                <EntityModel model={model} />
              </SceneObjectGroup>
            ) : swatch === null ? null : (
              <EngineDrawMount create={() => swatch} deps={[swatch]} />
            )}
            <PreviewReady onError={onError} />
          </PreviewBoundary>
        </EngineCanvas>
      )}
    </div>
    <p className="text-[9px] text-neutral-500">{model ? "Selected model displays its saved slot assignments. Choosing another library asset changes controls; assign it to a slot to change this model." : "Parameter sample; imported values require a selected model."} {game ? "Document environment and fixed sun; game lighting may add other lights or motion." : "Neutral front, grazing or back light."} ACES, exposure 1. Geometry, tangents and UVs determine the response.</p>
  </div>;
}
