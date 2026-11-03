import { describe, expect, test } from "bun:test";

import { AGENT_UTILITY_SKILLS, DESIGN_SKILL_DIRS, GAME_SKILLS } from "../packages/jgengine/src/skills";
import { SKILL_DIRS, skillForModule } from "./skillRouting";

describe("skill routing contract", () => {
  test("routes disputed domains to one documented owner", () => {
    expect(skillForModule("core", "audio/music")).toBe("jgengine-world");
    expect(skillForModule("core", "input/bindings")).toBe("jgengine-world");
    expect(skillForModule("core", "stats/boundedStat")).toBe("jgengine-combat");
    expect(skillForModule("core", "achievements/achievements")).toBe("jgengine-gameplay");
    expect(skillForModule("core", "editor/document")).toBe("jgengine-editor");
  });

  test("packaged skills use the canonical API domain registry", () => {
    expect(GAME_SKILLS).toEqual([...SKILL_DIRS, ...DESIGN_SKILL_DIRS, ...AGENT_UTILITY_SKILLS]);
    expect(AGENT_UTILITY_SKILLS).toContain("ce-handoff");
    expect(AGENT_UTILITY_SKILLS).toContain("jgengine-verify");
  });
});
