import { expect, test } from "bun:test";

import { graphqlRefused, repoFromRemote, withRestFallback } from "./gh-rest";
import type { GhRun } from "./gh-rest";
import { ensurePr } from "./land";
import { readView, readyPrs } from "./land-queue";
import type { PrRow } from "./land-queue";

const REFUSED: GhRun = { status: 1, stdout: "", stderr: "HTTP 403: Forbidden (https://api.github.com/graphql)" };

/** A GitHub that refuses every GraphQL `gh pr` call and serves REST from memory. */
function cloudGithub() {
  const calls: string[][] = [];
  const pulls: { number: number; head: { ref: string | undefined } }[] = [];
  const labels = new Map<number, string[]>();
  const runner = (args: string[]): GhRun => {
    calls.push(args);
    if (args[0] === "pr") return REFUSED;
    if (args[0] !== "api") return { status: 1, stdout: "", stderr: `unexpected ${args.join(" ")}` };
    const method = args[1] === "-X" ? args[2] : "GET";
    const path = args[1] === "-X" ? args[3] : args[1];
    const fields = new Map<string, string>();
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] !== "-f") continue;
      const pair = args[i + 1] ?? "";
      fields.set(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1));
    }
    const answer = (value: unknown): GhRun => ({ status: 0, stdout: JSON.stringify(value), stderr: "" });
    if (method === "POST" && path === "repos/me/game/pulls") {
      const number = 100 + pulls.length;
      const pull = {
        number,
        html_url: `https://github.com/me/game/pull/${number}`,
        state: "open",
        title: fields.get("title"),
        body: fields.get("body"),
        mergeable_state: "behind",
        auto_merge: null,
        labels: [],
        head: { ref: fields.get("head"), sha: "abc123", repo: { full_name: "me/game" } },
        base: { ref: fields.get("base"), repo: { full_name: "me/game" } },
      };
      pulls.push(pull);
      return answer(pull);
    }
    if (method === "GET" && path?.startsWith("repos/me/game/pulls?")) {
      const query = new URLSearchParams(path.slice(path.indexOf("?") + 1));
      const head = query.get("head")?.split(":")[1];
      return answer(
        pulls
          .filter((pull) => head === undefined || pull.head.ref === head)
          .map((pull) => ({ ...pull, labels: (labels.get(pull.number) ?? []).map((name) => ({ name })) })),
      );
    }
    const one = /^repos\/me\/game\/pulls\/(\d+)$/.exec(path ?? "");
    if (method === "GET" && one !== null) {
      const pull = pulls.find((entry) => entry.number === Number(one[1]));
      return pull === undefined ? { status: 1, stdout: "", stderr: "HTTP 404" } : answer({ ...pull, labels: (labels.get(Number(one[1])) ?? []).map((name) => ({ name })) });
    }
    const labelPath = /^repos\/me\/game\/issues\/(\d+)\/labels$/.exec(path ?? "");
    if (method === "POST" && labelPath !== null) {
      const number = Number(labelPath[1]);
      labels.set(number, [...(labels.get(number) ?? []), fields.get("labels[]") ?? ""]);
      return answer([]);
    }
    if (method === "GET" && path === "repos/me/game/commits/abc123/check-runs?per_page=100") {
      return answer({
        check_runs: [
          { name: "quick", status: "completed", conclusion: "success", details_url: "https://github.com/me/game/actions/runs/7/job/1", head_sha: "abc123" },
          { name: "test (a)", status: "in_progress", conclusion: null, details_url: "https://github.com/me/game/actions/runs/7/job/2", head_sha: "abc123" },
        ],
      });
    }
    return { status: 1, stdout: "", stderr: `no fake for ${method} ${path}` };
  };
  return { runner, calls, labels };
}

test("a 403 from GraphQL is told apart from other gh failures", () => {
  expect(graphqlRefused(REFUSED)).toBe(true);
  expect(graphqlRefused({ status: 1, stdout: "", stderr: "GraphQL: Resource not accessible by integration (createPullRequest)" })).toBe(true);
  expect(graphqlRefused({ status: 1, stdout: "", stderr: "GraphQL: Pull request is not mergeable (mergePullRequest)" })).toBe(false);
  expect(graphqlRefused({ status: 0, stdout: "403", stderr: "" })).toBe(false);
});

test("the repository is read from github.com and proxy remotes alike", () => {
  expect(repoFromRemote("https://github.com/Noisemaker111/jgengine.git\n")).toBe("Noisemaker111/jgengine");
  expect(repoFromRemote("git@github.com:Noisemaker111/jgengine.git")).toBe("Noisemaker111/jgengine");
  expect(repoFromRemote("http://local_proxy@127.0.0.1:43123/git/Noisemaker111/jgengine")).toBe("Noisemaker111/jgengine");
});

test("land opens its PR and hands it to the queue over REST when GraphQL is refused", () => {
  const github = cloudGithub();
  const notes: string[] = [];
  const gh = withRestFallback(github.runner, () => "me/game", (line) => notes.push(line));

  const pr = ensurePr({
    args: { base: "beta", title: "Fixed: a thing" },
    branch: "fix/thing",
    summary: "Fixed: a thing",
    body: { text: "Fixed: a thing\n", explicit: true },
    gh,
    log: () => {},
  });
  expect(pr).toEqual({ number: 100, url: "https://github.com/me/game/pull/100" });
  expect(notes).toHaveLength(1);

  // Auto-merge has no REST endpoint, so land falls through to the queue label, which lands over REST.
  expect(gh(["pr", "merge", "100", "--auto", "--merge"]).status).not.toBe(0);
  expect(gh(["pr", "edit", "100", "--add-label", "land:queue"]).status).toBe(0);
  expect(github.labels.get(100)).toEqual(["land:queue"]);

  // A second close finds the same PR instead of opening another.
  const again = ensurePr({
    args: { base: "beta" },
    branch: "fix/thing",
    summary: "Fixed: a thing",
    body: { text: "Fixed: a thing\n", explicit: false },
    gh,
    log: () => {},
  });
  expect(again?.number).toBe(100);

  // Only the first `gh pr` call tried GraphQL; every later one went straight to REST.
  expect(github.calls.filter((call) => call[0] === "pr")).toHaveLength(1);
});

test("the queue reads a labelled PR's state and checks over REST", () => {
  const github = cloudGithub();
  const gh = withRestFallback(github.runner, () => "me/game");
  ensurePr({ args: { base: "beta" }, branch: "fix/thing", summary: "s", body: { text: "b", explicit: true }, gh, log: () => {} });
  gh(["pr", "edit", "100", "--add-label", "land:queue"]);

  const view = readView(gh, 100);
  expect(view?.state).toBe("OPEN");
  expect(view?.headRefOid).toBe("abc123");
  expect(view?.mergeStateStatus).toBe("BEHIND");
  expect(view?.statusCheckRollup?.map((entry) => [entry.name, entry.conclusion ?? entry.status])).toEqual([
    ["quick", "SUCCESS"],
    ["test (a)", "IN_PROGRESS"],
  ]);

  const listed = gh(["pr", "list", "--base", "beta", "--state", "open", "--json", "number,url,headRefName,isDraft,isCrossRepository,updatedAt,autoMergeRequest,labels"]);
  const rows = JSON.parse(listed.stdout) as PrRow[]; // type-escape: gh pr list JSON, as the queue reads it
  expect(readyPrs(rows, "land:queue").map((pr) => [pr.number, pr.branch, pr.signal])).toEqual([[100, "fix/thing", "label"]]);
});
