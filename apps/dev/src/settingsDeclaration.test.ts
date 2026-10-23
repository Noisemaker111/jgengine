import { describe, expect, test } from "bun:test";

import { describeDeclaredSettings } from "./settingsDeclaration";

describe("describeDeclaredSettings", () => {
  test("publishes the game's own rows with the values they accept", () => {
    expect(
      describeDeclaredSettings({
        extra: [
          { id: "survey.hints", label: "Hints", category: "survey", kind: "toggle", default: true },
          { id: "survey.pace", label: "Pace", category: "survey", kind: "select", default: "slow", options: [{ value: "slow", label: "Slow" }, { value: "fast", label: "Fast" }] },
          { id: "survey.fov", label: "FOV", category: "survey", kind: "slider", default: 70, min: 50, max: 100 },
        ],
      }),
    ).toEqual([
      { id: "survey.hints", kind: "toggle", default: true },
      { id: "survey.pace", kind: "select", options: ["slow", "fast"], default: "slow" },
      { id: "survey.fov", kind: "slider", min: 50, max: 100, default: 70 },
    ]);
  });

  test("a game with no settings of its own declares none", () => {
    expect(describeDeclaredSettings(undefined)).toEqual([]);
    expect(describeDeclaredSettings(false)).toEqual([]);
    expect(describeDeclaredSettings({ variant: "sheet" })).toEqual([]);
  });
});
