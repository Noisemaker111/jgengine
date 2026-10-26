import { describe, expect, test } from "bun:test";

import { GRASS_PRESETS } from "@jgengine/core/grass/grassKind";

import { grassLooksGame } from "./grassLooksDemo";

describe("grass looks demo", () => {
  test("offers a capture view for every preset plus the hand-mixed looks", () => {
    const views = Object.keys(grassLooksGame.capture?.views ?? {});
    expect(views).toContain("overview");
    expect(views.filter((view) => view.startsWith("look-")).length).toBeGreaterThanOrEqual(GRASS_PRESETS.length + 2);
  });
});
