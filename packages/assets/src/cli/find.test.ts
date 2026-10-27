import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { findAssets } from "../findAssets";
import { checkoutRoot, parseFindList, pickOf } from "./find";

const scratch = join(import.meta.dir, "../../../../.scratch");
mkdirSync(scratch, { recursive: true });
const cli = join(import.meta.dir, "pull.ts");

describe("assets find", () => {
  test("a --list file holds names or { query, pick }, and anything else is refused by position", () => {
    expect(parseFindList('["raptor", {"query": "knight", "pick": "kaykit-adventurers/Knight"}]')).toEqual([
      { query: "raptor" },
      { query: "knight", pick: "kaykit-adventurers/Knight" },
    ]);
    expect(() => parseFindList('{"query": "x"}')).toThrow(/array/);
    expect(() => parseFindList('["ok", 3]')).toThrow(/item 1/);
    expect(() => parseFindList('[{"query": "x", "pick": 4}]')).toThrow(/pick/);
  });

  test("the pick is the named match, else the top match only when it is confident", () => {
    const knight = findAssets("knight", { has: () => false, gameFiles: [] });
    expect(pickOf({ query: "knight" }, knight)?.id).toBe("kaykit-adventurers/Knight");
    expect(pickOf({ query: "knight", pick: "nope" }, knight)).toBeNull();
    const dinosaur = findAssets("dinosaur", { has: () => false, gameFiles: [] });
    expect(pickOf({ query: "dinosaur" }, dinosaur)).toBeNull();
  });

  test("--provision links a stored pack, copies another game's file and skips a name with no confident match", () => {
    const root = mkdtempSync(join(scratch, "jg-assets-find-"));
    try {
      mkdirSync(join(root, "packages", "assets"), { recursive: true });
      writeFileSync(join(root, "packages", "assets", "package.json"), "{}");
      const game = join(root, "games", "mine");
      mkdirSync(join(game, "public"), { recursive: true });
      const other = join(root, "games", "other", "public", "models", "imported", "creatures");
      mkdirSync(other, { recursive: true });
      writeFileSync(join(other, "velociraptor.glb"), "raptor bytes");
      const store = join(root, "store");
      mkdirSync(join(store, "models", "kaykit-adventurers"), { recursive: true });
      writeFileSync(join(store, "models", "kaykit-adventurers", "Knight.glb"), "knight bytes");
      writeFileSync(join(root, "list.json"), JSON.stringify(["knight", { query: "raptor", pick: "other:models/imported/creatures/velociraptor.glb" }, "dinosaur"]));
      expect(checkoutRoot(game)).toBe(root);

      const run = spawnSync(process.execPath, [cli, "find", "--list", join(root, "list.json"), "--game", game, "--provision", "--limit", "3"], {
        cwd: root,
        encoding: "utf8",
        timeout: 60_000,
        env: { ...process.env, JG_ASSET_STORE: store },
      });
      expect(run.status).toBe(0);
      const out = JSON.parse(run.stdout) as { results: { query: string; matches: { id: string; onDisk: boolean }[] }[]; provisioned: Record<string, string[]> };
      expect(out.provisioned).toEqual({ linked: ["kaykit-adventurers"], pulled: [], copied: ["other:models/imported/creatures/velociraptor.glb"], failed: [], skipped: ["dinosaur"] });
      expect(lstatSync(join(game, "public", "models", "kaykit-adventurers")).isSymbolicLink()).toBe(true);
      expect(readFileSync(join(game, "public", "models", "kaykit-adventurers", "Knight.glb"), "utf8")).toBe("knight bytes");
      expect(readFileSync(join(game, "public", "models", "imported", "creatures", "velociraptor.glb"), "utf8")).toBe("raptor bytes");
      // The answer printed after provisioning reads the disk again.
      expect(out.results[0]!.matches[0]).toMatchObject({ id: "kaykit-adventurers/Knight", onDisk: true });
      expect(existsSync(join(game, "public", "models", "library"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("--provision without --game is refused", () => {
    const run = spawnSync(process.execPath, [cli, "find", "knight", "--provision"], { encoding: "utf8", timeout: 60_000 });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("--game");
  });
});
