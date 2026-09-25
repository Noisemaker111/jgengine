/**
 * Landing-page examples of a big game broken into existing primitives. Every
 * block is a `skill/intent-key` row from a generated `capabilities.md`;
 * `capabilityIndex.test.ts` fails if one stops existing.
 */
export interface Blueprint {
  /** Completes "Make a game that ___ with jgengine". */
  readonly prompt: string;
  readonly scale: string;
  /** The probe game on /games closest to this pitch (it need not use every block). */
  readonly gameId: string;
  readonly blocks: readonly string[];
}

export const BLUEPRINTS: readonly Blueprint[] = [
  {
    prompt: "is an MMO with raids, quests and talent trees",
    scale: "WoW-scale",
    gameId: "claudecraft",
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
    scale: "Borderlands-scale",
    gameId: "the-robots",
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
    scale: "GTA-scale",
    gameId: "vice-isle",
    blocks: [
      "jgengine-world/street-generator",
      "jgengine-world/city-generator",
      "jgengine-world/vehicle-dynamics",
      "jgengine-world/ai-driver",
      "jgengine-world/population-director",
      "jgengine-world/day-night-cycle",
      "jgengine-editor/world-streaming",
      "jgengine-ui/minimap",
    ],
  },
];
