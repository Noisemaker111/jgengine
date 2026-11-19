export interface Blueprint {
  readonly prompt: string;
  readonly scale: string;
  readonly gameId?: string;
  readonly blocks: readonly string[];
}

export const BLUEPRINTS: readonly Blueprint[] = [
  {
    prompt: "is an MMO with raids, quests and talent trees",
    scale: "Role-playing",
    blocks: [
      "jgengine-combat/ability-bar",
      "jgengine-combat/cast-bar",
      "jgengine-combat/encounter-start",
      "jgengine-gameplay/quest-log",
      "jgengine-gameplay/talent-tree-view",
      "jgengine-gameplay/loot-table",
      "jgengine-ui/nameplates",
      "jgengine/multiplayer-ws",
    ],
  },
  {
    prompt: "is a looter-shooter with procedurally built guns",
    scale: "Looter-shooter",
    gameId: "scrap-signal",
    blocks: [
      "jgengine-combat/weapon-runtime",
      "jgengine-combat/weapon-handling",
      "jgengine-combat/magazine",
      "jgengine-combat/regen-shield",
      "jgengine-gameplay/modular-item",
      "jgengine-gameplay/loot-pipeline",
      "jgengine-gameplay/loot-filter",
      "jgengine-ui/damage-direction-overlay",
    ],
  },
  {
    prompt: "is an open-world crime sandbox on an island",
    scale: "Open-world",
    gameId: "harbor-heat",
    blocks: [
      "jgengine-world/street-generator",
      "jgengine-world/city-district",
      "jgengine-world/vehicle-dynamics",
      "jgengine-world/ai-driver",
      "jgengine-world/population-director",
      "jgengine-world/day-night-cycle",
      "jgengine-world/world-streaming",
      "jgengine-ui/minimap",
    ],
  },
];
