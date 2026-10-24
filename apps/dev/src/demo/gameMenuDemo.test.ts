import { describe, expect, test } from "bun:test";

import { gameMenuDemoGame } from "./gameMenuDemo";

describe("game menu demo", () => {
  test("declares the capture states its views use", () => {
    const states = gameMenuDemoGame.capture?.states ?? {};
    const views = gameMenuDemoGame.capture?.views ?? {};
    for (const view of Object.values(views)) {
      if (view.state !== undefined) expect(Object.keys(states)).toContain(view.state);
    }
    expect(Object.keys(views)).toEqual(expect.arrayContaining(["title", "character", "saves", "pause"]));
  });

  test("the runner registry exposes the demo without Vite", async () => {
    const { gameRegistry } = await import("../registries");
    expect(typeof gameRegistry["game-menu"]).toBe("function");
  });
});

