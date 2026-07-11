import { describe, expect, test } from "bun:test";

import { parseSkillsArgs, skillsInstallArgs, SKILLS_SOURCE } from "./skills";

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
  test("project omits -g; global includes it", () => {
    expect(skillsInstallArgs("project")).toEqual(["--yes", "skills", "add", SKILLS_SOURCE, "-y", "--all"]);
    expect(skillsInstallArgs("global")).toEqual(["--yes", "skills", "add", SKILLS_SOURCE, "-y", "--all", "-g"]);
  });
});
