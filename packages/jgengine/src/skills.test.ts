import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cliVersion, sdkVersion } from "./pkg";

import {
  GAME_SKILLS,
  installPackagedSkills,
  MINIMAL_GAME_SKILLS,
  parseSkillsArgs,
  skillsInstallArgs,
  SKILLS_SOURCE,
} from "./skills";

describe("parseSkillsArgs", () => {
  test("defaults to project + minimal set", () => {
    expect(parseSkillsArgs([])).toEqual({ scope: "project", set: "minimal", force: false });
  });

  test("accepts -g and -p", () => {
    expect(parseSkillsArgs(["-g"])).toEqual({ scope: "global", set: "minimal", force: false });
    expect(parseSkillsArgs(["--global"])).toEqual({ scope: "global", set: "minimal", force: false });
    expect(parseSkillsArgs(["-p"])).toEqual({ scope: "project", set: "minimal", force: false });
    expect(parseSkillsArgs(["--project"])).toEqual({ scope: "project", set: "minimal", force: false });
  });

  test("--all selects the full domain set", () => {
    expect(parseSkillsArgs(["--all"])).toEqual({ scope: "project", set: "all", force: false });
    expect(parseSkillsArgs(["-p", "--all", "--force"])).toEqual({ scope: "project", set: "all", force: true });
  });

  test("rejects both scopes", () => {
    expect(parseSkillsArgs(["-g", "-p"])).toEqual({
      error: "use either -g/--global or -p/--project, not both",
    });
  });

  test("rejects unknown flags", () => {
    expect(parseSkillsArgs(["--wat"])).toEqual({ error: "unknown skills option: --wat" });
  });
});

describe("skill sets", () => {
  test("minimal set is intake + editor + verify + design + ui, a subset of the full set", () => {
    expect(MINIMAL_GAME_SKILLS).toEqual(["jgengine", "jgengine-editor", "jgengine-verify", "game-design", "jgengine-ui"]);
    for (const skill of MINIMAL_GAME_SKILLS) {
      expect(GAME_SKILLS).toContain(skill);
    }
    expect(GAME_SKILLS.length).toBeGreaterThan(MINIMAL_GAME_SKILLS.length);
  });
});

describe("skillsInstallArgs", () => {
  test("default installs the minimal set, not the whole domain tree", () => {
    const project = skillsInstallArgs("project");
    expect(project).toContain(SKILLS_SOURCE);
    expect(project).toContain("-y");
    for (const skill of MINIMAL_GAME_SKILLS) {
      expect(project).toContain(skill);
    }
    expect(project).not.toContain("jgengine-world");
    expect(project).not.toContain("level-design");
    expect(project).not.toContain("-g");

    const global = skillsInstallArgs("global");
    expect(global).toContain("-g");
  });

  test('"all" installs every game skill', () => {
    const args = skillsInstallArgs("project", "all");
    for (const skill of GAME_SKILLS) {
      expect(args).toContain(skill);
    }
  });
});

