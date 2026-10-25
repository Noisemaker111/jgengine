import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { gamePublicRoots, resolveGamePublicFile } from "./gamePublicPlugin";

function fixture() {
  // fixture-location: allow plain bytes on disk; the plugin imports nothing from @jgengine
  const root = mkdtempSync(join(tmpdir(), "game-public-"));
  const runner = join(root, "runner-public");
  const games = join(root, "Games");
  const served = join(root, "lane", "dead-acre");
  for (const dir of [join(runner, "models"), join(games, "harbor", "public", "models", "library", "city", "lamp"), join(served, "public", "models", "library", "nature", "rock")]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(runner, "models", "shared.glb"), "runner");
  writeFileSync(join(games, "harbor", "public", "models", "library", "city", "lamp", "near.gltf"), "harbor");
  writeFileSync(join(served, "public", "models", "library", "nature", "rock", "near.gltf"), "served");
  writeFileSync(join(root, "secret.txt"), "no");
  return { root, runner, games, served };
}

describe("a game's provisioned models reach the dev runner", () => {
  test("the --game-dir game's public folder comes before every Games/ folder", () => {
    const { games, served } = fixture();
    expect(gamePublicRoots(served, games)).toEqual([join(served, "public"), join(games, "harbor", "public")]);
  });

  test("a request resolves under the first root that holds the file", () => {
    const { runner, games, served } = fixture();
    const roots = [runner, ...gamePublicRoots(served, games)];
    expect(resolveGamePublicFile("/models/library/nature/rock/near.gltf?v=1", roots)).toBe(join(served, "public", "models", "library", "nature", "rock", "near.gltf"));
    expect(resolveGamePublicFile("/models/library/city/lamp/near.gltf", roots)).toBe(join(games, "harbor", "public", "models", "library", "city", "lamp", "near.gltf"));
    expect(resolveGamePublicFile("/models/shared.glb", roots)).toBe(join(runner, "models", "shared.glb"));
    expect(resolveGamePublicFile("/models/missing.glb", roots)).toBeNull();
  });

  test("a path never climbs out of a root", () => {
    const { runner, games, served } = fixture();
    const roots = [runner, ...gamePublicRoots(served, games)];
    expect(resolveGamePublicFile("/../secret.txt", roots)).toBeNull();
    expect(resolveGamePublicFile("/models/%2e%2e/%2e%2e/secret.txt", roots)).toBeNull();
    expect(resolveGamePublicFile("/models", roots)).toBeNull();
  });
});
