import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { SHARDS } from "./test-shard";

/**
 * The publish workflow used to run `bun test packages` in the job that then built
 * and published: 255 s of test time before the release could start. It now runs the
 * same files as CI's `test` job, one shard per job, and publishes only when every
 * shard passed. These read the workflow so the split cannot quietly drift back to
 * one process or stop covering a shard.
 */
const workflow = readFileSync(fileURLToPath(new URL("../.github/workflows/publish.yml", import.meta.url)), "utf8");

function matrixShards(): string[] {
  const list = /shard: \[([^\]]+)\]/.exec(workflow)?.[1] ?? "";
  return list.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

describe("publish workflow", () => {
  test("runs every test shard CI runs, so a file no shard covers fails the same way", () => {
    expect(matrixShards()).toEqual(SHARDS.map((shard) => shard.name));
  });

  test("a shard runs through scripts/test-shard.ts, which owns the split and its preparation", () => {
    expect(workflow).toContain("bun scripts/test-shard.ts ${{ matrix.shard }}");
  });

  test("the one-process package suite is gone from the publish job", () => {
    expect(/^ {6}- run: bun test/m.test(workflow)).toBe(false);
  });

  test("publishing needs the shards, so a red shard stops the release instead of publishing over it", () => {
    expect(/^ {2}publish:\n {4}needs: \[test\]$/m.test(workflow)).toBe(true);
    expect(/^ {2}test:\n {4}runs-on: /m.test(workflow)).toBe(true);
  });
});
