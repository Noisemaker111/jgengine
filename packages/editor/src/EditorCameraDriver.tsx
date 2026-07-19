import { useThree } from "@react-three/fiber";
import { memo, useEffect } from "react";
import type { Vector3 } from "three";

import { orbitCameraPosition } from "./camera/orbitFraming";
import type { EditorHostApi } from "./session";

type OrbitLike = {
  target: Vector3;
  update: () => void;
  object?: { position: Vector3 };
};

/**
 * Drives the editor orbit camera from the host's focus target. When the target carries only a
 * point, the camera pans to keep it centered (the historical behavior). When it also carries
 * placement (`distance`/`pitch`/`yaw`/`height`), the camera is repositioned to that orbit pose —
 * how `camera_goto`/`camera_frame` compose an aerial without the KeyF-buries-in-terrain problem.
 */
export const EditorCameraDriver = memo(function EditorCameraDriver({ api }: { api: EditorHostApi }) {
  const controls = useThree((state) => state.controls) as OrbitLike | null;
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    return api.subscribeFocus((target) => {
      if (target === null || controls === null || controls.target === undefined) return;
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
  }, [api, camera, controls]);

  return null;
});
