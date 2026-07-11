import { spawnSync } from "node:child_process";

export const SKILLS_SOURCE = "Noisemaker111/jgengine";

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
  const args = ["--yes", "skills", "add", SKILLS_SOURCE, "-y", "--all"];
  if (scope === "global") args.push("-g");
  return args;
}

export function runSkills(argv: string[]): number {
  const parsed = parseSkillsArgs(argv);
  if ("error" in parsed) {
    if (parsed.error === "help") {
      console.log(`usage: jgengine skills (-g|--global | -p|--project)

  -p, --project   install into this project (.claude/skills) — default
  -g, --global    install for your user (every project / agent session)

Installs jgengine-api, jgengine-newgame, and jgengine-verify from ${SKILLS_SOURCE}.

entry:
  npx jgengine create "Solitaire"
  cd Solitaire
  npx jgengine skills -p
  # tell your agent: make Solitaire with jgengine

  # or once for all projects:
  npx jgengine skills -g
`);
      return 0;
    }
    console.error(`error: ${parsed.error}`);
    console.error('usage: jgengine skills (-g|--global | -p|--project)');
    return 1;
  }

  const where = parsed.scope === "global" ? "globally" : "in this project";
  console.log(`installing JGengine agent skills ${where} (jgengine-api, jgengine-newgame, jgengine-verify)…`);
  const result = spawnSync("npx", skillsInstallArgs(parsed.scope), {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}
