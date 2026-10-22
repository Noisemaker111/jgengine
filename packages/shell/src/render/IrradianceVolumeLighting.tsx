import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import {
  PROBE_STRIDE,
  sampleIrradianceVolume,
  selectIrradianceVolume,
  SH_COEFFICIENTS,
  type IrradianceVolume,
} from "@jgengine/core/render/lightProbes";

/** @internal Props for shell {@link IrradianceVolumeLighting}. */
export interface IrradianceVolumeLightingProps {
  /** Baked volumes authored on the scene document; the one covering the camera wins. */
  volumes: readonly IrradianceVolume[];
}

/**
 * Ambient light from an authored irradiance volume: each frame it samples the volume that covers the
 * camera and writes the nine SH coefficients into three's scene light probe. This is what makes an
 * interior read as its own space — a room gets the fill from its own lamps and bounce instead of the
 * sky's hemisphere, and the ambient varies as you walk through it.
 *
 * One light probe serves the whole scene, so a world with several volumes is sampled by camera
 * position; that is exact while the camera is inside a room and approximate at the doorways between
 * them.
 * @internal shell-internal lighting; games author the volume on the scene document.
 */
export function IrradianceVolumeLighting({ volumes }: IrradianceVolumeLightingProps) {
  const probeRef = useRef<THREE.LightProbe>(null);
  const sampled = useMemo(() => new Float32Array(PROBE_STRIDE), []);

  useFrame((state) => {
    const probe = probeRef.current;
    if (probe === null) return;
    const position = state.camera.position;
    const volume = selectIrradianceVolume(volumes, [position.x, position.y, position.z]);
    if (volume === undefined) return;
    if (!sampleIrradianceVolume(volume, [position.x, position.y, position.z], sampled)) return;
    for (let band = 0; band < SH_COEFFICIENTS; band += 1) {
      probe.sh.coefficients[band]!.set(sampled[band * 3]!, sampled[band * 3 + 1]!, sampled[band * 3 + 2]!);
    }
  });

  return <lightProbe ref={probeRef} />;
}

