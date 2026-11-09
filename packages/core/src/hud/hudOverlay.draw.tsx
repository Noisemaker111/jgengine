// @skill jgengine-ui
import { Html } from "@react-three/drei";
import type { ReactNode } from "react";
import type * as THREE from "three";

import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";

function pinOverlayToViewport(
  _el: THREE.Object3D,
  _camera: THREE.Camera,
  size: { width: number; height: number },
): [number, number] {
  return [size.width / 2, size.height / 2];
}

/**
 * Fullscreen DOM overlay over the 3D canvas. drei's `<Html fullscreen>` while r3f still owns the
 * canvas (it portals out of the reconciler); a plain absolutely-positioned div once the engine
 * loop renders children into the shell's positioned wrapper. Samples are CSS px relative to the
 * canvas top-left either way.
 */
export function HudOverlay({ zIndex, children }: { zIndex: number; children: ReactNode }) {
  const host = useEngineHost();
  if (host.r3f) {
    return (
      <Html fullscreen calculatePosition={pinOverlayToViewport} zIndexRange={[zIndex, 0]} style={{ pointerEvents: "none" }}>
        {children}
      </Html>
    );
  }
  return (
    <div style={{ position: "absolute", inset: 0, zIndex, pointerEvents: "none" }}>{children}</div>
  );
}
