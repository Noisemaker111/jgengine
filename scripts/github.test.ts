import { describe, expect, test } from "bun:test";

import { gitHub, repoFromRemote, type GhRun } from "./github";
import { fakeGitHub } from "./github.fixture";

describe("repoFromRemote", () => {
  test("reads owner/repo from https, ssh, a proxy path and the bare form", () => {
    expect(repoFromRemote("https://github.com/Noisemaker111/jgengine.git\n")).toBe("Noisemaker111/jgengine");
    expect(repoFromRemote("git@github.com:owner/repo.git")).toBe("owner/repo");
    expect(repoFromRemote("http://local_proxy@127.0.0.1:41937/git/Noisemaker111/jgengine")).toBe("Noisemaker111/jgengine");
    expect(repoFromRemote("owner/repo")).toBe("owner/repo");
    expect(repoFromRemote("")).toBeNull();
  });
});

describe("the GitHub client", () => {
  test("every call is `gh api`, and GitHub's own refusal comes back as the error", () => {
    const seen: string[][] = [];
    const refused: GhRun = { status: 1, stdout: "", stderr: "HTTP 403: Resource not accessible by integration\n" };
    const github = gitHub((args) => {
      seen.push(args);
      return refused;
    }, "me/game");
    const results = [
      github.listPulls({ state: "open" }),
      github.pull(1),
      github.checks("abc"),
      github.createPull({ base: "beta", head: "agent/x", title: "t", body: "b" }),
      github.editPull(1, { body: "b" }),
      github.addLabel(1, "land:queue"),
      github.mergePull(1),
      github.closePull(1, "c"),
      github.branchRuns("beta", 3),
      github.rerunRun(9),
    ];
    expect(seen.length).toBe(results.length);
    expect(seen.every((args) => args[0] === "api")).toBe(true);
    expect(results.map((result) => (result.ok ? "ok" : result.error))).toEqual(results.map(() => "HTTP 403: Resource not accessible by integration"));
  });

  test("a PR reads its state, head, merge state and labels from the REST answer", () => {
    const api = fakeGitHub({
      pulls: [
        { number: 5, head: "agent/x", sha: "s5", labels: ["land:queue"], mergeableState: "behind", draft: true },
        { number: 6, head: "agent/y", state: "closed", merged: true, crossRepo: true },
      ],
    });
    const open = api.github.pull(5);
    expect(open.ok && open.value).toMatchObject({ state: "OPEN", headRefName: "agent/x", headRefOid: "s5", mergeStateStatus: "BEHIND", labels: ["land:queue"], isDraft: true });
    const merged = api.github.pull(6);
    expect(merged.ok && merged.value).toMatchObject({ state: "MERGED", isCrossRepository: true });
    const listed = api.github.listPulls({ state: "all" });
    expect(listed.ok && listed.value.map((pull) => [pull.number, pull.mergeStateStatus])).toEqual([
      [6, "UNKNOWN"],
      [5, "UNKNOWN"],
    ]);
  });

  test("a branch's PR is asked for as owner:branch, as REST requires", () => {
    const api = fakeGitHub({ repo: "me/game", pulls: [{ number: 7, head: "agent/x" }] });
    const found = api.github.listPulls({ head: "agent/x", state: "open" });
    expect(found.ok && found.value.map((pull) => pull.number)).toEqual([7]);
    expect(api.calls[0]?.path).toContain(`head=${encodeURIComponent("me:agent/x")}`);
  });
});
