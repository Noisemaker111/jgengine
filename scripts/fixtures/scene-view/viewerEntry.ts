import { mountSceneView, type SceneView } from "@jgengine/core/sceneView/mount.draw";
import type { SceneViewDocument } from "@jgengine/core/sceneView/sceneView";

import house from "../../../apps/web/src/live/smallScene/house.scene.json";
import { exposeBench } from "./benchPage";

const canvas = document.querySelector("canvas")!;
const view: SceneView = mountSceneView(canvas, house as SceneViewDocument, {
  kinds: { "gable-roof": () => import("../../../apps/web/src/live/smallScene/gableRoof.draw") },
});
exposeBench(view.renderer, view.ready);
