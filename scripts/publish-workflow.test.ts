import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { decideCiRuns, type CiRun } from "./check-release-ci";

/**
 * A release publishes a commit `beta` already proved: the publish job starts when that commit's
 * CI finishes and reads its verdict, instead of running the whole suite a second time (#2279).
 * One environment-sensitive test used to block a release the PR had passed. These read the
 * workflow, so the duplicate suite cannot come back and no release-only check can quietly leave.
 */
const workflow = readFileSync(fileURLToPath(new URL("../.github/workflows/publish.yml", import.meta.url)), "utf8");

describe("publish workflow", () => {
  test("starts from the CI run of the commit it publishes, not a second run of the suite", () => {
    expect(/^ {2}workflow_run:\n {4}workflows: \[CI\]\n {4}types: \[completed\]\n {4}branches: \[main\]$/m.test(workflow)).toBe(true);
    expect(/^ {2}workflow_dispatch:$/m.test(workflow)).toBe(true);
    // A push trigger would start the release again beside the workflow_run one and bypass the verdict.
    expect(/^ {2}push:/m.test(workflow)).toBe(false);
  });

  test("no test shard runs in the release, so no environment-sensitive test can block it", () => {
    expect(/shard: \[/.test(workflow)).toBe(false);
    expect(workflow).not.toContain("scripts/test-shard.ts");
    expect(/^ {6}- run: bun test/m.test(workflow)).toBe(false);
  });

  test("reads the verdict for the commit CI judged, not whatever the default branch points at", () => {
    expect(workflow).toContain("ref: ${{ github.event.workflow_run.head_sha || github.sha }}");
    expect(workflow).toContain("bun scripts/check-release-ci.ts --sha \"$SHA\"");
  });

  test("keeps every check a release alone can make", () => {
    for (const step of [
      "bun run check-artifacts",
      "bun run check-release-set",
      "bun run check-types:sdk",
      "bun run check:consumer-types",
      "bun run check:release-artifacts",
      "bun run build",
      "bun scripts/check-release-ancestor.ts",
    ]) {
      expect(workflow).toContain(step);
    }
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
