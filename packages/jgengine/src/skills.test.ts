import { describe, expect, test } from "bun:test";

import { GAME_SKILLS, parseSkillsArgs, skillsInstallArgs, SKILLS_SOURCE } from "./skills";

describe("parseSkillsArgs", () => {
  test("defaults to project", () => {
    expect(parseSkillsArgs([])).toEqual({ scope: "project" });
  });

  test("accepts -g and -p", () => {
    expect(parseSkillsArgs(["-g"])).toEqual({ scope: "global" });
    expect(parseSkillsArgs(["--global"])).toEqual({ scope: "global" });
    expect(parseSkillsArgs(["-p"])).toEqual({ scope: "project" });
    expect(parseSkillsArgs(["--project"])).toEqual({ scope: "project" });
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

describe("skillsInstallArgs", () => {
  test("installs the intake + domain game skills, not the whole monorepo skill tree", () => {
    const project = skillsInstallArgs("project");
    expect(project).toContain(SKILLS_SOURCE);
    expect(project).toContain("-y");
    for (const skill of GAME_SKILLS) {
      expect(project).toContain(skill);
    }
    expect(project).not.toContain("--all");
    expect(project).not.toContain("-g");

    const global = skillsInstallArgs("global");
    expect(global).toContain("-g");
  });
});
