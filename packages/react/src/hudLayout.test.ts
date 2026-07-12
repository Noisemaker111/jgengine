import { describe, expect, test } from "bun:test";

import { hudVisibleInPhase } from "./hudLayout";

describe("hudVisibleInPhase", () => {
  test("undefined showDuring is always visible", () => {
    expect(hudVisibleInPhase(undefined, "menu")).toBe(true);
    expect(hudVisibleInPhase(undefined, "playing")).toBe(true);
    expect(hudVisibleInPhase(undefined, "ended")).toBe(true);
  });

  test("visible only in listed phases", () => {
    expect(hudVisibleInPhase(["playing"], "playing")).toBe(true);
    expect(hudVisibleInPhase(["playing"], "menu")).toBe(false);
    expect(hudVisibleInPhase(["playing"], "ended")).toBe(false);
  });

  test("multiple phases", () => {
    expect(hudVisibleInPhase(["playing", "paused"], "paused")).toBe(true);
    expect(hudVisibleInPhase(["playing", "paused"], "menu")).toBe(false);
  });

  test("empty list hides everywhere", () => {
    expect(hudVisibleInPhase([], "playing")).toBe(false);
  });
});
