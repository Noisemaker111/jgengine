import { describe, expect, test } from "bun:test";

import { worldHealthBarAllowsRole } from "./playableGame";

describe("worldHealthBarAllowsRole", () => {
  test("allows every role when unrestricted", () => {
    expect(worldHealthBarAllowsRole(undefined, "npc")).toBe(true);
    expect(worldHealthBarAllowsRole(undefined, undefined)).toBe(true);
  });

  test("allows only roles present in the allowlist", () => {
    expect(worldHealthBarAllowsRole(["enemy", "hostile"], "enemy")).toBe(true);
    expect(worldHealthBarAllowsRole(["enemy", "hostile"], "npc")).toBe(false);
  });

  test("rejects entities with no catalog role once restricted", () => {
    expect(worldHealthBarAllowsRole(["enemy"], undefined)).toBe(false);
  });

  test("an empty allowlist admits nothing", () => {
    expect(worldHealthBarAllowsRole([], "enemy")).toBe(false);
  });
});
