import { describe, expect, test } from "bun:test";

import { formatTunableLiteral, rewriteTunableExport } from "./rewriteTunables";

describe("formatTunableLiteral", () => {
  test("scalars and vectors", () => {
    expect(formatTunableLiteral(42)).toBe("42");
    expect(formatTunableLiteral(-2.5)).toBe("-2.5");
    expect(formatTunableLiteral(true)).toBe("true");
    expect(formatTunableLiteral("#87ceeb")).toBe('"#87ceeb"');
    expect(formatTunableLiteral([1, 2.5, -3])).toBe("[1, 2.5, -3]");
  });

  test("unsafe values are rejected", () => {
    expect(formatTunableLiteral(Number.NaN)).toBeNull();
    expect(formatTunableLiteral({ a: 1 })).toBeNull();
    expect(formatTunableLiteral([1, "x"])).toBeNull();
    expect(formatTunableLiteral(undefined)).toBeNull();
  });
});

describe("rewriteTunableExport", () => {
  test("top-level scalar export", () => {
    const code = `export const GRAVITY = -22;\nexport const NAME = "x";\n`;
    expect(rewriteTunableExport(code, "GRAVITY", [], -30)).toBe(
      `export const GRAVITY = -30;\nexport const NAME = "x";\n`,
    );
  });

  test("annotated let export from tunable transform", () => {
    const code = `export let SPEED: number = 8;\n`;
    expect(rewriteTunableExport(code, "SPEED", [], 12)).toBe(`export let SPEED: number = 12;\n`);
  });

  test("nested object path", () => {
    const code = `export const TUNING = {
  gravity: -22,
  sky: { color: "#87ceeb", intensity: 1 },
};
`;
    const rewritten = rewriteTunableExport(code, "TUNING", ["sky", "color"], "#112233");
    expect(rewritten).toContain(`color: "#112233"`);
    expect(rewritten).toContain("gravity: -22");
  });

  test("array index path", () => {
    const code = `export const WAVES = [{ count: 3 }, { count: 8 }];\n`;
    const rewritten = rewriteTunableExport(code, "WAVES", ["1", "count"], 12);
    expect(rewritten).toBe(`export const WAVES = [{ count: 3 }, { count: 12 }];\n`);
  });

  test("vector value replaces whole array literal", () => {
    const code = `export const CAMERA = { offset: [0, 2, -6] };\n`;
    const rewritten = rewriteTunableExport(code, "CAMERA", ["offset"], [1, 3, -8]);
    expect(rewritten).toBe(`export const CAMERA = { offset: [1, 3, -8] };\n`);
  });

  test("skips comments, strings, and spreads while scanning", () => {
    const code = `export const T = {
  // gravity: 1 in a comment
  label: "gravity: 2",
  ...DEFAULTS,
  gravity: -22,
};
`;
    const rewritten = rewriteTunableExport(code, "T", ["gravity"], -9);
    expect(rewritten).toContain("gravity: -9,");
    expect(rewritten).toContain(`label: "gravity: 2"`);
    expect(rewritten).toContain("...DEFAULTS");
  });

  test("methods are stepped over", () => {
    const code = `export const T = {
  compute(a: number) { return { x: a }; },
  hp: 100,
};
`;
    const rewritten = rewriteTunableExport(code, "T", ["hp"], 250);
    expect(rewritten).toContain("hp: 250,");
  });

  test("unknown export or key returns null", () => {
    const code = `export const T = { hp: 100 };\n`;
    expect(rewriteTunableExport(code, "MISSING", [], 1)).toBeNull();
    expect(rewriteTunableExport(code, "T", ["mp"], 1)).toBeNull();
    expect(rewriteTunableExport(code, "T", ["hp"], { bad: true })).toBeNull();
  });

  test("only the named export is touched when several exist", () => {
    const code = `export const A = { hp: 1 };\nexport const B = { hp: 2 };\n`;
    const rewritten = rewriteTunableExport(code, "B", ["hp"], 9);
    expect(rewritten).toBe(`export const A = { hp: 1 };\nexport const B = { hp: 9 };\n`);
  });
});
