import { useMemo } from "react";
import type { PlacementPreview } from "@jgengine/core/world/placementController";
import { quarterTurnsToRotationY } from "@jgengine/core/world/placementController";

export interface PlacementGhostProps {
  preview: PlacementPreview | null;
  height?: number;
  validColor?: string;
  invalidColor?: string;
}

export function PlacementGhost({
  preview,
  height = 1,
  validColor = "#34d399",
  invalidColor = "#f87171",
}: PlacementGhostProps) {
  const footprint = preview?.footprint;
  const size = useMemo<[number, number, number]>(
    () => [footprint?.w ?? 1, height, footprint?.d ?? 1],
    [footprint?.w, footprint?.d, height],
  );
  if (preview === null) return null;
  const color = preview.valid ? validColor : invalidColor;
  return (
    <group
      position={[preview.center[0], preview.y, preview.center[1]]}
      rotation-y={quarterTurnsToRotationY(preview.quarterTurns)}
    >
      <mesh position-y={height / 2}>
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.35}
          depthWrite={false}
          emissive={color}
          emissiveIntensity={0.4}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
        <ringGeometry args={[Math.max(size[0], size[2]) * 0.5, Math.max(size[0], size[2]) * 0.5 + 0.12, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}
