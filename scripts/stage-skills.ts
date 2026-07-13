import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ALL_GAME_SKILLS = [
  "jgengine",
  "jgengine-world",
  "jgengine-procedural",
  "jgengine-combat",
  "jgengine-gameplay",
  "jgengine-multiplayer",
  "jgengine-ui",
  "jgengine-assets",
  "jgengine-verify",
] as const;

const PACKAGE_SKILLS: Record<string, readonly string[]> = {
  core: ["jgengine", "jgengine-gameplay", "jgengine-combat", "jgengine-world", "jgengine-procedural"],
  ws: ["jgengine", "jgengine-multiplayer"],
  sql: ["jgengine", "jgengine-multiplayer"],
  convex: ["jgengine", "jgengine-multiplayer"],
  node: ["jgengine", "jgengine-multiplayer"],
  react: ["jgengine", "jgengine-ui"],
  shell: ["jgengine", "jgengine-ui", "jgengine-world"],
  assets: ["jgengine", "jgengine-assets"],
  github: ["jgengine"],
  editor: ["jgengine", "jgengine-editor"],
  jgengine: ALL_GAME_SKILLS,
};

function main(): void {
  const check = process.argv.includes("--check");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const failures: string[] = [];

  for (const [pkg, skills] of Object.entries(PACKAGE_SKILLS)) {
    const outDir = check ? mkdtempSync(join(tmpdir(), "jg-skills-")) : join(root, "packages", pkg, "skills");
    if (!check) rmSync(outDir, { recursive: true, force: true });
    for (const skill of skills) {
      const source = join(root, ".claude", "skills", skill);
      if (!existsSync(join(source, "SKILL.md"))) {
        failures.push(`${pkg}: missing skill ${skill} (no SKILL.md at .claude/skills/${skill})`);
        continue;
      }
      cpSync(source, join(outDir, skill), { recursive: true });
    }
    if (check) rmSync(outDir, { recursive: true, force: true });
    else console.log(`OK ${pkg}: ${skills.length} skills -> packages/${pkg}/skills`);
  }

  if (failures.length > 0) {
    console.error(`\nstage-skills failed:\n${failures.map((f) => `  ${f}`).join("\n")}\n`);
    process.exit(1);
  }
}

if (import.meta.main) main();
