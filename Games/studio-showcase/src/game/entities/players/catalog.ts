import type { StatCatalog } from "@jgengine/core/scene/entityStats";

export interface PlayerDef {
  id: string;
  name: string;
  walkSpeed: number;
  stats: StatCatalog;
}

export const player: PlayerDef = {
  id: "player",
  name: "Player",
  walkSpeed: 5.4,
  stats: { health: { max: 100 } },
};

export const players: PlayerDef[] = [player];
