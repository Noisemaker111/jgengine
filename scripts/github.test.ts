import { describe, expect, test } from "bun:test";

import { OUTAGE_ATTEMPTS, gitHub, repoFromRemote, type GhRun } from "./github";
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
      github.mergePull(1, "abc"),
      github.closePull(1, "c"),
      github.branchRuns("beta", 3),
      github.branchHead("agent/x"),
      github.deleteBranch("agent/x"),
    ];
    expect(seen.length).toBe(results.length);
    expect(seen.every((args) => args[0] === "api")).toBe(true);
    expect(results.map((result) => (result.ok ? "ok" : result.error))).toEqual(results.map(() => "HTTP 403: Resource not accessible by integration"));
  });

  test("a request GitHub's outage answered is tried again, a few times at most; a refusal is not", () => {
    const answers: GhRun[] = [
      { status: 1, stdout: "", stderr: "gh: HTTP 500" },
      { status: 1, stdout: "", stderr: "gh: Server Error (HTTP 502)" },
      { status: 0, stdout: JSON.stringify({ number: 3, state: "open", head: { ref: "agent/x", sha: "s" }, base: { ref: "beta" } }), stderr: "" },
    ];
    let calls = 0;
    const pauses: number[] = [];
    const recovered = gitHub(() => answers[calls++]!, "me/game", (ms) => pauses.push(ms)).pull(3);
    expect(recovered.ok && recovered.value.headRefName).toBe("agent/x");
    expect(pauses.length).toBe(2);

    let down = 0;
    const outage = gitHub(() => (down++, { status: 1, stdout: "", stderr: "gh: HTTP 503" }), "me/game", () => {}).pull(3);
    expect(outage).toEqual({ ok: false, error: "gh: HTTP 503" });
    expect(down).toBe(OUTAGE_ATTEMPTS);

    let refusals = 0;
    const refused = gitHub(() => (refusals++, { status: 1, stdout: "", stderr: "HTTP 405: Pull Request is not mergeable" }), "me/game", () => {}).mergePull(3, "abc");
    expect(refused.ok).toBe(false);
    expect(refusals).toBe(1);
  });

  test("a PR reads its state, head, merge state and labels from the REST answer", () => {
    const api = fakeGitHub({
      pulls: [
        { number: 5, head: "agent/x", sha: "s5", labels: ["bug"], mergeableState: "behind", draft: true },
        { number: 6, head: "agent/y", state: "closed", merged: true, crossRepo: true },
      ],
    });
    const open = api.github.pull(5);
    expect(open.ok && open.value).toMatchObject({ state: "OPEN", headRefName: "agent/x", headRefOid: "s5", mergeStateStatus: "BEHIND", labels: ["bug"], isDraft: true });
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

  test("a branch is read and deleted as a ref, its slashes kept, and a missing one reads as gone", () => {
    const api = fakeGitHub({ pulls: [{ number: 8, head: "agent/x", sha: "s8" }] });
    expect(api.github.branchHead("agent/x")).toEqual({ ok: true, value: "s8" });
    expect(api.github.deleteBranch("agent/x")).toEqual({ ok: true, value: null });
    expect(api.calls.at(-1)).toMatchObject({ method: "DELETE", path: "repos/me/game/git/refs/heads/agent/x" });
    expect(api.deleted).toEqual(["agent/x"]);
    expect(api.github.branchHead("agent/x")).toEqual({ ok: true, value: null });
    const again = api.github.deleteBranch("agent/x");
    expect(again.ok).toBe(false);
  });
});
