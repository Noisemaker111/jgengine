import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { GAME_SKILLS } from "../packages/jgengine/src/skills";

const PACKAGE_SKILLS: Record<string, readonly string[]> = {
  // ce-handoff is staged on every package skill tarball so monorepo and packaged
  // agent installs can create/resume session handoffs without a separate install step.
  core: ["jgengine", "game-design", "jgengine-gameplay", "jgengine-combat", "jgengine-world", "ce-handoff"],
  ws: ["jgengine", "jgengine-multiplayer", "ce-handoff"],
  sql: ["jgengine", "jgengine-multiplayer", "ce-handoff"],
  convex: ["jgengine", "jgengine-multiplayer", "ce-handoff"],
  node: ["jgengine", "jgengine-multiplayer", "ce-handoff"],
  react: ["jgengine", "jgengine-ui", "ce-handoff"],
  shell: ["jgengine", "game-design", "level-design", "jgengine-ui", "jgengine-world", "ce-handoff"],
  assets: ["jgengine", "jgengine-assets", "ce-handoff"],
  github: ["jgengine", "ce-handoff"],
  editor: ["jgengine", "level-design", "jgengine-editor", "ce-handoff"],
  jgengine: GAME_SKILLS,
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
