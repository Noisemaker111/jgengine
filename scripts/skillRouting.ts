import { API_SKILL_DIRS } from "../packages/jgengine/src/skills";

export const MAIN = "jgengine";

export const CORE_DOMAIN_SKILLS: Record<string, string> = {
  ai: "jgengine-world",
  anim: "jgengine-world",
  audio: "jgengine-world",
  behaviour: "jgengine-gameplay",
  board: "jgengine-gameplay",
  cards: "jgengine-gameplay",
  cartridge: MAIN,
  combat: "jgengine-combat",
  commands: MAIN,
  crafting: "jgengine-gameplay",
  data: "jgengine-gameplay",
  devtools: MAIN,
  economy: "jgengine-gameplay",
  editor: "jgengine-editor",
  faction: "jgengine-world",
  format: "jgengine-ui",
  game: "jgengine-gameplay",
  gameplay: "jgengine-gameplay",
  input: "jgengine-world",
  interaction: "jgengine-world",
  inventory: "jgengine-gameplay",
  item: "jgengine-gameplay",
  math: "jgengine-world",
  meta: MAIN,
  movement: "jgengine-world",
  multiplayer: "jgengine-multiplayer",
  nav: "jgengine-world",
  physics: "jgengine-world",
  procedural: "jgengine-world",
  puzzle: "jgengine-gameplay",
  random: "jgengine-gameplay",
  render: "jgengine-ui",
  runtime: MAIN,
  scene: "jgengine-world",
  sensor: "jgengine-world",
  session: "jgengine-gameplay",
  settings: "jgengine-ui",
  stats: "jgengine-combat",
  survival: "jgengine-gameplay",
  tactics: "jgengine-gameplay",
  time: "jgengine-world",
  turn: "jgengine-gameplay",
  ui: "jgengine-ui",
  visibility: "jgengine-world",
  world: "jgengine-world",
};

export const CORE_INTERNAL_DOMAINS = new Set(["assets", "store"]);

export const PACKAGE_SKILLS: Record<string, string> = {
  editor: "jgengine-editor",
  ws: "jgengine-multiplayer",
  sql: "jgengine-multiplayer",
  convex: "jgengine-multiplayer",
  node: "jgengine-multiplayer",
  react: "jgengine-ui",
  shell: "jgengine-ui",
  assets: "jgengine-assets",
  // github + jgengine CLI are tooling, not game-authoring surface — omit so they
  // leave generated game-authoring API docs (still published; agents use CLI help).
};

export const PACKAGE_DOMAIN_OVERRIDES: Record<string, Record<string, string>> = {
  shell: { cartridge: MAIN },
};

/** Full module-path overrides when a file's domain folder would send it to the wrong skill. */
export const CORE_MODULE_OVERRIDES: Record<string, string> = {
  "runtime/worldProjection": "jgengine-multiplayer",
};

/**
 * Curated top-level domain barrels (`@jgengine/core/world`, `gameplay`, …) have no `/` segment,
 * so they would otherwise land on MAIN instead of their discovery domain.
 */
export const CORE_BARREL_SKILLS: Record<string, string> = {
  world: "jgengine-world",
  combat: "jgengine-combat",
  gameplay: "jgengine-gameplay",
  multiplayer: "jgengine-multiplayer",
  ui: "jgengine-ui",
};

export const SKILL_DIRS = API_SKILL_DIRS;

export const INTAKE_ROUTES = {
  design: ["game-design", "level-design"],
  authoring: ["jgengine-editor", "jgengine-world"],
  world: ["jgengine-world"],
  gameplay: ["jgengine-gameplay"],
  combat: ["jgengine-combat"],
  ui: ["jgengine-ui"],
  assets: ["jgengine-assets"],
  multiplayer: ["jgengine-multiplayer"],
} as const;

export const NORMAL_GAME_INTAKE = [
  MAIN,
  "game-design",
  "jgengine-editor",
  "jgengine-world",
  "jgengine-gameplay",
  "jgengine-ui",
  "jgengine-verify",
  "workflow",
] as const;

export function skillForModule(pkg: string, modulePath: string): string | null {
  if (pkg !== "core") {
    const domain = modulePath.split("/")[0];
    const override = domain === undefined ? undefined : PACKAGE_DOMAIN_OVERRIDES[pkg]?.[domain];
    return override ?? PACKAGE_SKILLS[pkg] ?? null;
  }
  const moduleOverride = CORE_MODULE_OVERRIDES[modulePath];
  if (moduleOverride !== undefined) return moduleOverride;
  const domain = modulePath.split("/")[0];
  if (domain === undefined || CORE_INTERNAL_DOMAINS.has(domain)) return null;
  // Top-level barrels (`core/world`, `core/gameplay`, …) share the domain skill so
  // re-exported primitives inherit that skill's examples instead of orphaning under MAIN.
  if (!modulePath.includes("/")) {
    if (domain === "gameplay") return "jgengine-gameplay";
    return CORE_DOMAIN_SKILLS[domain] ?? MAIN;
  }
  // Host-side wire projection lives under runtime/ but is multiplayer surface.
  if (modulePath.startsWith("runtime/worldProjection")) return "jgengine-multiplayer";
  const skill = CORE_DOMAIN_SKILLS[domain];
  if (skill === undefined) {
    throw new Error(
      `core domain "${domain}" has no skill assignment — add it to CORE_DOMAIN_SKILLS in scripts/skillRouting.ts`,
    );
  }
  return skill;
}
