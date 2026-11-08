import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyAssets } from "./build-engine";

describe("copyAssets", () => {
  test("copies the wasm files source loads by URL into dist at the same path, and nothing else", () => {
    const root = mkdtempSync(join(tmpdir(), "jg-build-engine-"));
    try {
      const src = join(root, "src");
      const dist = join(root, "dist");
      mkdirSync(join(src, "webgpu"), { recursive: true });
      writeFileSync(join(src, "webgpu", "glslToWgsl.wasm"), new Uint8Array([0, 97, 115, 109]));
      writeFileSync(join(src, "webgpu", "glslToWgsl.draw.ts"), "export {};");
      expect(copyAssets(src, dist)).toEqual([join("webgpu", "glslToWgsl.wasm")]);
      expect(existsSync(join(dist, "webgpu", "glslToWgsl.wasm"))).toBe(true);
      expect(existsSync(join(dist, "webgpu", "glslToWgsl.draw.ts"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
