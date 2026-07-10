import { seededStreams } from "@jgengine/core/random/rng";
import { scatter } from "@jgengine/core/world/scatter";

import type { Vec3 } from "../physics/swing";

export type IsletTier = "low" | "mid" | "high";

export interface Islet {
  id: string;
  position: Vec3;
  radius: number;
  tier: IsletTier;
}

export interface Pylon {
  id: string;
  isletId: string;
  base: Vec3;
  ringY: number;
  height: number;
  standalone: boolean;
}

export type PropKind = "windmill" | "hut" | "banner";

export interface DressingProp {
  id: string;
  kind: PropKind;
  isletId: string;
  position: Vec3;
  rotationY: number;
}

export interface CloudPuff {
  id: string;
  position: Vec3;
  scale: number;
}

export interface Archipelago {
  seed: string;
  islets: readonly Islet[];
  pylons: readonly Pylon[];
  props: readonly DressingProp[];
  clouds: readonly CloudPuff[];
}

export const ISLET_COUNT: number = 18;
export const CLOUD_LAYER_Y = 0;
export const CLOUD_TRIGGER_Y = 6;
const CLOUD_PUFF_COUNT = 70;

function tierOf(y: number): IsletTier {
  if (y < 26) return "low";
  if (y < 46) return "mid";
  return "high";
}

/** Deterministic floating-island chain. `environment()`'s `terrain()` is a single continuous heightfield with one waterline — it cannot represent 18 disconnected landmasses at independent altitudes with void between them, so the whole archipelago is game-owned data rendered by a custom `environment` canvas component (see `src/game/environment/SkyhookEnvironment.tsx`). */
export function generateArchipelago(seed: string): Archipelago {
  const streams = seededStreams(seed);
  const layoutRng = streams("layout");
  const dressingRng = streams("dressing");
  const cloudRng = streams("clouds");

  const islets: Islet[] = [];
  const spiralTurns = 2.35;
  for (let i = 0; i < ISLET_COUNT; i += 1) {
    const t = ISLET_COUNT === 1 ? 0 : i / (ISLET_COUNT - 1);
    const angle = t * spiralTurns * Math.PI * 2;
    const radiusFromCenter = 34 + t * 210;
    const wobble = (layoutRng() - 0.5) * 10;
    const x = Math.cos(angle) * radiusFromCenter + wobble;
    const z = Math.sin(angle) * radiusFromCenter + wobble;
    const heightWave = Math.sin(t * Math.PI * 3.1) * 14;
    const y = 16 + t * 46 + heightWave + (layoutRng() - 0.5) * 6;
    const radius = 7 + layoutRng() * 5;
    islets.push({ id: `islet-${i}`, position: { x, y, z }, radius, tier: tierOf(y) });
  }

  const pylons: Pylon[] = [];
  for (const islet of islets) {
    const height = 10 + layoutRng() * 6;
    pylons.push({
      id: `pylon-${islet.id}`,
      isletId: islet.id,
      base: { ...islet.position },
      ringY: islet.position.y + height,
      height,
      standalone: false,
    });
  }
  for (let i = 0; i < islets.length - 1; i += 1) {
    const a = islets[i]!;
    const b = islets[i + 1]!;
    const mid: Vec3 = {
      x: (a.position.x + b.position.x) / 2,
      y: (a.position.y + b.position.y) / 2 + 6 + layoutRng() * 8,
      z: (a.position.z + b.position.z) / 2,
    };
    const height = 8 + layoutRng() * 5;
    pylons.push({
      id: `pylon-link-${i}`,
      isletId: `link-${i}`,
      base: mid,
      ringY: mid.y + height,
      height,
      standalone: true,
    });
  }

  const props: DressingProp[] = [];
  islets.forEach((islet, i) => {
    const buildingKind: PropKind = i % 2 === 0 ? "windmill" : "hut";
    const buildingAngle = dressingRng() * Math.PI * 2;
    const buildingRadius = islet.radius * 0.45;
    props.push({
      id: `prop-${islet.id}-building`,
      kind: buildingKind,
      isletId: islet.id,
      position: {
        x: islet.position.x + Math.cos(buildingAngle) * buildingRadius,
        y: islet.position.y,
        z: islet.position.z + Math.sin(buildingAngle) * buildingRadius,
      },
      rotationY: dressingRng() * Math.PI * 2,
    });
    const bannerCount = 2 + Math.floor(dressingRng() * 2);
    for (let b = 0; b < bannerCount; b += 1) {
      const angle = (b / bannerCount) * Math.PI * 2 + dressingRng() * 0.6;
      props.push({
        id: `prop-${islet.id}-banner-${b}`,
        kind: "banner",
        isletId: islet.id,
        position: {
          x: islet.position.x + Math.cos(angle) * islet.radius * 0.92,
          y: islet.position.y,
          z: islet.position.z + Math.sin(angle) * islet.radius * 0.92,
        },
        rotationY: angle,
      });
    }
  });

  const bounds = islets.reduce(
    (acc, islet) => ({
      minX: Math.min(acc.minX, islet.position.x - islet.radius),
      maxX: Math.max(acc.maxX, islet.position.x + islet.radius),
      minZ: Math.min(acc.minZ, islet.position.z - islet.radius),
      maxZ: Math.max(acc.maxZ, islet.position.z + islet.radius),
    }),
    { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
  );
  const cloudPoints = scatter({
    area: { minX: bounds.minX - 50, minZ: bounds.minZ - 50, maxX: bounds.maxX + 50, maxZ: bounds.maxZ + 50 },
    count: CLOUD_PUFF_COUNT,
    minDistance: 22,
    seed: `${seed}:clouds`,
  });
  const clouds: CloudPuff[] = cloudPoints.map((p) => ({
    id: `cloud-${p.index}`,
    position: { x: p.x, y: CLOUD_LAYER_Y + (cloudRng() - 0.5) * 4, z: p.z },
    scale: 6 + cloudRng() * 10,
  }));

  return { seed, islets, pylons, props, clouds };
}
