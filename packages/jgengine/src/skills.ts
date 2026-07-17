import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILLS_SOURCE = "Noisemaker111/jgengine";

export const API_SKILL_DIRS = [
  "jgengine",
  "jgengine-world",
  "jgengine-combat",
  "jgengine-gameplay",
  "jgengine-multiplayer",
  "jgengine-ui",
  "jgengine-assets",
  "jgengine-editor",
] as const;

export const DESIGN_SKILL_DIRS = ["game-design", "level-design"] as const;

export const GAME_SKILLS = [...API_SKILL_DIRS, ...DESIGN_SKILL_DIRS, "jgengine-verify"] as const;

export type SkillsScope = "global" | "project";

/** @internal */
export function parseSkillsArgs(argv: string[]): { scope: SkillsScope } | { error: string } {
  let scope: SkillsScope | null = null;
  for (const arg of argv) {
    if (arg === "-g" || arg === "--global") {
      if (scope === "project") return { error: "use either -g/--global or -p/--project, not both" };
      scope = "global";
      continue;
    }
    if (arg === "-p" || arg === "--project") {
      if (scope === "global") return { error: "use either -g/--global or -p/--project, not both" };
      scope = "project";
      continue;
    }
    if (arg === "-y" || arg === "--yes") continue;
    if (arg === "-h" || arg === "--help") return { error: "help" };
    return { error: `unknown skills option: ${arg}` };
  }
  return { scope: scope ?? "project" };
}

/** @internal */
export function skillsInstallArgs(scope: SkillsScope): string[] {
  const args = ["--yes", "skills", "add", SKILLS_SOURCE, "-y"];
  for (const skill of GAME_SKILLS) {
    args.push("-s", skill);
  }
  args.push("-a", "*");
  if (scope === "global") args.push("-g");
  return args;
}

/** @internal */
export function packagedSkillsDir(): string | null {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");
  return existsSync(join(dir, "jgengine", "SKILL.md")) ? dir : null;
}

/** @internal */
export function installPackagedSkills(packaged: string, scope: SkillsScope, cwd?: string): number {
  const base = scope === "global" ? homedir() : (cwd ?? process.cwd());
  const target = join(base, ".claude", "skills");
  console.log(`installing packaged agent skills into ${target}: ${GAME_SKILLS.join(", ")}…`);
  mkdirSync(target, { recursive: true });
  for (const skill of GAME_SKILLS) {
    const source = join(packaged, skill);
    if (!existsSync(join(source, "SKILL.md"))) continue;
    cpSync(source, join(target, skill), { recursive: true });
  }
  return 0;
}

/** @internal */
export function installSkills(scope: SkillsScope, cwd?: string): number {
  const packaged = packagedSkillsDir();
  if (packaged !== null) return installPackagedSkills(packaged, scope, cwd);
  const where = scope === "global" ? "globally" : "in this project";
  console.log(`installing agent skills ${where} from ${SKILLS_SOURCE}: ${GAME_SKILLS.join(", ")}…`);
  const result = spawnSync("npx", skillsInstallArgs(scope), {
    stdio: "inherit",
    shell: process.platform === "win32",
    cwd,
  });
  return result.status ?? 1;
}

/** @internal */
export function runSkills(argv: string[]): number {
  const parsed = parseSkillsArgs(argv);
  if ("error" in parsed) {
    if (parsed.error === "help") {
      console.log(`usage: jgengine skills (-g|--global | -p|--project)

  -p, --project   install into this project (default)
  -g, --global    install for your user (every project / agent session)

Installs ${GAME_SKILLS.join(", ")} from the copy packaged in this CLI (fallback: ${SKILLS_SOURCE}).

People do not run this. Agents use it; create already installs project skills.
`);
      return 0;
    }
    console.error(`error: ${parsed.error}`);
    console.error("usage: jgengine skills (-g|--global | -p|--project)");
    return 1;
  }

  return installSkills(parsed.scope);
}
