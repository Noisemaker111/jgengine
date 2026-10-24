import { describe, expect, test } from "bun:test";

import {
  awaitPublish,
  failureLine,
  failedJobs,
  parseAwaitArgs,
  pickRun,
  registryVersion,
  successLine,
  type PublishJob,
  type PublishRun,
} from "./release-await";

const run = (overrides: Partial<PublishRun> = {}): PublishRun => ({
  databaseId: 40107700057,
  status: "completed",
  conclusion: "success",
  headSha: "a".repeat(40),
  url: "https://github.com/Noisemaker111/jgengine/actions/runs/40107700057",
  ...overrides,
});

const job = (name: string, conclusion: string | null): PublishJob => ({
  name,
  conclusion,
  htmlUrl: `https://github.com/Noisemaker111/jgengine/actions/runs/1/job/${name}`,
});

describe("which run is this release's", () => {
  test("the newest run on the release commit wins, so a re-run replaces the attempt it retried", () => {
    const shas = "a".repeat(40);
    const picked = pickRun(
      [
        run({ databaseId: 1, headSha: shas }),
        run({ databaseId: 2, headSha: "b".repeat(40) }),
        run({ databaseId: 3, headSha: shas }),
      ],
      shas,
    );
    expect(picked?.databaseId).toBe(3);
  });

  test("a commit with no publish run is null, not the newest run of anything", () => {
    expect(pickRun([run({ headSha: "b".repeat(40) })], "a".repeat(40))).toBeNull();
  });
});

describe("what a lane reads", () => {
  test("success names the version and the run it waited on", () => {
    expect(successLine("0.38.4", 40107700057)).toBe("release: published @jgengine/core@0.38.4 (publish run 40107700057)");
  });

  test("failure names the run and the job that failed", () => {
    const line = failureLine(run({ conclusion: "failure" }), [job("publish", "failure")]);
    expect(line).toContain("publish run 40107700057 failed");
    expect(line).toContain('job "publish"');
    expect(line).toContain("/job/publish");
  });

  test("a run that reported no failed job still names the run", () => {
    const line = failureLine(run({ conclusion: "failure" }), [job("publish", "success")]);
    expect(line).toContain("no failed job reported");
    expect(line).toContain("runs/40107700057");
  });

  test("only a failed job is a failure", () => {
    expect(failedJobs([job("a", "success"), job("b", "failure"), job("c", null)]).map((entry) => entry.name)).toEqual(["b"]);
  });
});

describe("waiting on the publish run", () => {
  const ghFor = (runs: PublishRun[], jobs: PublishJob[] = []) => (args: readonly string[]) => {
    if (args[0] === "run") return { status: 0, stdout: JSON.stringify(runs), stderr: "" };
    if (args[0] === "api" && args[1]?.endsWith("/jobs")) return { status: 0, stdout: JSON.stringify({ jobs }), stderr: "" };
    if (args[0] === "api") return { status: 0, stdout: JSON.stringify(runs[0] ?? {}), stderr: "" };
    return { status: 1, stdout: "", stderr: "unexpected" };
  };

  test("a published version returns the line with the run id", async () => {
    const sha = "a".repeat(40);
    const result = await awaitPublish({
      version: "0.38.4",
      sha,
      gh: ghFor([run({ headSha: sha })]),
      npmView: () => ({ status: 0, stdout: "0.38.4\n", stderr: "" }),
      sleep: async () => {},
      log: () => {},
    });
    expect(result.ok).toBe(true);
    expect(result.code).toBe(0);
    expect(result.line).toBe("release: published @jgengine/core@0.38.4 (publish run 40107700057)");
  });

  test("a failed publish names the job and exits 1", async () => {
    const sha = "a".repeat(40);
    const result = await awaitPublish({
      version: "0.38.4",
      sha,
      gh: ghFor([run({ headSha: sha, conclusion: "failure" })], [job("publish", "failure")]),
      npmView: () => ({ status: 0, stdout: "0.38.3\n", stderr: "" }),
      sleep: async () => {},
      log: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(1);
    expect(result.line).toContain('job "publish"');
  });

  test("a run that succeeded without the version on npm is a failure that names both", async () => {
    const sha = "a".repeat(40);
    const result = await awaitPublish({
      version: "0.38.4",
      sha,
      gh: ghFor([run({ headSha: sha })]),
      npmView: () => ({ status: 0, stdout: "0.38.3\n", stderr: "" }),
      sleep: async () => {},
      log: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.line).toContain("succeeded but npm answers 0.38.3 for @jgengine/core, not 0.38.4");
  });

  test("a merge commit that never queued a run is reported by name, not waited on", async () => {
    const result = await awaitPublish({
      version: "0.38.4",
      sha: "c".repeat(40),
      gh: ghFor([], []),
      graceMs: 0,
      sleep: async () => {},
      log: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.line).toContain("no publish.yml run for cccccccc on main");
  });
});

describe("arguments", () => {
  test("a version, a run id and a sha are each read", () => {
    expect(parseAwaitArgs(["0.38.4"])).toMatchObject({ version: "0.38.4" });
    expect(parseAwaitArgs(["--run", "40107700057", "--version", "0.38.4"])).toMatchObject({
      version: "0.38.4",
      runId: 40107700057,
    });
    expect(parseAwaitArgs(["--sha", "abc"]).sha).toBe("abc");
  });

  test("npm answering nothing is not a version", () => {
    expect(registryVersion(() => ({ status: 1, stdout: "", stderr: "E404" }))).toBeNull();
    expect(registryVersion(() => ({ status: 0, stdout: "  \n", stderr: "" }))).toBeNull();
  });
});
