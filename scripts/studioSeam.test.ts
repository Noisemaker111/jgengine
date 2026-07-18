import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { getSceneKind, parseParams } from "../packages/core/src/scene/sceneKinds";
import { getAssetGenerator, resolveGeneratorAsset } from "../packages/core/src/scene/assetGenerator";
import { registerBuiltinSceneKinds } from "../packages/core/src/scene/builtinSceneKinds";
import { POLE_LINE_KIND, POLE_LINE_SCHEMA, resolvePoleLine } from "../packages/core/src/world/poleLineKind";
import { BOOKCASE_GENERATOR_ID, registerBookcaseStudio } from "../examples/studios/src/bookcaseStudio";

/**
 * Acceptance test for the parametric-studio seam (#809/#812): a brand-new studio is added by ONE
 * self-contained module + one register call, with zero edits to engine files. The bookcase example
 * proves the third-party path; the pole line graduated into the engine builtins for studio/editor
 * parity (#1101) and must be authorable in every editor session with no game wiring.
 */
describe("studio/editor parity: pole line is a builtin scene kind", () => {
  test("registerBuiltinSceneKinds lights up pole_line — no game wiring needed", () => {
    registerBuiltinSceneKinds();
    const definition = getSceneKind(POLE_LINE_KIND);
    expect(definition).toBeDefined();
    expect(definition!.target).toBe("path");
    expect(definition!.addCategory).toBe("Studios");
    // The same registered resolver the editor note + shell renderer consume.
    const resolved = resolvePoleLine(
      { id: "line", kind: POLE_LINE_KIND, points: [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }] },
      parseParams(POLE_LINE_SCHEMA, { spacing: 10, wireCount: 2 }),
    );
    expect(resolved.poles).toHaveLength(5);
    expect(resolved.cables).toHaveLength(8);
  });
});

describe("adding a studio needs only the public seam", () => {
  test("registerBookcaseStudio lights up a generator asset re-resolvable from meta", () => {
    registerBookcaseStudio();
    expect(getAssetGenerator(BOOKCASE_GENERATOR_ID)).toBeDefined();
    const asset = resolveGeneratorAsset({ assetId: BOOKCASE_GENERATOR_ID, width: 1.2, shelves: 3, seed: "s" });
    expect(asset).not.toBeNull();
    expect(asset!.parts.length).toBeGreaterThan(5);
    // Deterministic for the same seed.
    const again = resolveGeneratorAsset({ assetId: BOOKCASE_GENERATOR_ID, width: 1.2, shelves: 3, seed: "s" });
    expect(again!.parts.length).toBe(asset!.parts.length);
  });
});

describe("no engine file references the throwaway studios", () => {
  const walk = (dir: string, out: string[]): string[] => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
  };

  test("no engine package imports an example studio or defines its logic", () => {
    const offenders: string[] = [];
    // Real coupling would be an import of the adopter modules or the examples workspace, or an
    // engine-defined bookcase symbol. Prose mentions in doc comments are fine (they teach the seam).
    const importPattern = /from\s+["'][^"']*(?:examples\/studios|bookcaseStudio)["']|@jgengine-examples/;
    const symbolPattern = /\b(?:registerBookcaseStudio|generateBookcase|BOOKCASE_GENERATOR_ID)\b/;
    for (const file of walk(join(process.cwd(), "packages"), [])) {
      const source = readFileSync(file, "utf8");
      if (importPattern.test(source) || symbolPattern.test(source)) offenders.push(file.replace(process.cwd(), "."));
    }
    expect(offenders).toEqual([]);
  });
});
