/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useRef, useState } from "@jgengine/core/ui/jsx";

import { createGraphPose } from "@jgengine/core/anim/useModelAnimation.draw";
import { EngineDrawMount, SceneObjectGroup } from "@jgengine/core/frame/useEngineDraw.draw";
import {
  modelInstanceDraw,
  type ModelInstanceConfig,
  type ModelInstanceReady,
} from "@jgengine/core/model/modelInstanceDraw.draw";

import { previewAnimationConfig, type ClipPreviewSession } from "./shell/clipPreview";
import type { EditorHostApi } from "./session";
import type { EditorUiStore } from "./uiStore";
import { useStoreSelector } from "./useStoreSelector";

/** World-unit height the previewed model is normalized to, so tiny/huge rigs are both framed. */
const PREVIEW_TARGET_HEIGHT = 2;

/**
 * Viewport layer that renders the active clip-preview asset playing the selected clip, mounted by
 * `EditorApp` inside the editor's engine scene + GameContext. Reuses the shared model instance,
 * bind placement and animation lifecycle. Reads the live session from the editor UI store and publishes
 * the selected clip's measured duration back so the dock scrubber can normalize.
 *
 * @internal — not a game-author entry point.
 */
export function ClipPreviewLayer({ api, ui }: { api: EditorHostApi; ui: EditorUiStore }) {
  const session = useStoreSelector(ui, (state) => state.clipPreview);
  if (session === null) return null;
  return <ClipPreviewModel key={session.source.assetId} session={session} api={api} ui={ui} />;
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
  const graphPose = session.graphPose;
  const posedByGraph = graphPose !== undefined;
  const config = useMemo(() => (posedByGraph ? undefined : previewAnimationConfig(driver)), [driver, posedByGraph]);
  const model = useMemo<ModelInstanceConfig>(
    () => ({ url: source.url, targetHeight: PREVIEW_TARGET_HEIGHT, animation: config }),
    [source.url, config],
  );
  const readyRef = useRef<ModelInstanceReady | null>(null);
  const [readyTick, setReadyTick] = useState(0);
  const draw = useMemo(
    () =>
      modelInstanceDraw(model, {
        onReady: (ready) => {
          readyRef.current = ready;
          setReadyTick((tick) => tick + 1);
          return () => {
            readyRef.current = null;
          };
        },
      }),
    [model],
  );

  const graph = graphPose?.graph;
  const poseClips = graphPose?.clips;
  const rootMotion = graphPose?.rootMotion;
  useEffect(() => {
    const ready = readyRef.current;
    if (ready === null || graph === undefined) return;
    const pose = createGraphPose(ready.content, graph, ready.gltf.animations);
    if (poseClips !== undefined) pose.apply(poseClips, rootMotion === true);
    return () => pose.dispose();
  }, [readyTick, graph, poseClips, rootMotion]);

  useEffect(() => {
    const ready = readyRef.current;
    if (ready === null) return;
    const current = ui.getState().clipPreview;
    if (current === null || current.source.assetId !== source.assetId || current.clipDurations !== undefined) return;
    ui.patch({
      clipPreview: {
        ...current,
        clipDurations: Object.fromEntries(ready.gltf.animations.map((clip) => [clip.name, clip.duration])),
      },
    });
  }, [readyTick, ui, source.assetId]);

  const clipName = driver.clipName;
  useEffect(() => {
    const ready = readyRef.current;
    if (ready === null) return;
    const clip = clipName === null ? undefined : ready.gltf.animations.find((entry) => entry.name === clipName);
    const duration = clip?.duration ?? 0;
    const current = ui.getState().clipPreview;
    if (current !== null && current.source.assetId === source.assetId && current.duration !== duration) {
      ui.patch({ clipPreview: { ...current, duration } });
    }
  }, [readyTick, clipName, ui, source.assetId]);

  const focus = api.getFocusTarget() ?? { x: 0, y: 0, z: 0 };
  return (
    <SceneObjectGroup position={[focus.x, focus.y, focus.z]}>
      <EngineDrawMount create={() => draw} deps={[draw]} />
    </SceneObjectGroup>
  );
}
