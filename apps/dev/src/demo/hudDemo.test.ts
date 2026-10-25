import { describe, expect, test } from "bun:test";

import { demoGame } from "./demoGame";
import { hudShowcaseGame } from "./hudDemo";

describe("HUD showcase demo", () => {
  test("keeps the demo's gameplay and swaps in the showcase HUD", () => {
    expect(hudShowcaseGame.GameUI).toBeDefined();
    expect(hudShowcaseGame.GameUI).not.toBe(demoGame.GameUI);
    expect(hudShowcaseGame.systems).toBe(demoGame.systems);
  });
});
