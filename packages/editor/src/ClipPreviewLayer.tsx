import { Suspense, useEffect, useMemo } from "react";
import { useLoader } from "@react-three/fiber";

import { sharedGltfLoader } from "@jgengine/shell/render/modelLoad";
import { createGraphPose } from "@jgengine/shell/render/useModelAnimation";
import { useModelInstance } from "@jgengine/shell/render/useModelInstance";

import { previewAnimationConfig, type ClipPreviewSession } from "./shell/clipPreview";
import type { EditorHostApi } from "./session";
import type { EditorUiStore } from "./uiStore";
import { useStoreSelector } from "./useStoreSelector";

/** World-unit height the previewed model is normalized to, so tiny/huge rigs are both framed. */
const PREVIEW_TARGET_HEIGHT = 2;

/**
 * Viewport layer that renders the active clip-preview asset playing the selected clip, mounted by
 * `EditorApp` inside the editor's R3F scene + GameContext. Reuses the shell's model instance,
 * bind placement and animation lifecycle. Reads the live session from the editor UI store and publishes
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
  const graphPose = session.graphPose;
  const posedByGraph = graphPose !== undefined;
  const config = useMemo(() => (posedByGraph ? undefined : previewAnimationConfig(driver)), [driver, posedByGraph]);
  const { content, scene, scale, position } = useModelInstance({ url: source.url, targetHeight: PREVIEW_TARGET_HEIGHT, animation: config });

  const graph = graphPose?.graph;
  const pose = useMemo(() => (graph === undefined ? null : createGraphPose(content, graph, gltf.animations)), [content, graph, gltf]);
  useEffect(() => () => pose?.dispose(), [pose]);
  const graphClips = graphPose?.clips;
  const rootMotion = graphPose?.rootMotion;
  useEffect(() => {
    if (pose !== null && graphClips !== undefined) pose.apply(graphClips, rootMotion === true);
  }, [pose, graphClips, rootMotion]);

  useEffect(() => {
    const current = ui.getState().clipPreview;
    if (current === null || current.source.assetId !== source.assetId || current.clipDurations !== undefined) return;
    ui.patch({ clipPreview: { ...current, clipDurations: Object.fromEntries(gltf.animations.map((clip) => [clip.name, clip.duration])) } });
  }, [gltf, ui, source.assetId]);

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
  return (
    <group position={[focus.x, focus.y, focus.z]}>
      <primitive object={scene} scale={scale} position={position} />
    </group>
  );
}
