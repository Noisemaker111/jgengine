import { describe, expect, test } from "bun:test";

import { ENTER_QUIET_MS, nextBootStep, type BootSignals } from "./BootDirector.draw";

const signals = (over: Partial<BootSignals> = {}): BootSignals => ({ phase: "menu", warming: false, nearReady: false, loaderIdleMs: 0, areasLoading: 0, ...over });

describe("nextBootStep", () => {
  test("shows the menu as soon as the game is in its menu, while assets still load behind it", () => {
    expect(nextBootStep("loading", signals({ warming: true }))).toBe("menu");
    expect(nextBootStep("open", signals())).toBe("menu");
  });

  test("leaves a game's intro to the game", () => {
    expect(nextBootStep("intro", signals())).toBe("intro");
  });

  test("a game that plays from boot loads until its scene is warm", () => {
    expect(nextBootStep("open", signals({ phase: "playing", warming: true }))).toBe("loading");
    expect(nextBootStep("loading", signals({ phase: "playing" }))).toBe("playing");
  });

  test("Play enters at once when the near files are fetched", () => {
    expect(nextBootStep("menu", signals({ phase: "playing", nearReady: true }))).toBe("playing");
  });

  test("Play shows the entering screen until the near files are in and the world they feed has loaded", () => {
    expect(nextBootStep("menu", signals({ phase: "playing" }))).toBe("entering");
    expect(nextBootStep("entering", signals({ phase: "playing", nearReady: true, loaderIdleMs: 0 }))).toBe("entering");
    expect(nextBootStep("entering", signals({ phase: "playing", nearReady: true, loaderIdleMs: ENTER_QUIET_MS }))).toBe("playing");
  });

  test("a world piece still loading holds the loading or entering screen, never play", () => {
    expect(nextBootStep("loading", signals({ phase: "playing", areasLoading: 1 }))).toBe("loading");
    expect(nextBootStep("menu", signals({ phase: "playing", nearReady: true, areasLoading: 1 }))).toBe("entering");
    expect(nextBootStep("entering", signals({ phase: "playing", nearReady: true, loaderIdleMs: ENTER_QUIET_MS, areasLoading: 1 }))).toBe("entering");
  });

  test("never moves once playing", () => {
    expect(nextBootStep("playing", signals({ phase: "menu" }))).toBe("playing");
  });
});
