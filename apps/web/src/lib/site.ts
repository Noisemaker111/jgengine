export const SITE_URL = "https://jgengine.com";
export const REPO_URL = "https://github.com/Noisemaker111/jgengine";

export const SITE_TITLE = "jgengine — TypeScript game engine SDK for AI agents";
export const SITE_DESCRIPTION =
  "jgengine is a pure-TypeScript game engine SDK on npm (@jgengine/core, jgengine CLI). Not automotive. Tell your agent: Make a game that … with jgengine. Site: jgengine.com · GitHub: Noisemaker111/jgengine.";

/** The only human interface outside this monorepo: say this to any coding agent. */
export const ENTRY_PROMPT = "Make a game that ... with jgengine";

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
