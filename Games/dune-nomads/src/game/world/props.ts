import { scatter, type ScatterConfig } from "@jgengine/core/world/scatter";

import { CITY, OASES, RUINS, SOUTH_GATE } from "./sites";

export type PropKind = "palm" | "standing-stone" | "bones";

export interface PropInstance {
  id: string;
  kind: PropKind;
  x: number;
  z: number;
  rotationY: number;
  scale: number;
}

function avoidRect(cx: number, cz: number, half: number): { minX: number; minZ: number; maxX: number; maxZ: number } {
  return { minX: cx - half, minZ: cz - half, maxX: cx + half, maxZ: cz + half };
}

function scatterOne(seed: string, config: Omit<ScatterConfig, "seed">): ReturnType<typeof scatter> {
  return scatter({ ...config, seed });
}

export function generateProps(seed: string): readonly PropInstance[] {
  const props: PropInstance[] = [];

  for (const oasis of OASES) {
    const spread = oasis.waterRadius * 5;
    const points = scatterOne(`${seed}-palms-${oasis.id}`, {
      area: { w: spread, d: spread, center: [oasis.x, oasis.z] },
      count: 9 + Math.round(oasis.tentCount * 1.4),
      minDistance: 3,
      avoid: [avoidRect(oasis.x, oasis.z, oasis.waterRadius + 1)],
    });
    for (const point of points) {
      props.push({
        id: `palm-${oasis.id}-${point.index}`,
        kind: "palm",
        x: point.x,
        z: point.z,
        rotationY: ((point.index * 137) % 360) * (Math.PI / 180),
        scale: 0.8 + ((point.index * 53) % 40) / 100,
      });
    }
  }

  for (const ruin of RUINS) {
    const points = scatterOne(`${seed}-stones-${ruin.id}`, {
      area: { w: 26, d: 26, center: [ruin.x, ruin.z] },
      count: ruin.pillarCount,
      minDistance: 4,
    });
    for (const point of points) {
      props.push({
        id: `stone-${ruin.id}-${point.index}`,
        kind: "standing-stone",
        x: point.x,
        z: point.z,
        rotationY: ((point.index * 97) % 360) * (Math.PI / 180),
        scale: 0.9 + ((point.index * 31) % 50) / 100,
      });
    }
  }

  const boneAvoid = [SOUTH_GATE, CITY, ...OASES, ...RUINS].map((site) => avoidRect(site.x, site.z, 90));
  const bones = scatterOne(`${seed}-bones`, {
    area: { w: 2200, d: 2200 },
    count: 26,
    minDistance: 60,
    avoid: boneAvoid,
  });
  for (const point of bones) {
    props.push({
      id: `bones-${point.index}`,
      kind: "bones",
      x: point.x,
      z: point.z,
      rotationY: ((point.index * 211) % 360) * (Math.PI / 180),
      scale: 0.7 + ((point.index * 19) % 60) / 100,
    });
  }

  return props;
}
