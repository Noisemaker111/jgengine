import { describe, expect, test } from "bun:test";

import { isGameSourceFile, moduleGlobalName } from "./gameShape";

describe("module-global rule", () => {
  test("names a module-scope let and nothing else", () => {
    expect(moduleGlobalName("let timer = 0;")).toBe("timer");
    expect(moduleGlobalName("export let selected: string | null = null;")).toBe("selected");
    expect(moduleGlobalName("  let local = 1;")).toBeNull();
    expect(moduleGlobalName("const fixed = 1;")).toBeNull();
    expect(moduleGlobalName("letter = 2;")).toBeNull();
  });

  test("reads non-test TypeScript sources only", () => {
    expect(isGameSourceFile("loop.ts")).toBe(true);
    expect(isGameSourceFile("Hud.tsx")).toBe(true);
    expect(isGameSourceFile("loop.test.ts")).toBe(false);
    expect(isGameSourceFile("flow.json")).toBe(false);
  });
});
