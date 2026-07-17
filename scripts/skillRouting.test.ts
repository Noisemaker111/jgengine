import { describe, expect, test } from "bun:test";

import { DESIGN_SKILL_DIRS, GAME_SKILLS } from "../packages/jgengine/src/skills";
import {
  INTAKE_ROUTES,
  NORMAL_GAME_INTAKE,
  SKILL_DIRS,
  skillForModule,
} from "./skillRouting";

describe("skill routing contract", () => {
  test("routes disputed domains to one documented owner", () => {
    expect(skillForModule("core", "audio/music")).toBe("jgengine-world");
    expect(skillForModule("core", "input/bindings")).toBe("jgengine-world");
    expect(skillForModule("core", "stats/boundedStat")).toBe("jgengine-combat");
    expect(skillForModule("core", "tactics/formation")).toBe("jgengine-gameplay");
    expect(skillForModule("core", "editor/document")).toBe("jgengine-editor");
  });

  test("scene authoring routes to editor plus runtime world", () => {
    expect(INTAKE_ROUTES.authoring).toEqual(["jgengine-editor", "jgengine-world"]);
  });

  test("design intake covers game rules and playable space", () => {
    expect(INTAKE_ROUTES.design).toEqual(["game-design", "level-design"]);
    expect(NORMAL_GAME_INTAKE).toContain("game-design");
    expect(NORMAL_GAME_INTAKE).not.toContain("level-design");
  });

  test("normal intake excludes opt-in combat, multiplayer, and asset manuals", () => {
    expect(NORMAL_GAME_INTAKE).not.toContain("jgengine-combat");
    expect(NORMAL_GAME_INTAKE).not.toContain("jgengine-multiplayer");
    expect(NORMAL_GAME_INTAKE).not.toContain("jgengine-assets");
  });

  test("packaged skills use the canonical API domain registry", () => {
    expect(GAME_SKILLS).toEqual([...SKILL_DIRS, ...DESIGN_SKILL_DIRS, "jgengine-verify"]);
  });
});
