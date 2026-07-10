import { seededStreams } from "@jgengine/core/random/rng";

import { GAME_SEED } from "../tuning";
import { ROUTE, type Route } from "./legs";

export type ObstacleCatalogId = "roof_vent" | "roof_chimney" | "roof_crate" | "roof_watertank";
export type DecorCatalogId = "roof_rail" | "roof_skylight" | "roof_antenna" | "finish_banner";
export type PropCatalogId = ObstacleCatalogId | DecorCatalogId;

export interface PropPlacement {
  id: string;
  catalogId: PropCatalogId;
  position: readonly [number, number, number];
  solid: boolean;
}

const OBSTACLES: readonly ObstacleCatalogId[] = ["roof_vent", "roof_chimney", "roof_crate", "roof_watertank"];
const DECOR_ACCENTS: readonly DecorCatalogId[] = ["roof_skylight", "roof_antenna"];

function pick<T>(items: readonly T[], rng: () => number): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error("pick: empty list");
  return item;
}

function clampOffset(halfExtent: number, raw: number): number {
  const max = Math.max(0, halfExtent - 1);
  return Math.max(-max, Math.min(max, raw));
}

export function generateRoofProps(route: Route = ROUTE, seed: string = GAME_SEED): readonly PropPlacement[] {
  const streams = seededStreams(seed);
  const obstacleRng = streams("props:obstacle");
  const decorRng = streams("props:decor");
  const placements: PropPlacement[] = [];

  for (const leg of route.legs) {
    for (const platform of leg.platforms) {
      const [w, d] = platform.footprint;
      const halfW = (w - 1) / 2;
      const halfD = (d - 1) / 2;
      const [cx, cz] = platform.center;
      const isExchangeZone = platform.blockIndex === 0 || platform.blockIndex === leg.platforms.length - 1;

      if (!isExchangeZone) {
        const obstacle = pick(OBSTACLES, obstacleRng);
        const ox = clampOffset(halfW, Math.round((obstacleRng() - 0.5) * halfW * 2));
        const oz = clampOffset(halfD, Math.round((obstacleRng() - 0.5) * halfD * 2));
        placements.push({
          id: `prop-${platform.id}-obstacle`,
          catalogId: obstacle,
          position: [cx + ox, platform.roofY, cz + oz],
          solid: true,
        });
      }

      const corner = (sx: number, sz: number): readonly [number, number, number] => [
        cx + sx * halfW,
        platform.roofY + 0.05,
        cz + sz * halfD,
      ];
      placements.push({ id: `prop-${platform.id}-rail-a`, catalogId: "roof_rail", position: corner(1, 1), solid: false });
      placements.push({ id: `prop-${platform.id}-rail-b`, catalogId: "roof_rail", position: corner(-1, -1), solid: false });

      const decor = pick(DECOR_ACCENTS, decorRng);
      const dx = (decorRng() - 0.5) * halfW * 1.2;
      const dz = (decorRng() - 0.5) * halfD * 1.2;
      placements.push({
        id: `prop-${platform.id}-decor`,
        catalogId: decor,
        position: [cx + dx, platform.roofY + 0.05, cz + dz],
        solid: false,
      });
    }
  }

  const finishLeg = route.legs[route.legs.length - 1]!;
  const finishPlatform = finishLeg.platforms[finishLeg.platforms.length - 1]!;
  const [fcx, fcz] = finishPlatform.center;
  const fHalfW = (finishPlatform.footprint[0] - 1) / 2;
  placements.push({
    id: "prop-finish-banner-a",
    catalogId: "finish_banner",
    position: [fcx - fHalfW, finishPlatform.roofY + 2.2, fcz],
    solid: false,
  });
  placements.push({
    id: "prop-finish-banner-b",
    catalogId: "finish_banner",
    position: [fcx + fHalfW, finishPlatform.roofY + 2.2, fcz],
    solid: false,
  });

  return placements;
}

export const ROOF_PROPS: readonly PropPlacement[] = generateRoofProps();
