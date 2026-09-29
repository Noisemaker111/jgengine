import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cliVersion, sdkVersion } from "./pkg";
import { installedSdkVersions, sdkMinorNewer, versionNewer } from "./compatibility";

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

/** Agent utilities staged with the full skill set (not part of the low-token minimal create install). */
export const AGENT_UTILITY_SKILLS = ["jgengine-verify", "ce-handoff"] as const;

export const GAME_SKILLS = [...API_SKILL_DIRS, ...DESIGN_SKILL_DIRS, ...AGENT_UTILITY_SKILLS] as const;

/** The default a created project starts from — intake/routing, editor authoring, verify, and the two skills that keep a game from looking like every other one: the design contract and UI art direction. */
export const MINIMAL_GAME_SKILLS = ["jgengine", "jgengine-editor", "jgengine-verify", "game-design", "jgengine-ui"] as const;

export type SkillsScope = "global" | "project";
export type SkillsSet = "minimal" | "all";

function skillsFor(set: SkillsSet): readonly string[] {
  return set === "all" ? GAME_SKILLS : MINIMAL_GAME_SKILLS;
}

/** @internal */
export function parseSkillsArgs(argv: string[]): { scope: SkillsScope; set: SkillsSet; force: boolean } | { error: string } {
  let scope: SkillsScope | null = null;
  let set: SkillsSet = "minimal";
  let force = false;
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
    if (arg === "-a" || arg === "--all") {
      set = "all";
      continue;
    }
    if (arg === "--force") { force = true; continue; }
    if (arg === "-y" || arg === "--yes") continue;
    if (arg === "-h" || arg === "--help") return { error: "help" };
    return { error: `unknown skills option: ${arg}` };
  }
  return { scope: scope ?? "project", set, force };
}

const VERSION_METADATA = ".jgengine-version.json";

function identicalSource(source: string, target: string): boolean {
  return readdirSync(source, { withFileTypes: true }).every(entry => {
    if (entry.name === "api.md" || entry.name === VERSION_METADATA) return true;
    const incoming = join(source, entry.name);
    const installed = join(target, entry.name);
    if (!existsSync(installed)) return false;
    return entry.isDirectory() ? identicalSource(incoming, installed) : readFileSync(incoming).equals(readFileSync(installed));
  });
}

function preflightSkills(target: string, base: string, scope: SkillsScope, skills: readonly string[], packaged?: string): boolean {
  try {
    if (scope === "project") {
      const newer = installedSdkVersions(base).filter(entry => sdkMinorNewer(entry.version, sdkVersion()));
      if (newer.length > 0) throw new Error(`CLI ${cliVersion()} targets SDK ${sdkVersion()}; installed ${newer.map(entry => `${entry.name}@${entry.version}`).join(", ")} is newer`);
    }
    for (const skill of skills) {
      if (packaged !== undefined && !existsSync(join(packaged, skill, "SKILL.md"))) continue;
      const installed = join(target, skill);
      if (!existsSync(installed)) continue;
      const metadata = join(installed, VERSION_METADATA);
      if (!existsSync(metadata)) {
        if (packaged !== undefined && identicalSource(join(packaged, skill), installed)) continue;
        throw new Error(`${skill} has no version metadata; preserving its existing files`);
      }
      const version = JSON.parse(readFileSync(metadata, "utf8")) as { version?: number; cliVersion?: string; sdkVersion?: string };
      if (version.version !== 1 || typeof version.cliVersion !== "string" || typeof version.sdkVersion !== "string") throw new Error(`${skill} has invalid version metadata`);
      if (versionNewer(version.cliVersion, cliVersion()) || versionNewer(version.sdkVersion, sdkVersion())) {
        throw new Error(`${skill} was installed by CLI ${version.cliVersion} for SDK ${version.sdkVersion}; running CLI ${cliVersion()} targets SDK ${sdkVersion()}`);
      }
    }
    return true;
  } catch (error) {
    console.error(`error: refusing to overwrite agent skills: ${error instanceof Error ? error.message : String(error)}. Update the project CLI, or pass --force to replace these files.`);
    return false;
  }
}

/** @internal */
export function skillsInstallArgs(scope: SkillsScope, set: SkillsSet = "minimal"): string[] {
  const args = ["--yes", "skills", "add", SKILLS_SOURCE, "-y"];
  for (const skill of skillsFor(set)) {
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
export function installPackagedSkills(
  packaged: string,
  scope: SkillsScope,
  cwd?: string,
  set: SkillsSet = "minimal",
  force = false,
): number {
  const base = scope === "global" ? homedir() : (cwd ?? process.cwd());
  const target = join(base, ".claude", "skills");
  const skills = skillsFor(set);
  if (!force && !preflightSkills(target, base, scope, skills, packaged)) return 1;
  console.log(`installing packaged agent skills into ${target}: ${skills.join(", ")}…`);
  mkdirSync(target, { recursive: true });
  for (const skill of skills) {
    const source = join(packaged, skill);
    if (!existsSync(join(source, "SKILL.md"))) continue;
    // Full api.md inventories stay in the tarball for website/CI — projects discover through
    // capabilities.md and recipes instead, so the installed set stays low-token.
    cpSync(source, join(target, skill), {
      recursive: true,
      force: true,
      filter: (src) => basename(src) !== "api.md",
    });
    writeFileSync(join(target, skill, VERSION_METADATA), `${JSON.stringify({ version: 1, cliVersion: cliVersion(), sdkVersion: sdkVersion() }, null, 2)}\n`);
  }
  return 0;
}

/** @internal */
export function installSkills(scope: SkillsScope, cwd?: string, set: SkillsSet = "minimal", force = false): number {
  const packaged = packagedSkillsDir();
  if (packaged !== null) return installPackagedSkills(packaged, scope, cwd, set, force);
  const base = scope === "global" ? homedir() : (cwd ?? process.cwd());
  if (!force && !preflightSkills(join(base, ".claude", "skills"), base, scope, skillsFor(set))) return 1;
  const where = scope === "global" ? "globally" : "in this project";
  console.log(`installing agent skills ${where} from ${SKILLS_SOURCE}: ${skillsFor(set).join(", ")}…`);
  const result = spawnSync("npx", skillsInstallArgs(scope, set), {
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
      console.log(`usage: jgengine skills (-g|--global | -p|--project) [--all] [--force]

  -p, --project   install into this project (default)
  -g, --global    install for your user (every project / agent session)
  -a, --all       install the full domain skill set (${GAME_SKILLS.join(", ")})
  --force        allow replacing newer or unversioned installed skills

Default installs the minimal set create ships with: ${MINIMAL_GAME_SKILLS.join(", ")}.
Pass --all when the game needs the full domain skills. Source: the copy packaged in this CLI
(fallback: ${SKILLS_SOURCE}).

People do not run this. Agents use it; create already installs the minimal project skills.
`);
      return 0;
    }
    console.error(`error: ${parsed.error}`);
    console.error("usage: jgengine skills (-g|--global | -p|--project) [--all] [--force]");
    return 1;
  }

  return installSkills(parsed.scope, undefined, parsed.set, parsed.force);
}
