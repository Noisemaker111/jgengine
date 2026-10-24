import { describe, expect, test } from "bun:test";

import { armState, isArmed, type SweepPr } from "./pr-sweep";

function pr(overrides: Partial<SweepPr> = {}): SweepPr {
  return {
    number: 2289,
    title: "release: make shipping an unimportable version impossible",
    headRefName: "agent/lane-release-integrity",
    isDraft: false,
    mergeable: "MERGEABLE",
    autoMergeRequest: { enabledAt: "2026-10-23T23:55:43Z" },
    statusCheckRollup: [],
    ...overrides,
  };
}

describe("armed PR sweep", () => {
  test("an armed PR with a failed check is red and names the check", () => {
    const state = armState(
      pr({
        statusCheckRollup: [
          { __typename: "CheckRun", name: "test (b)", status: "COMPLETED", conclusion: "FAILURE", detailsUrl: "https://example.test/job" },
          { __typename: "CheckRun", name: "quick", status: "COMPLETED", conclusion: "SUCCESS" },
        ],
      }),
    );
    expect(state.red).toEqual(["test (b) failure https://example.test/job"]);
    expect(state.waiting).toEqual([]);
  });

  test("an armed PR waiting on a running check is not red", () => {
    const state = armState(
      pr({
        statusCheckRollup: [
          { __typename: "CheckRun", name: "types", status: "IN_PROGRESS", conclusion: "" },
          { __typename: "CheckRun", name: "quick", status: "COMPLETED", conclusion: "SUCCESS" },
        ],
      }),
    );
    expect(state.red).toEqual([]);
    expect(state.waiting).toEqual(["1 check(s) still running"]);
  });

  test("a timed-out check and a commit status failure both count as red", () => {    const state = armState(
      pr({
        statusCheckRollup: [
          { __typename: "CheckRun", name: "test (b)", status: "COMPLETED", conclusion: "TIMED_OUT" },
          { __typename: "StatusContext", context: "ci/legacy", state: "ERROR" },
        ],
      }),
    );
    expect(state.red).toEqual(["test (b) timed_out", "ci/legacy error"]);
  });

  test("a conflict or a draft blocks an armed PR even with every check green", () => {
    const green = [{ __typename: "CheckRun", name: "quick", status: "COMPLETED", conclusion: "SUCCESS" }];
    expect(armState(pr({ mergeable: "CONFLICTING", statusCheckRollup: green })).red).toEqual(["merge conflict with beta"]);
    expect(armState(pr({ isDraft: true, statusCheckRollup: green })).red).toEqual(["still a draft"]);
  });

  test("a cancelled run superseded by a newer push is waiting, not red", () => {
    const state = armState(
      pr({
        statusCheckRollup: [
          { __typename: "CheckRun", name: "types", status: "COMPLETED", conclusion: "CANCELLED" },
          { __typename: "CheckRun", name: "quick", status: "COMPLETED", conclusion: "SUCCESS" },
        ],
      }),
    );
    expect(state.red).toEqual([]);
    expect(state.waiting).toEqual(["1 cancelled check(s) from a superseded run"]);
  });

  test("checks that have not been created yet are waiting, not red", () => {
    expect(armState(pr({ statusCheckRollup: [] }))).toEqual({ red: [], waiting: ["no checks reported yet"] });
  });

  test("only a PR with an auto-merge request counts as armed", () => {
    expect(isArmed(pr())).toBe(true);
    expect(isArmed(pr({ autoMergeRequest: null }))).toBe(false);
    expect(isArmed(pr({ autoMergeRequest: undefined }))).toBe(false);
  });
});
