import type { StatCatalog } from "@jgengine/core/scene/entityStats";

import type { HeroId } from "../../types";

export interface HeroDef {
  readonly id: HeroId;
  readonly name: string;
  readonly title: string;
  readonly color: string;
  readonly glow: string;
  readonly ability: string;
  readonly abilityHint: string;
  readonly walkSpeed: number;
  readonly stats: StatCatalog;
}

export const HEROES: Record<HeroId, HeroDef> = {
  lumen: {
    id: "lumen",
    name: "Lumen",
    title: "the Beam-Bender",
    color: "#38f0ff",
    glow: "#8bfcff",
    ability: "Plant Prism",
    abilityHint: "Plants a prism that beams light in the way you face — powers receivers.",
    walkSpeed: 6.5,
    stats: { health: { max: 100 } },
  },
  anchor: {
    id: "anchor",
    name: "Anchor",
    title: "the Mass-Shifter",
    color: "#ffb23e",
    glow: "#ffd98a",
    ability: "Drop Weight",
    abilityHint: "Drops a heavy weight that holds down a pressure plate until you re-drop it.",
    walkSpeed: 6.5,
    stats: { health: { max: 100 } },
  },
};

export const HERO_LIST: readonly HeroDef[] = [HEROES.lumen, HEROES.anchor];
