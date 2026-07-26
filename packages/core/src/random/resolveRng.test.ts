import { afterEach, describe, expect, test } from "bun:test";

import { resetRngFallbackWarnings, resolveRng } from "./resolveRng";
import { seededRng } from "./rng";

function captureWarnings(run: () => void): string[] {
  const host = globalThis as { console?: { warn?: (text: string) => void } };
  const original = host.console!.warn;
  const seen: string[] = [];
  host.console!.warn = (text: string) => void seen.push(text);
  try {
    run();
  } finally {
    host.console!.warn = original;
  }
  return seen;
}

afterEach(resetRngFallbackWarnings);

describe("resolveRng", () => {
  test("returns the injected stream untouched and stays silent", () => {
    const injected = seededRng("seed");
    let resolved!: () => number;
    const warnings = captureWarnings(() => {
      resolved = resolveRng(injected, "site");
    });
    expect(resolved).toBe(injected);
    expect(warnings).toEqual([]);
  });

  test("falls back to a working generator and names the site", () => {
    let resolved!: () => number;
    const warnings = captureWarnings(() => {
      resolved = resolveRng(undefined, "createLootRegistry");
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("createLootRegistry");
    expect(warnings[0]).toContain("Math.random");
    const value = resolved();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });

  test("warns once per site, not once per call", () => {
    const warnings = captureWarnings(() => {
      resolveRng(undefined, "siteA");
      resolveRng(undefined, "siteA");
      resolveRng(undefined, "siteA");
    });
    expect(warnings).toHaveLength(1);
  });

  test("distinct sites each get their own warning", () => {
    const warnings = captureWarnings(() => {
      resolveRng(undefined, "siteA");
      resolveRng(undefined, "siteB");
    });
    expect(warnings).toHaveLength(2);
  });
});
