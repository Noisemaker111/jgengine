import { spawnSync } from "node:child_process";

export const SKILLS_SOURCE = "Noisemaker111/jgengine";

export const GAME_SKILLS = ["jgengine-api", "jgengine-newgame", "jgengine-verify"] as const;

export type SkillsScope = "global" | "project";

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

export function skillsInstallArgs(scope: SkillsScope): string[] {
  const args = ["--yes", "skills", "add", SKILLS_SOURCE, "-y"];
  for (const skill of GAME_SKILLS) {
    args.push("-s", skill);
  }
  args.push("-a", "*");
  if (scope === "global") args.push("-g");
  return args;
}

export function installSkills(scope: SkillsScope, cwd?: string): number {
  const where = scope === "global" ? "globally" : "in this project";
  console.log(`installing agent skills ${where}: ${GAME_SKILLS.join(", ")}…`);
  const result = spawnSync("npx", skillsInstallArgs(scope), {
    stdio: "inherit",
    shell: process.platform === "win32",
    cwd,
  });
  return result.status ?? 1;
}

export function runSkills(argv: string[]): number {
  const parsed = parseSkillsArgs(argv);
  if ("error" in parsed) {
    if (parsed.error === "help") {
      console.log(`usage: jgengine skills (-g|--global | -p|--project)

  -p, --project   install into this project (default)
  -g, --global    install for your user (every project / agent session)

Installs ${GAME_SKILLS.join(", ")} from ${SKILLS_SOURCE}.

create already installs project skills for you — you usually never need this command.
`);
      return 0;
    }
    console.error(`error: ${parsed.error}`);
    console.error("usage: jgengine skills (-g|--global | -p|--project)");
    return 1;
  }

  return installSkills(parsed.scope);
}
