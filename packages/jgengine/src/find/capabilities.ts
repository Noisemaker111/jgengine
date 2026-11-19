import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { findUp } from "../pkg";
import { RECIPES } from "../recipes";
import { queryTokens, rowWords, tokenHits } from "./words";

export interface CapabilityEntry {
  skill: string;
  slug: string;
  description: string;
  imports: string[];
  symbols: string[];
}

export function parseCapabilities(markdown: string, skill: string): CapabilityEntry[] {
  const entries: CapabilityEntry[] = [];
  for (const raw of markdown.split("\n")) {
    const compact = /^- \*\*([^\s*]+)\*\* — (.+)$/.exec(raw.trimEnd());
    if (compact === null) continue;
    const slug = compact[1]!;
    const rest = compact[2]!;
    const splitAt = rest.indexOf(" · `import ");
    const description = (splitAt === -1 ? rest : rest.slice(0, splitAt)).trim();
    const tail = splitAt === -1 ? "" : rest.slice(splitAt + 3);
    const imports: string[] = [];
    const symbols: string[] = [];
    for (const match of tail.matchAll(/`(import \{([^}]+)\} from "[^"]+")`/g)) {
      imports.push(match[1]!);
      for (const name of match[2]!.split(",")) {
        const trimmed = name.trim();
        if (trimmed !== "") symbols.push(trimmed);
      }
    }
    if (imports.length > 0 || symbols.length > 0) entries.push({ skill, slug, description, imports, symbols });
  }
  if (entries.length > 0) return entries;

  const blocks = markdown.split(/\n## /).slice(1);
  for (const block of blocks) {
    const newline = block.indexOf("\n");
    const heading = (newline === -1 ? block : block.slice(0, newline)).trim();
    const dash = heading.indexOf(" — ");
    if (dash === -1) continue;
    const slug = heading.slice(0, dash).trim();
    const description = heading.slice(dash + 3).trim();
    const imports: string[] = [];
    const symbols: string[] = [];
    const body = newline === -1 ? "" : block.slice(newline + 1);
    for (const line of body.split("\n")) {
      if (!line.startsWith("- ")) continue;
      const ticks = [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]!);
      if (ticks.length === 0) continue;
      symbols.push(ticks[0]!);
      const importTick = ticks.find((tick) => tick.startsWith("import "));
      if (importTick !== undefined) imports.push(importTick);
    }
    entries.push({ skill, slug, description, imports, symbols });
  }
  return entries;
}

interface IndexedRow {
  entry: CapabilityEntry;
  raw: string;
  words: Set<string>;
  nameWords: Set<string>;
}

function indexRow(entry: CapabilityEntry): IndexedRow {
  const name = `${entry.slug} ${entry.symbols.join(" ")}`;
  const raw = `${name} ${entry.description} ${entry.imports.join(" ")}`;
  return { entry, raw: raw.toLowerCase(), words: rowWords(raw), nameWords: rowWords(name) };
}

export interface FindResult {
  matches: CapabilityEntry[];
  partial: boolean;
}

export function findCapabilities(entries: readonly CapabilityEntry[], query: string): FindResult {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return { matches: [], partial: false };
  const joined = tokens.length > 1 ? tokens.join("") : null;
  const scored: { entry: CapabilityEntry; hits: number; score: number }[] = [];
  for (const entry of entries) {
    const row = indexRow(entry);
    const hitTokens = tokens.filter((token) => tokenHits(token, row.words, row.raw));
    const joinedHit = joined !== null && tokenHits(joined, row.words, row.raw);
    const hits = joinedHit ? tokens.length : hitTokens.length;
    if (hits === 0) continue;
    const nameHits = joinedHit && tokenHits(joined, row.nameWords, row.raw)
      ? tokens.length
      : hitTokens.filter((token) => tokenHits(token, row.nameWords, row.raw)).length;
    scored.push({ entry, hits, score: nameHits });
  }
  const full = scored.filter((row) => row.hits === tokens.length);
  const partial = full.length === 0 && tokens.length > 1;
  const best = partial ? Math.max(0, ...scored.map((row) => row.hits)) : tokens.length;
  const kept = partial ? scored.filter((row) => row.hits === best) : full;
  kept.sort(
    (a, b) =>
      b.score - a.score ||
      a.entry.skill.localeCompare(b.entry.skill) ||
      a.entry.slug.localeCompare(b.entry.slug),
  );
  return { matches: kept.map((row) => row.entry), partial: partial && kept.length > 0 };
}

