import { useMemo } from "react";
import { AxesHelper } from "three";

/**
 * Renders colored axes at the given position for orientation debugging.
 * Red = +X (right), Green = +Y (up), Blue = +Z (front/door — level-design "north").
 *
 * Enable with ?axes=1 or ?debug=axes in the URL.
 * See docs/design/asset-spatial-contract.md for the full spatial contract.
 */
export function SceneAxesHelper({ position = [0, 0, 0], size = 2 }: { position?: [number, number, number]; size?: number }) {
  const axes = useMemo(() => new AxesHelper(size), [size]);
  return <primitive object={axes} position={position} />;
}

export function useShowSceneAxes(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("axes") === "1" || params.get("debug") === "axes";
}