describe("installPackagedSkills", () => {
  function bytes(dir: string): Record<string, string> {
    return Object.fromEntries(readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => [join(entry.parentPath, entry.name), readFileSync(join(entry.parentPath, entry.name)).toString("base64")]));
  }
  function packagedFixture(): string {
    const packaged = mkdtempSync(join(tmpdir(), "jgengine-skills-src-"));
    for (const skill of GAME_SKILLS) {
      mkdirSync(join(packaged, skill, "references"), { recursive: true });
      writeFileSync(join(packaged, skill, "SKILL.md"), `# ${skill}\n`);
      writeFileSync(join(packaged, skill, "capabilities.md"), "capabilities\n");
      writeFileSync(join(packaged, skill, "api.md"), "full export inventory\n");
      writeFileSync(join(packaged, skill, "references", "deep.md"), "reference\n");
    }
    return packaged;
  }

  test("default copies only the minimal set", () => {
    const project = mkdtempSync(join(tmpdir(), "jgengine-skills-dst-"));
    expect(installPackagedSkills(packagedFixture(), "project", project)).toBe(0);
    const target = join(project, ".claude", "skills");
    for (const skill of MINIMAL_GAME_SKILLS) {
      expect(existsSync(join(target, skill, "SKILL.md"))).toBe(true);
    }
    expect(existsSync(join(target, "jgengine-world"))).toBe(false);
    expect(existsSync(join(target, "level-design"))).toBe(false);
  });

  test('"all" copies the full set', () => {
    const project = mkdtempSync(join(tmpdir(), "jgengine-skills-dst-"));
    expect(installPackagedSkills(packagedFixture(), "project", project, "all")).toBe(0);
    const target = join(project, ".claude", "skills");
    for (const skill of GAME_SKILLS) {
      expect(existsSync(join(target, skill, "SKILL.md"))).toBe(true);
    }
  });

  test("api.md inventories are excluded from project installs; everything else copies", () => {
    const project = mkdtempSync(join(tmpdir(), "jgengine-skills-dst-"));
    installPackagedSkills(packagedFixture(), "project", project, "all");
    const target = join(project, ".claude", "skills");
    for (const skill of GAME_SKILLS) {
      expect(existsSync(join(target, skill, "api.md"))).toBe(false);
      expect(existsSync(join(target, skill, "capabilities.md"))).toBe(true);
      expect(existsSync(join(target, skill, "references", "deep.md"))).toBe(true);
    }
  });

  for (const field of ["cliVersion", "sdkVersion"] as const) {
    test(`preflights the entire set before a ${field} downgrade and replaces only with --force`, () => {
      const project = mkdtempSync(join(tmpdir(), "jgengine-skills-guard-"));
      const packaged = packagedFixture();
      try {
        expect(installPackagedSkills(packaged, "project", project, "all")).toBe(0);
        const lastSkill = GAME_SKILLS[GAME_SKILLS.length - 1]!;
        const marker = join(project, ".claude", "skills", lastSkill, ".jgengine-version.json");
        writeFileSync(marker, JSON.stringify({ version: 1, cliVersion: cliVersion(), sdkVersion: sdkVersion(), [field]: "99.0.0" }));
        writeFileSync(join(packaged, GAME_SKILLS[0], "SKILL.md"), "incoming changed skill\n");
        const before = bytes(project);
        expect(installPackagedSkills(packaged, "project", project, "all")).toBe(1);
        expect(bytes(project)).toEqual(before);
        expect(installPackagedSkills(packaged, "project", project, "all", true)).toBe(0);
        expect(readFileSync(join(project, ".claude", "skills", GAME_SKILLS[0], "SKILL.md"), "utf8")).toBe("incoming changed skill\n");
        expect(JSON.parse(readFileSync(marker, "utf8"))).toEqual({ version: 1, cliVersion: cliVersion(), sdkVersion: sdkVersion() });
      } finally {
        rmSync(project, { recursive: true, force: true });
        rmSync(packaged, { recursive: true, force: true });
      }
    });
  }

  test("preserves differing legacy skills, adopts identical ones, and refuses corrupt metadata", () => {
    const project = mkdtempSync(join(tmpdir(), "jgengine-skills-legacy-"));
    const packaged = packagedFixture();
    try {
      const skill = join(project, ".claude", "skills", "jgengine");
      mkdirSync(skill, { recursive: true });
      writeFileSync(join(skill, "SKILL.md"), "existing unversioned skill\n");
      const before = bytes(project);
      expect(installPackagedSkills(packaged, "project", project)).toBe(1);
      expect(bytes(project)).toEqual(before);
      expect(installPackagedSkills(packaged, "project", project, "minimal", true)).toBe(0);
      const marker = join(skill, ".jgengine-version.json");
      rmSync(marker);
      expect(installPackagedSkills(packaged, "project", project)).toBe(0);
      writeFileSync(marker, "{broken");
      const corruptBefore = bytes(project);
      expect(installPackagedSkills(packaged, "project", project)).toBe(1);
      expect(bytes(project)).toEqual(corruptBefore);
    } finally {
      rmSync(project, { recursive: true, force: true });
      rmSync(packaged, { recursive: true, force: true });
    }
  });

  test("refuses skills from an older SDK against actual installed packages before creating files", () => {
    const project = mkdtempSync(join(tmpdir(), "jgengine-skills-sdk-"));
    const packaged = packagedFixture();
    try {
      writeFileSync(join(project, "package.json"), JSON.stringify({ dependencies: { "@jgengine/core": "^0.1.0" } }));
      mkdirSync(join(project, "node_modules", "@jgengine", "core"), { recursive: true });
      writeFileSync(join(project, "node_modules", "@jgengine", "core", "package.json"), '{"version":"99.0.0"}');
      const before = bytes(project);
      expect(installPackagedSkills(packaged, "project", project)).toBe(1);
      expect(bytes(project)).toEqual(before);
      expect(installPackagedSkills(packaged, "project", project, "minimal", true)).toBe(0);
    } finally {
      rmSync(project, { recursive: true, force: true });
      rmSync(packaged, { recursive: true, force: true });
    }
  });
});