export function searchCapabilities(entries: readonly CapabilityEntry[], query: string): CapabilityEntry[] {
  const result = findCapabilities(entries, query);
  return result.partial ? [] : result.matches;
}

export const MAX_RESULTS = 40;

export function renderFindResults(matches: readonly CapabilityEntry[], query: string, partial = false, limit = MAX_RESULTS): string {
  if (matches.length === 0) {
    return [
      `jgengine find "${query}" — no shipped capability matched.`,
      "",
      "Try a broader term (an intent, not a symbol): windows, inventory, minimap, damage, camera, save.",
      "Browse everything: npx jgengine skills --all  (installs the full domain capability indexes).",
    ].join("\n");
  }
  const shown = matches.slice(0, limit);
  const lines: string[] = [
    partial
      ? `jgengine find "${query}" — nothing matched every word; ${matches.length} closest ${matches.length === 1 ? "capability matches" : "capabilities match"} some of them:`
      : `jgengine find "${query}" — ${matches.length} shipped ${matches.length === 1 ? "capability" : "capabilities"} match${matches.length === 1 ? "es" : ""} (reach for these before hand-rolling):`,
    "",
  ];
  for (const entry of shown) {
    lines.push(`[${entry.skill}] ${entry.slug} — ${entry.description}`);
    for (const imp of entry.imports.length > 0 ? entry.imports : ["(see the skill for the import)"]) {
      lines.push(`  ${imp}`);
    }
    lines.push("");
  }
  if (matches.length > shown.length) {
    lines.push(`… ${matches.length - shown.length} more — narrow the intent to see them.`);
    lines.push("");
  }
  lines.push("Signatures: node_modules/@jgengine/<pkg>/dist/*.d.ts · wired examples: npx jgengine recipe");
  return lines.join("\n");
}

export function renderFindJsonResults(matches: readonly CapabilityEntry[], query: string, partial = false, limit = MAX_RESULTS): string {
  return JSON.stringify({ query, total: matches.length, partial, truncated: matches.length > limit, matches: matches.slice(0, limit) });
}

export function resolveSkillsDir(fromDir: string = dirname(fileURLToPath(import.meta.url))): string | null {
  const packageRoot = findUp(fromDir, (dir) => existsSync(join(dir, "skills")) && existsSync(join(dir, "package.json")));
  if (packageRoot === null) return null;
  const skills = join(packageRoot, "skills");
  return existsSync(skills) ? skills : null;
}

export function loadCapabilityIndex(skillsDir: string): CapabilityEntry[] {
  const entries: CapabilityEntry[] = [];
  let domains: string[];
  try {
    domains = readdirSync(skillsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name).sort();
  } catch {
    return entries;
  }
  for (const domain of domains) {
    const file = join(skillsDir, domain, "capabilities.md");
    if (!existsSync(file)) continue;
    entries.push(...parseCapabilities(readFileSync(file, "utf8"), domain));
  }
  return entries;
}

export function loadAllCapabilities(checkout: string | null): CapabilityEntry[] {
  const repoSkills = checkout === null ? null : join(checkout, ".claude", "skills");
  const skillsDir = resolveSkillsDir() ?? (repoSkills !== null && existsSync(repoSkills) ? repoSkills : null);
  return skillsDir === null ? [] : [...loadCapabilityIndex(skillsDir), ...loadSkillRecipes(skillsDir), ...recipeCapabilities()];
}

export function recipeCapabilities(): CapabilityEntry[] {
  return RECIPES.map((recipe) => ({
    skill: "recipe",
    slug: recipe.name,
    description: recipe.description,
    imports: [`npx jgengine recipe ${recipe.name}`],
    symbols: [],
  }));
}

export function loadSkillRecipes(skillsDir: string): CapabilityEntry[] {
  const entries: CapabilityEntry[] = [];
  let domains: string[];
  try {
    domains = readdirSync(skillsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name).sort();
  } catch {
    return entries;
  }
  for (const domain of domains) {
    const dir = join(skillsDir, domain, "recipes");
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".md")).sort()) {
      const text = readFileSync(join(dir, file), "utf8");
      const title = /^#\s+(.+)$/m.exec(text)?.[1]?.replace(/^Recipe\s*[—-]\s*/i, "").trim() ?? file;
      const wires = /\*\*What this wires:\*\*\s*(.+)$/m.exec(text)?.[1]?.trim();
      entries.push({
        skill: domain,
        slug: `recipe/${file.replace(/\.md$/, "")}`,
        description: wires === undefined ? title : `${title} — ${wires}`,
        imports: [`read .claude/skills/${domain}/recipes/${file}`],
        symbols: [],
      });
    }
  }
  return entries;
}
