/** @jsxImportSource @jgengine/core/ui/jsx */
import { memo, useEffect } from "@jgengine/core/ui/jsx";

import { activeCameraControls } from "@jgengine/core/camera/activeCameraControls.draw";
import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";
import { orbitCameraPosition } from "./camera/orbitFraming";
import type { EditorHostApi } from "./session";

/**
 * Drives the editor orbit camera from the host's focus target. When the target carries only a
 * point, the camera pans to keep it centered (the historical behavior). When it also carries
 * placement (`distance`/`pitch`/`yaw`/`height`), the camera is repositioned to that orbit pose —
 * how `camera_goto`/`camera_frame` compose an aerial without the KeyF-buries-in-terrain problem.
 *
 * The orbit controls belong to `GameInspectionCamera`'s draw, which names them the scene's active
 * camera controls; they are read when a focus arrives, so the rig may mount after this driver.
 */
export const EditorCameraDriver = memo(function EditorCameraDriver({ api }: { api: EditorHostApi }) {
  const frame = useEngineHost().frame;

  useEffect(() => {
    return api.subscribeFocus((target) => {
      const controls = activeCameraControls(frame.rootScene ?? frame.scene);
      if (target === null || controls === null) return;
      const camera = frame.camera;
      const hasPlacement =
        target.distance !== undefined ||
        target.pitch !== undefined ||
        target.yaw !== undefined ||
        target.height !== undefined;
      if (hasPlacement) {
        controls.target.set(target.x, target.y, target.z);
        const distance =
          target.distance ?? camera.position.distanceTo(controls.target);
        const pose = orbitCameraPosition({
          target,
          distance,
          pitchDeg: target.pitch ?? 45,
          yawDeg: target.yaw,
          height: target.height,
        });
        camera.position.set(pose.x, pose.y, pose.z);
        controls.update();
        return;
      }
      const previous = controls.target.clone();
      controls.target.set(target.x, target.y, target.z);
      camera.position.add(controls.target.clone().sub(previous));
      controls.update();
    });
  }, [api, frame]);

  return null;
});
