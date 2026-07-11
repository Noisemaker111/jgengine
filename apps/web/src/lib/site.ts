export const SITE_URL = "https://jgengine.com";
export const REPO_URL = "https://github.com/Noisemaker111/jgengine";
export const INSTALL_CMD = "npx jgengine skills";

export const SKILL_GUIDE: Record<string, string> = {
  jgengine: "The intake and router: a short numbered build blueprint, followed by only the engine domains the work needs.",
  "jgengine-foundation": "Project shape, defineGame, GameContext, catalogs, lifecycle, state, and input.",
  "jgengine-world": "World construction, scenes, movement, interaction, cameras, maps, and environments.",
  "jgengine-procedural": "Procedural terrain, water, weather, buildings, vegetation, voxels, and generated worlds.",
  "jgengine-combat": "Combat, abilities, targeting, projectiles, health, loot, gear, and action systems.",
  "jgengine-gameplay": "Quests, economy, crafting, cards, turns, puzzles, objectives, social systems, and progression.",
  "jgengine-multiplayer": "Topology, transports, authoritative hosts, persistence, identity, matchmaking, chat, and sync.",
  "jgengine-ui": "React hooks, HUD composition, responsive controls, accessibility, and UI completion rules.",
  "jgengine-assets": "Asset discovery, CC0 packs, catalogs, model wiring, art direction, audio, and licensing.",
  "jgengine-verify": "Browserless scene assertions first; screenshots remain a final visual check.",
};

export const PACKAGE_LAYERS: { label: string; note: string; packages: string[] }[] = [
  {
    label: "Render shell",
    note: "React + three.js — the only package that renders",
    packages: ["@jgengine/shell"],
  },
  {
    label: "Bindings & hosts",
    note: "React UI · Convex adapters · Node host",
    packages: ["@jgengine/react", "@jgengine/convex", "@jgengine/node"],
  },
  {
    label: "Transport & persistence",
    note: "import core and nothing else",
    packages: ["@jgengine/ws", "@jgengine/sql"],
  },
  {
    label: "Foundation",
    note: "zero dependencies",
    packages: ["@jgengine/core"],
  },
];

export const ASSETS_PACKAGE_NAME = "@jgengine/assets";

export const PACKAGES: { name: string; blurb: string }[] = [
  { name: "@jgengine/core", blurb: "The engine SDK: runtime, state store, scene, combat, loot, quests, economy. Zero deps." },
  { name: "@jgengine/react", blurb: "React UI layer: GameProvider, hooks, headless primitives." },
  { name: "@jgengine/shell", blurb: "R3F canvas, orbit + first-person camera, input, HUD mounting, GameUiPreview." },
  { name: "@jgengine/ws", blurb: "Browser-safe WebSocket client backend: protocol codec, createWsBackend." },
  { name: "@jgengine/node", blurb: "Standalone authoritative host: tick loop, snapshots, save cadence, WS server." },
  { name: "@jgengine/sql", blurb: "HostPersistence on Postgres through a structural pool interface." },
  { name: "@jgengine/convex", blurb: "Convex adapters: game transport, presence transport." },
  { name: "@jgengine/assets", blurb: "License-verified index of CC0 3D models — typed index + pull CLI." },
];
