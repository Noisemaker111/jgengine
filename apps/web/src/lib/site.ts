export const SITE_URL = "https://jgengine.com";
export const REPO_URL = "https://github.com/Noisemaker111/jgengine";

export const SITE_TITLE = "jgengine — the game engine your coding agent builds on";
export const SITE_DESCRIPTION =
  "An open-source TypeScript game engine on three.js, made for coding agents. Say “Make a game that … with jgengine” to your agent. Ten real games run on it, playable in the browser, and every decision behind it is written down with its numbers.";

/** The only human interface outside this monorepo: say this to any coding agent. */
export const ENTRY_PROMPT = "Make a game that ... with jgengine";

export const PACKAGE_LAYERS: { label: string; note: string; packages: string[] }[] = [
  {
    label: "Bindings & hosts",
    note: "Convex adapters · Node host",
    packages: ["@jgengine/convex", "@jgengine/node"],
  },
  {
    label: "Transport & persistence",
    note: "import core and nothing else",
    packages: ["@jgengine/ws", "@jgengine/sql"],
  },
  {
    label: "Foundation",
    note: "feature folders; model files have zero dependencies, UI and three.js files sit beside them",
    packages: ["@jgengine/core"],
  },
];

export const PACKAGES: { name: string; blurb: string }[] = [
  { name: "@jgengine/core", blurb: "The engine SDK: runtime, state store, scene, combat, HUD, save, loot, quests, economy; model files have zero deps. Game UI is @jgengine/core/ui.view, the canvas and game player @jgengine/core/shell/*." },
  { name: "@jgengine/ws", blurb: "Browser-safe WebSocket client backend: protocol codec, createWsBackend." },
  { name: "@jgengine/node", blurb: "Standalone authoritative host: tick loop, snapshots, save cadence, WS server." },
  { name: "@jgengine/sql", blurb: "HostPersistence on Postgres through a structural pool interface." },
  { name: "@jgengine/convex", blurb: "Convex adapters: game transport, presence transport." },
  { name: "@jgengine/assets", blurb: "License-verified index of CC0 3D models — typed index + pull CLI." },
];
