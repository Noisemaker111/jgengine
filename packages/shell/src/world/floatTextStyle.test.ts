import { describe, expect, test } from "bun:test";
import { resolveFloatTextStyle } from "@jgengine/shell/world/floatTextStyle";

describe("float text styling", () => {
  test("plain damage is amber at base size", () => {
    const style = resolveFloatTextStyle({ kind: "damage" });
    expect(style.color).toBe("#fde68a");
    expect(style.fontSizePx).toBe(18);
  });

  test("heal is green", () => {
    expect(resolveFloatTextStyle({ kind: "heal" }).color).toBe("#6ee7b7");
  });

  test("crit enlarges and recolors to gold with glow", () => {
    const style = resolveFloatTextStyle({ kind: "damage", crit: true });
    expect(style.color).toBe("#fbbf24");
    expect(style.fontSizePx).toBeGreaterThan(18);
    expect(style.fontWeight).toBe(900);
    expect(style.glow).toContain("0 0");
  });

  test("hitType crit is equivalent to crit flag", () => {
    expect(resolveFloatTextStyle({ kind: "damage", hitType: "crit" }).color).toBe("#fbbf24");
  });

  test("element overrides base color", () => {
    expect(resolveFloatTextStyle({ kind: "damage", element: "fire" }).color).toBe("#fb923c");
    expect(resolveFloatTextStyle({ kind: "damage", element: "frost" }).color).toBe("#7dd3fc");
  });

  test("explicit scale multiplies size", () => {
    expect(resolveFloatTextStyle({ kind: "damage", scale: 2 }).fontSizePx).toBe(36);
  });
});
