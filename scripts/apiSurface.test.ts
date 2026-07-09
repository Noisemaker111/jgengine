import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { extractPackageSurface } from "./apiSurface";

const root = join(import.meta.dir, "..");

describe("extractPackageSurface", () => {
  test("sql package yields a non-empty surface", () => {
    const surface = extractPackageSurface(join(root, "packages", "sql"));
    expect(surface.name.length).toBeGreaterThan(0);
    expect(surface.description.length).toBeGreaterThan(0);
    expect(surface.modules.length).toBeGreaterThan(0);
    for (const module of surface.modules) {
      for (const exported of module.exports) {
        expect(exported.name.startsWith("_")).toBe(false);
      }
    }
  });

  test("core package surface includes createSimClock", () => {
    const surface = extractPackageSurface(join(root, "packages", "core"));
    expect(surface.name.length).toBeGreaterThan(0);
    expect(surface.description.length).toBeGreaterThan(0);
    expect(surface.modules.length).toBeGreaterThan(0);

    const simClock = surface.modules.find((m) => m.path === "time/simClock");
    expect(simClock).toBeDefined();
    const createSimClock = simClock?.exports.find((e) => e.name === "createSimClock");
    expect(createSimClock?.kind).toBe("function");

    for (const module of surface.modules) {
      for (const exported of module.exports) {
        expect(exported.name.startsWith("_")).toBe(false);
      }
    }
  });
});
