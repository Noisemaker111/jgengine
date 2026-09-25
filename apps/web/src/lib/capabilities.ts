import { parseCapabilityIndex, type Capability } from "./capabilityIndex";

const SOURCES = import.meta.glob("../../../../.claude/skills/*/capabilities.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const skillOf = (path: string) => /skills\/([^/]+)\/capabilities\.md$/.exec(path)?.[1] ?? "unknown";

/** Skill ids in reading order, each with a human label. */
export const SKILL_DOMAINS: readonly { id: string; label: string; blurb: string }[] = [
  { id: "jgengine", label: "Foundation", blurb: "Game definition, runtime, stores, hosting." },
  { id: "jgengine-world", label: "World", blurb: "Terrain, cities, vehicles, AI, physics, cameras." },
  { id: "jgengine-gameplay", label: "Gameplay", blurb: "Items, loot, quests, economy, progression." },
  { id: "jgengine-combat", label: "Combat", blurb: "Abilities, weapons, damage, encounters." },
  { id: "jgengine-ui", label: "UI & HUD", blurb: "Drop-in HUD blocks, menus, minimaps, dialogs." },
  { id: "jgengine-multiplayer", label: "Multiplayer", blurb: "Authoritative hosts, chat, persistence." },
  { id: "jgengine-editor", label: "Editor", blurb: "Scene documents, streaming, bakes." },
  { id: "jgengine-assets", label: "Assets", blurb: "CC0 model index, credits." },
];

const skillRank = (skill: string) => {
  const rank = SKILL_DOMAINS.findIndex((domain) => domain.id === skill);
  return rank === -1 ? SKILL_DOMAINS.length : rank;
};

/** Every intent row across the shipped skills' generated capability indexes, in skill reading order. */
export const CAPABILITIES: readonly Capability[] = Object.entries(SOURCES)
  .flatMap(([path, markdown]) => parseCapabilityIndex(markdown, skillOf(path)))
  .sort((a, b) => skillRank(a.skill) - skillRank(b.skill));

const BY_REF = new Map(CAPABILITIES.map((row) => [`${row.skill}/${row.key}`, row]));

/** Looks up a `skill/intent-key` reference; undefined only if the index drifted (the test catches that). */
export function capability(ref: string): Capability | undefined {
  return BY_REF.get(ref);
}

export function domainLabel(skill: string): string {
  return SKILL_DOMAINS.find((domain) => domain.id === skill)?.label ?? skill;
}
