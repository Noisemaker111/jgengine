import type { ReactNode } from "react";
import { AdditiveBlending } from "three";

/** {@link LightBeam} look. */
export interface LightBeamProps {
  /** Metres it rises from its foot. Default 80, enough to show over a forest from far off. */
  height?: number;
  /** Default 0.25. */
  radius?: number;
  /** Default a pale blue-white. */
  color?: string;
  /** Default 0.35. */
  opacity?: number;
}

/**
 * A glowing column of light rising from where it is placed, for finding something from afar: a fallen body, a supply
 * crate, an objective. Additive and unlit, so it reads by day and glows at night.
 * @capability light-beam a tall glowing column marking a spot so it can be found from far away
 */
export function LightBeam({ height = 80, radius = 0.25, color = "#cfe8ff", opacity = 0.35 }: LightBeamProps): ReactNode {
  return (
    <mesh position={[0, height / 2, 0]}>
      <cylinderGeometry args={[radius, radius, height, 10, 1, true]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
