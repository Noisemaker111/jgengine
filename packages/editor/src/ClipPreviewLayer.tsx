import { Suspense, useEffect, useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";

import { sharedGltfLoader } from "@jgengine/shell/render/modelLoad";
import { cloneModelScene, disposeClonedMaterials } from "@jgengine/shell/render/modelRender";
import { useModelAnimation } from "@jgengine/shell/render/useModelAnimation";

import { previewAnimationConfig, type ClipPreviewSession } from "./shell/clipPreview";
import type { EditorHostApi } from "./session";
import type { EditorUiStore } from "./uiStore";
import { useStoreSelector } from "./useStoreSelector";

/** World-unit height the previewed model is normalized to, so tiny/huge rigs are both framed. */
const PREVIEW_TARGET_HEIGHT = 2;

/**
 * Viewport layer that renders the active clip-preview asset playing the selected clip, mounted by
 * `EditorApp` inside the editor's R3F scene + GameContext. Reuses the shell's shared GLTF loader,
 * scene clone, and `useModelAnimation` mixer — the same driver `EntityModel` runs at play time — so
 * the preview IS the runtime playback. Reads the live session from the editor UI store and publishes
 * the selected clip's measured duration back so the dock scrubber can normalize.
 *
 * @internal — not a game-author entry point.
 */
export function ClipPreviewLayer({ api, ui }: { api: EditorHostApi; ui: EditorUiStore }) {
  const session = useStoreSelector(ui, (state) => state.clipPreview);
  if (session === null) return null;
  return (
    <Suspense fallback={null}>
      <ClipPreviewModel key={session.source.assetId} session={session} api={api} ui={ui} />
    </Suspense>
  );
}

function ClipPreviewModel({
  session,
  api,
  ui,
}: {
  session: ClipPreviewSession;
  api: EditorHostApi;
  ui: EditorUiStore;
}) {
  const { source, driver } = session;
  const gltf = useLoader(sharedGltfLoader, source.url);
  const scene = useMemo(() => cloneModelScene(gltf.scene), [gltf]);
  useEffect(() => () => disposeClonedMaterials(scene), [scene]);

  // Normalize height and center/ground so any rig frames nicely at the camera focus point.
  const placement = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const height = box.max.y - box.min.y;
    if (!Number.isFinite(height) || height <= 0) return { scale: 1, minY: 0, centerX: 0, centerZ: 0 };
    return {
      scale: PREVIEW_TARGET_HEIGHT / height,
      minY: box.min.y,
      centerX: (box.min.x + box.max.x) / 2,
      centerZ: (box.min.z + box.max.z) / 2,
    };
  }, [scene]);

  const config = useMemo(() => previewAnimationConfig(driver), [driver]);
  useModelAnimation(scene, gltf.animations, config, undefined);

  // Publish the selected clip's duration once loaded so the dock scrubber can span it (0 = unknown).
  const clipName = driver.clipName;
  useEffect(() => {
    const clip = clipName === null ? undefined : gltf.animations.find((entry) => entry.name === clipName);
    const duration = clip?.duration ?? 0;
    const current = ui.getState().clipPreview;
    if (current !== null && current.source.assetId === source.assetId && current.duration !== duration) {
      ui.patch({ clipPreview: { ...current, duration } });
    }
  }, [gltf, clipName, ui, source.assetId]);

  const focus = api.getFocusTarget() ?? { x: 0, y: 0, z: 0 };
  const s = placement.scale;
  return (
    <group position={[focus.x, focus.y, focus.z]}>
      <primitive object={scene} scale={s} position={[-s * placement.centerX, -s * placement.minY, -s * placement.centerZ]} />
    </group>
  );
}
