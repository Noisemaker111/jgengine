import { sceneMarkerRadius, sceneMarkerXZ } from "../../editorLayers";
import type { DungeonDef, ZoneId } from "../model";

interface DungeonMeta {
  id: string;
  name: string;
  zone: ZoneId;
  levelRange: readonly [number, number];
  raid?: boolean;
}

const DUNGEON_META: readonly DungeonMeta[] = [
  {
    id: "hollow_crypt",
    name: "The Hollow Crypt",
    zone: "peaks",
    levelRange: [1, 7],
  },
  {
    id: "sunken_bastion",
    name: "The Sunken Bastion",
    zone: "marsh",
    levelRange: [12, 13],
  },
  {
    id: "gravewyrm_sanctum",
    name: "Gravewyrm Sanctum",
    zone: "peaks",
    levelRange: [19, 20],
  },
  {
    id: "drowned_temple",
    name: "The Drowned Temple",
    zone: "marsh",
    levelRange: [16, 18],
  },
  {
    id: "nythraxis_crypt",
    name: "Abandoned Crypt",
    zone: "vale",
    levelRange: [20, 20],
  },
  {
    id: "nythraxis_raid",
    name: "Nythraxis Raid Arena",
    zone: "peaks",
    levelRange: [20, 20],
    raid: true,
  },
];

/** Dungeons — metadata in code, placement (center/radius/entrance/inside) from `dungeon:<id>` markers. */
export const DUNGEONS: readonly DungeonDef[] = DUNGEON_META.map((meta) => {
  const center = sceneMarkerXZ(`dungeon:${meta.id}`);
  return {
    ...meta,
    center,
    radius: sceneMarkerRadius(`dungeon:${meta.id}`),
    entrance: sceneMarkerXZ(`dungeon:${meta.id}:entrance`),
    inside: sceneMarkerXZ(`dungeon:${meta.id}:inside`),
  };
});

export function dungeonById(id: string): DungeonDef | null {
  for (const d of DUNGEONS) {
    if (d.id === id) return d;
  }
  return null;
}
