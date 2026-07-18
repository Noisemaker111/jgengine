import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
    expect(parseSkillsArgs([])).toEqual({ scope: "project", set: "minimal" });
  });

  test("accepts -g and -p", () => {
    expect(parseSkillsArgs(["-g"])).toEqual({ scope: "global", set: "minimal" });
    expect(parseSkillsArgs(["--global"])).toEqual({ scope: "global", set: "minimal" });
    expect(parseSkillsArgs(["-p"])).toEqual({ scope: "project", set: "minimal" });
    expect(parseSkillsArgs(["--project"])).toEqual({ scope: "project", set: "minimal" });
  });

  test("--all selects the full domain set", () => {
    expect(parseSkillsArgs(["--all"])).toEqual({ scope: "project", set: "all" });
    expect(parseSkillsArgs(["-p", "--all"])).toEqual({ scope: "project", set: "all" });
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
  test("minimal set is intake + editor + verify, a subset of the full set", () => {
    expect(MINIMAL_GAME_SKILLS).toEqual(["jgengine", "jgengine-editor", "jgengine-verify"]);
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
    expect(project).not.toContain("game-design");
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
    expect(existsSync(join(target, "game-design"))).toBe(false);
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
});
