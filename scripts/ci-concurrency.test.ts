import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The concurrency block decides whether a run finishes. On 24 Oct a push to beta cancelled the
// previous beta run 6 times in 13 minutes: 122 runner-minutes were spent on runs that never
// reached a verdict, and "is beta green" was answered by a run that never finished. CI runs only
// on those two branches now, and never cancels.
const workflow = readFileSync(join(import.meta.dir, "..", ".github", "workflows", "ci.yml"), "utf8");

function concurrencyBlock(text: string): { group: string; cancel: string } {
  const block = /^concurrency:\n((?: {2}.*\n)+)/m.exec(text)?.[1] ?? "";
  return {
    group: /group:\s*(.+)/.exec(block)?.[1]?.trim() ?? "",
    cancel: /cancel-in-progress:\s*(.+)/.exec(block)?.[1]?.trim() ?? "",
  };
}

test("beta and main serialise instead of cancelling, so every push gets a verdict", () => {
  expect(concurrencyBlock(workflow).cancel).toBe("false");
});

test("CI runs on pushes to beta and main, never on a pull request: lane:close's receipt gates a PR", () => {
  const on = /^on:\n((?: {2}.*\n|\s*\n)+?)(?=^\S)/m.exec(workflow)?.[1] ?? "";
  expect(on).toContain("push:");
  expect(on).toMatch(/branches:\s*\[main, beta\]/);
  expect(on).not.toContain("pull_request");
  expect(workflow).not.toMatch(/github\.event\.pull_request|github\.base_ref/);
});

test("the group still keys on the ref, so one branch cannot cancel another", () => {
  expect(concurrencyBlock(workflow).group).toContain("github.ref");
});
