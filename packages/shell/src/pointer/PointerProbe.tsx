import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

import type { PointerService } from "./pointerService";

/** Binds the pointer service to the live camera and scene; `groundHeightAt` lets clicks land on terrain. */
export function PointerProbe({ service, groundHeightAt }: { service: PointerService; groundHeightAt?: (x: number, z: number) => number }) {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);

  useEffect(() => {
    service.bind({ camera, scene, width: size.width, height: size.height, ...(groundHeightAt === undefined ? {} : { groundHeightAt }) });
    return () => {
      service.bind(null);
    };
  }, [service, camera, scene, size.width, size.height, groundHeightAt]);

  useEffect(() => {
    const el = gl.domElement;
    let locked = false;
    const onMove = (event: PointerEvent) => {
      if (locked) return;
      const rect = el.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      service.setCursor(x, y, true);
    };
    const onLeave = () => {
      if (!locked) service.setCursor(0, 0, false);
    };
    const onLockChange = () => {
      locked = document.pointerLockElement === el;
      if (locked) service.setCursor(0, 0, true);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, [gl, service]);

  return null;
}
