import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type { Vector3 } from "three";

import type { EditorHostApi } from "./session";

type OrbitLike = {
  target: Vector3;
  update: () => void;
  object?: { position: Vector3 };
};

/** Smoothly pans the orbit camera to the editor host's focus target when it changes. */
export function EditorCameraDriver({ api }: { api: EditorHostApi }) {
  const controls = useThree((state) => state.controls) as OrbitLike | null;
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    return api.subscribeFocus((target) => {
      if (target === null || controls === null || controls.target === undefined) return;
      const previous = controls.target.clone();
      controls.target.set(target.x, target.y, target.z);
      camera.position.add(controls.target.clone().sub(previous));
      controls.update();
    });
  }, [api, camera, controls]);

  return null;
}
