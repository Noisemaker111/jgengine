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
  input: "jgengine-gameplay",
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
  tactics: "jgengine-combat",
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
  // leave skill api.md / orphan gate (still published; agents use CLI docs, not api.md).
};

export const PACKAGE_DOMAIN_OVERRIDES: Record<string, Record<string, string>> = {
  shell: { cartridge: MAIN },
};

/** Core modules whose skill differs from their top-level domain (e.g. AOI projection lives with multiplayer docs). */
export const CORE_MODULE_OVERRIDES: Record<string, string> = {
  "runtime/worldProjection": "jgengine-multiplayer",
};

export const SKILL_DIRS = [
  MAIN,
  "jgengine-world",
  "jgengine-combat",
  "jgengine-gameplay",
  "jgengine-multiplayer",
  "jgengine-ui",
  "jgengine-assets",
  "jgengine-editor",
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
  if (!modulePath.includes("/")) {
    if (modulePath === "gameplay") return "jgengine-gameplay";
    if (modulePath === "procedural") return "jgengine-world";
    return CORE_DOMAIN_SKILLS[modulePath] ?? MAIN;
  }
  const skill = CORE_DOMAIN_SKILLS[domain];
  if (skill === undefined) {
    throw new Error(
      `core domain "${domain}" has no skill assignment — add it to CORE_DOMAIN_SKILLS in scripts/skillRouting.ts`,
    );
  }
  return skill;
}
