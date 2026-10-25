import { Html } from "@react-three/drei";
import { useMemo } from "react";
import { ArrowHelper, BoxGeometry, EdgesGeometry, LineBasicMaterial } from "three";

import type { GridFootprint } from "@llmville/game/world/grid";
import { TILE_SIZE } from "@llmville/game/world/grid";
import { cardinalLabel, cardinalToRotationY } from "@llmville/game/world/cardinal";

/**
 * Dev overlay: footprint tile outline + forward arrow (+Z).
 * Enable with ?frames=1 or ?debug=frames in the URL.
 */
export function useShowAssetFrames(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("frames") === "1" || params.get("debug") === "frames";
}

interface AssetFrameGizmoProps {
  footprint?: GridFootprint;
  direction?: 0 | 1 | 2 | 3;
  label?: string;
  showForwardArrow?: boolean;
}

export function AssetFrameGizmo({
  footprint,
  direction = 0,
  label,
  showForwardArrow = true,
}: AssetFrameGizmoProps) {
  const width = (footprint?.width ?? 1) * TILE_SIZE;
  const depth = (footprint?.depth ?? 1) * TILE_SIZE;
  const rotationY = cardinalToRotationY(direction);
  const facing = cardinalLabel(direction);
  const displayLabel = label ? `${label} · ${facing}` : facing;

  const footprintEdges = useMemo(() => {
    const geometry = new BoxGeometry(width, 0.04, depth);
    const edges = new EdgesGeometry(geometry);
    geometry.dispose();
    return edges;
  }, [depth, width]);

  const forwardArrow = useMemo(() => {
    const arrow = new ArrowHelper(undefined, undefined, Math.min(depth * 0.45, 2.5), 0x38bdf8, 0.25, 0.15);
    arrow.position.set(0, 0.06, 0);
    return arrow;
  }, [depth]);

  const edgeMaterial = useMemo(() => new LineBasicMaterial({ color: 0x34d399 }), []);

  return (
    <group rotation={[0, rotationY, 0]}>
      <lineSegments geometry={footprintEdges} material={edgeMaterial} position={[0, 0.02, 0]} />
      {showForwardArrow && <primitive object={forwardArrow} />}
      {label && (
        <Html position={[0, 0.35, 0]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
          <div
            style={{
              background: "rgba(15, 23, 42, 0.85)",
              color: "#e2e8f0",
              fontSize: "10px",
              padding: "2px 6px",
              borderRadius: "4px",
              whiteSpace: "nowrap",
              fontFamily: "monospace",
            }}
          >
            {displayLabel}
          </div>
        </Html>
      )}
    </group>
  );
}
