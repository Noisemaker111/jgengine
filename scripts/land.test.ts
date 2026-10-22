import { expect, test } from "bun:test";
import { checkVerdict, chooseBody, formatFailures, landRefusal, parseArgs, pickFragment } from "./land";

test("parses flags with values and defaults the base to beta", () => {
  expect(parseArgs([])).toEqual({ base: "beta" });
  expect(parseArgs(["--verify", "bun run ship:preflight"])).toEqual({
    base: "beta",
    verify: "bun run ship:preflight",
  });
  expect(parseArgs(["--title", "Menus", "--body-file", ".scratch/body.md", "--base", "beta"])).toEqual({
    base: "beta",
    title: "Menus",
    bodyFile: ".scratch/body.md",
  });
});

test("rejects a flag without a value and an unknown flag instead of guessing", () => {
  expect(() => parseArgs(["--verify"])).toThrow("--verify needs a value");
  expect(() => parseArgs(["--verify", "--title"])).toThrow("--verify needs a value");
  expect(() => parseArgs(["--bogus"])).toThrow("unknown argument --bogus");
});

test("takes the fragment named after the branch even when another fragment is newer", () => {
  const files = [
    { path: "changes/other-work.md", text: "### Added\n\n- Other.\n", mtimeMs: 900 },
    { path: "changes/agent-lane-a-a1-12-land-and-shard.md", text: "### Changed\n\n- Mine.\n", mtimeMs: 100 },
  ];
  expect(pickFragment(files, "agent/lane-a-a1-12-land-and-shard")?.text).toContain("Mine.");
});

test("falls back to the newest fragment when no fragment matches the branch", () => {
  const files = [
    { path: "changes/old.md", text: "old", mtimeMs: 100 },
    { path: "changes/new.md", text: "new", mtimeMs: 900 },
  ];
  expect(pickFragment(files, "agent/somewhere-else")?.text).toBe("new");
  expect(pickFragment([], "agent/somewhere-else")).toBeNull();
});

test("builds the PR body from fragment, then body file, then summary", () => {
  expect(chooseBody({ fragment: "### Added\n\n- Note.\n", bodyFile: "file body", summary: "summary" })).toBe(
    "### Added\n\n- Note.",
  );
  expect(chooseBody({ fragment: "  \n", bodyFile: "file body", summary: "summary" })).toBe("file body");
  expect(chooseBody({ bodyFile: null, summary: " summary " })).toBe("summary");
});

test("maps a green check list to no failures", () => {
  expect(
    checkVerdict([
      { name: "ci", state: "SUCCESS", bucket: "pass" },
      { name: "perf", state: "SKIPPED", bucket: "skipping" },
      { name: "smoke", state: "SUCCESS" },
    ]),
  ).toEqual({ failures: [], pending: [] });
});

test("names every failing check with its url and lists pending separately", () => {
  const verdict = checkVerdict([
    { name: "ci", state: "SUCCESS", bucket: "pass" },
    { name: "test (core-rest)", state: "FAILURE", bucket: "fail", link: "https://example.test/job/1" },
    { name: "quick", state: "CANCELLED" },
    { name: "perf", state: "PENDING", bucket: "pending" },
  ]);
  expect(verdict.failures).toEqual([
    { name: "test (core-rest)", url: "https://example.test/job/1" },
    { name: "quick", url: "" },
  ]);
  expect(verdict.pending).toEqual(["perf"]);
  expect(formatFailures(verdict.failures)).toEqual([
    "  test (core-rest) https://example.test/job/1",
    "  quick",
  ]);
});

test("a watch timeout with only pending checks blocks the merge", () => {
  const verdict = checkVerdict([{ name: "test (ui)", state: "IN_PROGRESS", bucket: "pending" }]);
  expect(verdict.failures).toEqual([]);
  expect(verdict.pending).toEqual(["test (ui)"]);
});

test("a cancelled check blocks the merge like a failure", () => {
  const verdict = checkVerdict([{ name: "test (sdk)", state: "CANCELLED", bucket: "cancel", link: "u" }]);
  expect(verdict.failures).toEqual([{ name: "test (sdk)", url: "u" }]);
  expect(verdict.pending).toEqual([]);
});

test("refuses main, the base branch and a dirty tree", () => {
  expect(landRefusal("main", "", "beta")).toContain("refusing to land main");
  expect(landRefusal("beta", "", "beta")).toContain("refusing to land beta");
  expect(landRefusal("agent/x", " M scripts/land.ts\n", "beta")).toContain("dirty tree");
  expect(landRefusal("agent/x", "  \n", "beta")).toBeNull();
});
