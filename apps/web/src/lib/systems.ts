/**
 * The engine systems the home page lists. `knobs` are real option names a game sets;
 * `ref` is a `skill/intent-key` row from a generated `capabilities.md` (its import line is
 * shown) and `capabilityIndex.test.ts` fails if one stops existing. `home` is the feature
 * folder for systems that have no capability row of their own.
 */
export interface EngineSystem {
  readonly name: string;
  readonly line: string;
  readonly knobs: readonly string[];
  readonly ref?: string;
  readonly home?: string;
}

export const SYSTEMS: readonly EngineSystem[] = [
  {
    name: "Grass",
    line: "GPU blades that fill the view out to the horizon and bend in the wind. Eight looks built in, from mown lawn to marsh reeds.",
    knobs: ["bladeHeight", "stiffness", "windStrength", "season", "dryness"],
    home: "packages/core/src/grass",
  },
  {
    name: "Vehicles",
    line: "Force-based cars where every effect is its own switch: tire grip, load transfer, drag, differential, ABS and more, tuned with physical numbers and retunable mid-drive.",
    knobs: ["grip", "drift", "effects", "abs", "topSpeed"],
    ref: "jgengine-world/vehicle-dynamics",
  },
  {
    name: "Cities",
    line: "Street networks, zoned lots and buildings grown from sliders. The same seed gives the same city in the browser, the editor and the game.",
    knobs: ["gridness", "loopiness", "connectivity", "deadEnds", "elevation"],
    ref: "jgengine-world/street-generator",
  },
  {
    name: "Terrain",
    line: "Sculpt and paint ground in the editor. Roads and rivers flatten, grade and carve the terrain under them.",
    knobs: ["flatten", "grade", "carve", "retaining"],
    ref: "jgengine-world/path-terrain",
  },
  {
    name: "Instancing",
    line: "Thousands of props drawn in one call, bucketed into grid cells that cull together.",
    knobs: ["cellSize"],
    ref: "jgengine-world/instance-cells",
  },
  {
    name: "HUD layout",
    line: "Panels claim a corner and a priority and never overlap. On a phone the lowest priority folds away, then the HUD scales down.",
    knobs: ["anchor", "priority", "minScale", "gap"],
    ref: "jgengine-ui/hud-auto-layout",
  },
  {
    name: "Combat",
    line: "Weapons with cadence and magazines, damage channels against armour traits, abilities with cooldowns and cast bars.",
    knobs: ["channel", "traits", "matchup", "cadence"],
    ref: "jgengine-combat/weapon-runtime",
  },
  {
    name: "Waves",
    line: "A spawn director that spends a budget each wave, escalates over time and reads how hard the player is pressed.",
    knobs: ["maxAlive", "escalationPerSecond", "spawnPointBias"],
    ref: "jgengine-combat/wave-runner",
  },
  {
    name: "Save",
    line: "One versioned save per game with a section per system, named slots, autosave and migrations. Local or cloud.",
    knobs: ["slots", "autosave", "migrate"],
    ref: "jgengine-gameplay/game-save",
  },
  {
    name: "Multiplayer",
    line: "Server-authoritative worlds over WebSocket, client prediction with replay, and lag compensation for hitscan.",
    knobs: ['authority: "server"'],
    ref: "jgengine/multiplayer-ws",
  },
  {
    name: "Sky & weather",
    line: "A physical sky with a day-night cycle, volumetric clouds, wind and rain that leaves the ground wet.",
    knobs: ["timeOfDay", "speed", "gust", "turbulence"],
    ref: "jgengine-world/day-night-sky",
  },
  {
    name: "Navigation & AI",
    line: "Bake a navmesh from the scene, move crowds with avoidance, and drive AI cars along the streets.",
    knobs: ["agentRadius", "areaCosts", "difficulty"],
    ref: "jgengine-world/navmesh-bake",
  },
  {
    name: "Physics",
    line: "Rapier with capsules, CCD and joints behind one backend interface, plus aircraft with lift, drag and stall.",
    knobs: ["gravity", "ccd", "joints"],
    ref: "jgengine-world/rapier-physics-backend",
  },
  {
    name: "Quests, loot, dialogue",
    line: "Quest journals fed by game events, weighted loot tables, branching dialogue, crafting, shops and talent trees.",
    knobs: ["objectives", "weight", "choices"],
    ref: "jgengine-gameplay/quest-log",
  },
  {
    name: "Menus & settings",
    line: "Title, pause, save-select and settings screens with keyboard, gamepad and key rebinding.",
    knobs: ["push", "back", "keybind"],
    ref: "jgengine-ui/menu-router",
  },
];
