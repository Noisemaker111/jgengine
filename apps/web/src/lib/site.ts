export const SITE_URL = "https://jgengine.com";
export const REPO_URL = "https://github.com/Noisemaker111/jgengine";
export const INSTALL_CMD = "npx skills add Noisemaker111/jgengine";

export const SKILL_GUIDE: Record<string, string> = {
  "jgengine-newgame":
    "Grab this first for a real build — the master blueprint and phased workflow that takes a named game all the way to done, not a demo slice. This is your plan template.",
  "jgengine-api":
    "Grab this before writing any game config or content — the engine's verbs, primitives, and hooks, plus the definition of done.",
  "jgengine-ui":
    "Grab this for the HUD — the look-and-behave quality bar, so the UI reads as shipped instead of a bordered div.",
  "jgengine-assets":
    "Grab this so nothing looks like a placeholder — license-safe CC0 models and textures wired in from day one.",
  "jgengine-verify":
    "Grab this to check a build works without fighting the browser — assert the scene's content in a test, keep the flaky screenshot as a final glance instead of the loop.",
};

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
