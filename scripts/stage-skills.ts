import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { GAME_SKILLS } from "../packages/jgengine/src/skills";

const PACKAGE_SKILLS: Record<string, readonly string[]> = {
  core: ["jgengine", "game-design", "jgengine-gameplay", "jgengine-combat", "jgengine-world"],
  ws: ["jgengine", "jgengine-multiplayer"],
  sql: ["jgengine", "jgengine-multiplayer"],
  convex: ["jgengine", "jgengine-multiplayer"],
  node: ["jgengine", "jgengine-multiplayer"],
  react: ["jgengine", "jgengine-ui"],
  shell: ["jgengine", "game-design", "level-design", "jgengine-ui", "jgengine-world"],
  assets: ["jgengine", "jgengine-assets"],
  github: ["jgengine"],
  editor: ["jgengine", "level-design", "jgengine-editor"],
  jgengine: GAME_SKILLS,
};

/** Collect relative file paths under `dir` (posix separators). Empty if dir missing. */
function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full).split(sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * Deep-compare two skill trees. Returns human-readable drift lines
 * (`packages/<pkg>/skills/<rel>: ...`).
 */
function compareSkillTrees(pkg: string, stagedDir: string, installedDir: string): string[] {
  const prefix = `packages/${pkg}/skills`;
  const staged = listFiles(stagedDir);
  const installed = listFiles(installedDir);
  const stagedSet = new Set(staged);
  const installedSet = new Set(installed);
  const drift: string[] = [];

  for (const rel of staged) {
    if (!installedSet.has(rel)) {
      drift.push(`${prefix}/${rel}: missing in package skills/ (stale package tree — run bun run stage-skills)`);
      continue;
    }
    const a = readFileSync(join(stagedDir, rel));
    const b = readFileSync(join(installedDir, rel));
    if (!a.equals(b)) {
      drift.push(`${prefix}/${rel}: content differs from .claude/skills (run bun run stage-skills)`);
    }
  }
  for (const rel of installed) {
    if (!stagedSet.has(rel)) {
      drift.push(`${prefix}/${rel}: extra in package skills/ (not produced by stage-skills — remove or re-stage)`);
    }
  }
  return drift;
}

function main(): void {
  const check = process.argv.includes("--check");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const failures: string[] = [];

  for (const [pkg, skills] of Object.entries(PACKAGE_SKILLS)) {
    const packageSkillsDir = join(root, "packages", pkg, "skills");
    const outDir = check ? mkdtempSync(join(tmpdir(), "jg-skills-")) : packageSkillsDir;
    try {
      if (!check) rmSync(outDir, { recursive: true, force: true });
      for (const skill of skills) {
        const source = join(root, ".claude", "skills", skill);
        if (!existsSync(join(source, "SKILL.md"))) {
          failures.push(`${pkg}: missing skill ${skill} (no SKILL.md at .claude/skills/${skill})`);
          continue;
        }
        cpSync(source, join(outDir, skill), { recursive: true });
      }
      if (check) {
        failures.push(...compareSkillTrees(pkg, outDir, packageSkillsDir));
      } else {
        console.log(`OK ${pkg}: ${skills.length} skills -> packages/${pkg}/skills`);
      }
    } finally {
      if (check) rmSync(outDir, { recursive: true, force: true });
    }
  }

  if (failures.length > 0) {
    console.error(`\nstage-skills failed:\n${failures.map((f) => `  ${f}`).join("\n")}\n`);
    process.exit(1);
  }
  if (check) console.log("stage-skills --check: clean — package skills/ match .claude/skills staging");
}

if (import.meta.main) main();
