import type { TerraformMode } from "@jgengine/core/world/terraform";

export interface TerraformBrushCursorProps {
  center: readonly [number, number] | null;
  y?: number;
  radius: number;
  mode: TerraformMode;
}

const MODE_COLOR: Record<TerraformMode, string> = {
  raise: "#38bdf8",
  lower: "#fb923c",
  smooth: "#c084fc",
  flatten: "#a3e635",
  noise: "#facc15",
  ramp: "#2dd4bf",
  paint: "#e879f9",
};

export function TerraformBrushCursor({ center, y = 0.05, radius, mode }: TerraformBrushCursorProps) {
  if (center === null) return null;
  const color = MODE_COLOR[mode];
  return (
    <group position={[center[0], y, center[1]]}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[radius - 0.15, radius, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02}>
        <circleGeometry args={[radius, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.14} depthWrite={false} />
      </mesh>
    </group>
  );
}
