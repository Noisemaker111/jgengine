import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { findUp } from "./pkg";

/**
 * `jgengine find <intent>` — active discovery over the capability indexes that ship inside this CLI's
 * own tarball (`skills/<domain>/capabilities.md`, staged for every domain). An agent mid-build that is
 * about to hand-roll a bag, a window manager, a paperdoll, or a walk-cycle types one line and gets the
 * shipped drop-in and its import back, without loading a skill or opening a doc. The whole point: the
 * engine already ships more than a builder discovers on its own, so make "what's already there for X?"
 * a command, not a decision to go read something.
 */

/** One capability row parsed from a `capabilities.md` — a need mapped to the primitive that already does it. */
export interface CapabilityEntry {
  /** Owning skill/domain, e.g. `jgengine-ui`. */
  skill: string;
  /** The `## <slug>` capability id, e.g. `panel-host`. */
  slug: string;
  /** The one-line "what you need" description after the slug. */
  description: string;
  /** Import statements that provide the primitive (one per exported symbol). */
  imports: string[];
  /** Exported symbol names for the primitive. */
  symbols: string[];
}

/**
 * Parse one domain's `capabilities.md` into rows. The generated format is a `## slug — description`
 * heading followed by `` - `Symbol` (kind) · `import { Symbol } from "@jgengine/pkg"` `` bullets. The
 * slug ends at the FIRST ` — `; the description (which may itself contain ` — `) is the remainder.
 */
export function parseCapabilities(markdown: string, skill: string): CapabilityEntry[] {
  const entries: CapabilityEntry[] = [];
  // Everything before the first "## " is the H1 + generated-comment preamble.
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

/** @internal Lowercased haystack for matching a query against a whole capability row. */
function haystack(entry: CapabilityEntry): string {
  return `${entry.slug} ${entry.description} ${entry.symbols.join(" ")} ${entry.imports.join(" ")}`.toLowerCase();
}

/**
 * Rank capability rows against a free-text intent. A row matches when EVERY whitespace-separated query
 * token appears somewhere in it (slug, description, symbol, or import). Rows whose slug or a symbol
 * carries a token sort first (a direct name hit beats an incidental description mention), then by skill
 * and slug for a stable order.
 */
export function searchCapabilities(entries: readonly CapabilityEntry[], query: string): CapabilityEntry[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const scored: { entry: CapabilityEntry; score: number }[] = [];
  for (const entry of entries) {
    const hay = haystack(entry);
    if (!tokens.every((token) => hay.includes(token))) continue;
    const name = `${entry.slug} ${entry.symbols.join(" ")}`.toLowerCase();
    const score = tokens.reduce((sum, token) => sum + (name.includes(token) ? 1 : 0), 0);
    scored.push({ entry, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.entry.skill.localeCompare(b.entry.skill) ||
      a.entry.slug.localeCompare(b.entry.slug),
  );
  return scored.map((row) => row.entry);
}

const MAX_RESULTS = 40;

/** Render matches as grouped `[skill] slug — description` blocks with the import line(s) beneath. */
export function renderFindResults(matches: readonly CapabilityEntry[], query: string): string {
  if (matches.length === 0) {
    return [
      `jgengine find "${query}" — no shipped capability matched.`,
      "",
      "Try a broader term (an intent, not a symbol): windows, inventory, minimap, damage, camera, save.",
      "Browse everything: npx jgengine skills --all  (installs the full domain capability indexes).",
    ].join("\n");
  }
  const shown = matches.slice(0, MAX_RESULTS);
  const lines: string[] = [
    `jgengine find "${query}" — ${matches.length} shipped ${matches.length === 1 ? "capability" : "capabilities"} match${matches.length === 1 ? "es" : ""} (reach for these before hand-rolling):`,
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
  lines.push("Signatures: the owning skill's api.md · wired example: npx jgengine recipe");
  return lines.join("\n");
}

/**
 * Locate the staged `skills/` directory that ships inside this CLI's tarball. In a published consumer
 * that is `node_modules/jgengine/skills`; in the monorepo it is `packages/jgengine/skills` (populated by
 * `bun run stage-skills`). Resolves by walking up from this module to the `jgengine` package root.
 */
export function resolveSkillsDir(fromDir: string = dirname(fileURLToPath(import.meta.url))): string | null {
  const packageRoot = findUp(fromDir, (dir) => existsSync(join(dir, "skills")) && existsSync(join(dir, "package.json")));
  if (packageRoot === null) return null;
  const skills = join(packageRoot, "skills");
  return existsSync(skills) ? skills : null;
}

/** Read and parse every `<skillsDir>/<domain>/capabilities.md` into a flat capability index. */
export function loadCapabilityIndex(skillsDir: string): CapabilityEntry[] {
  const entries: CapabilityEntry[] = [];
  let domains: string[];
  try {
    domains = readdirSync(skillsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);
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

/** `jgengine find <intent>` command entry. */
export function runFind(argv: string[]): number {
  const query = argv.filter((arg) => !arg.startsWith("-")).join(" ").trim();
  if (query === "" || argv.includes("-h") || argv.includes("--help")) {
    console.log(
      [
        "jgengine find <intent> — search what the engine already ships, by intent.",
        "",
        'examples: npx jgengine find "toggleable window"',
        '          npx jgengine find inventory',
        '          npx jgengine find "character sheet paperdoll"',
        "",
        "Prints the drop-in primitive and its import so you don't hand-roll one that exists.",
      ].join("\n"),
    );
    return query === "" && !argv.includes("-h") && !argv.includes("--help") ? 1 : 0;
  }
  const skillsDir = resolveSkillsDir();
  if (skillsDir === null) {
    console.error(
      "jgengine find: could not locate the staged capability indexes (skills/ inside the jgengine package).\n" +
        "Reinstall the CLI, or browse with: npx jgengine skills --all",
    );
    return 1;
  }
  const index = loadCapabilityIndex(skillsDir);
  const matches = searchCapabilities(index, query);
  console.log(renderFindResults(matches, query));
  return 0;
}
