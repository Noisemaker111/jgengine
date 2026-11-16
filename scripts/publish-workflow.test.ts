import { describe, expect, test } from "bun:test";
import { parseCheckArgs } from "./run-stages";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { decideCiRuns, type CiRun } from "./check-release-ci";

/**
 * A release publishes a commit `beta` already proved: the publish job runs on the release tag and
 * reads that commit's CI verdict, instead of running the whole suite a second time (#2279).
 * One environment-sensitive test used to block a release the PR had passed. These read the
 * workflow, so the duplicate suite cannot come back and no release-only check can quietly leave.
 */
const workflow = readFileSync(fileURLToPath(new URL("../.github/workflows/publish.yml", import.meta.url)), "utf8");

describe("publish workflow", () => {
  test("starts from a release tag only, never a branch push", () => {
    expect(/^ {2}push:\n {4}tags: \["v\*"\]$/m.test(workflow)).toBe(true);
    expect(/^ {2}workflow_dispatch:$/m.test(workflow)).toBe(true);
    expect(workflow).not.toContain("branches:");
    expect(workflow).not.toContain("workflow_run");
  });

  test("no test shard runs in the release, so no environment-sensitive test can block it", () => {
    expect(/shard: \[/.test(workflow)).toBe(false);
    expect(workflow).not.toContain("scripts/test-shard.ts");
    expect(/^ {6}- run: bun test/m.test(workflow)).toBe(false);
  });

  test("reads CI's verdict for the tagged commit, and refuses a tag that names another version", () => {
    expect(workflow).toContain('bun scripts/check-release-ci.ts --sha "$(git rev-parse HEAD)"');
    expect(workflow).toContain('if [ "$GITHUB_REF_NAME" != "v$version" ]; then');
  });

  test("keeps every check a release alone can make", () => {
    for (const step of [
      "bun run check artifacts",
      "bun run check release-set",
      "bun run check --sdk",
      "bun scripts/check-release-artifacts.ts",
      "bun scripts/check-release-ancestor.ts",
    ]) {
      expect(workflow).toContain(step);
    }
    // `check --sdk` builds the packages before the checks that read dist.
    const sdk = parseCheckArgs(["--sdk"]);
    expect(sdk.kind === "plan" && sdk.stages.some((stage) => stage.name === "build")).toBe(true);
  });
});

describe("the release's CI gate", () => {
  const sha = "b7d93b325552a17685a392dc76f511f8e46b07be";
  const run = (over: Partial<CiRun> = {}): CiRun => ({
    id: 1,
    headSha: sha,
    status: "completed",
    conclusion: "success",
    event: "push",
    ...over,
  });

  test("a green CI run on the release commit passes", () => {
    expect(decideCiRuns([run()], sha).ok).toBe(true);
  });

  test("a red CI run on the release commit is refused, naming what it saw", () => {
    const verdict = decideCiRuns([run({ conclusion: "failure" })], sha);
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain("not green");
    expect(verdict.message).toContain(sha.slice(0, 8));
  });

  test("a run still in progress is not a green run", () => {
    const verdict = decideCiRuns([run({ status: "in_progress", conclusion: null })], sha);
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain("in_progress");
  });

  test("another commit's green run is not evidence for this one", () => {
    const verdict = decideCiRuns([run({ headSha: "a".repeat(40) })], sha);
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain("no CI run found");
  });
});
