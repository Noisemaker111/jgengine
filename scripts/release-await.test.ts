import { describe, expect, test } from "bun:test";

import {
  awaitCi,
  awaitPublish,
  failureLine,
  failedJobs,
  pickRun,
  successLine,
  VERIFY_STEP,
  type PublishJob,
  type PublishRun,
  type RegistryCheck,
} from "./release-await";

/** npm already serves every package of the release. */
const served: RegistryCheck = { unserved: async () => [], defects: async () => [] };

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
    const sha = "a".repeat(40);
    // gh lists newest first; 0.51.0 picked the older run of its commit from that order.
    const picked = pickRun([run({ databaseId: 3, headSha: sha }), run({ databaseId: 2, headSha: "b".repeat(40) }), run({ databaseId: 1, headSha: sha })], sha);
    expect(picked?.databaseId).toBe(3);
    expect(pickRun([run({ databaseId: 1, headSha: sha }), run({ databaseId: 3, headSha: sha })], sha)?.databaseId).toBe(3);
  });

  test("a commit with no publish run is null, not the newest run of anything", () => {
    expect(pickRun([run({ headSha: "b".repeat(40) })], "a".repeat(40))).toBeNull();
  });
});

describe("waiting on beta's CI before the tag", () => {
  const ciRuns = (...runs: { status: string; conclusion: string | null }[]) =>
    JSON.stringify({ workflow_runs: runs.map((entry, i) => ({ id: i + 1, head_sha: "a".repeat(40), event: "push", html_url: `u${i}`, ...entry })) });

  test("a run still going is waited on until it is green", async () => {
    let reads = 0;
    const result = await awaitCi({
      sha: "a".repeat(40),
      gh: () => {
        reads += 1;
        return { status: 0, stdout: reads < 3 ? ciRuns({ status: "in_progress", conclusion: null }) : ciRuns({ status: "completed", conclusion: "success" }), stderr: "" };
      },
      sleep: async () => {},
    });
    expect(result.ok).toBe(true);
    expect(reads).toBe(3);
  });

  test("a red run stops the release before anything is tagged", async () => {
    let slept = 0;
    const result = await awaitCi({
      sha: "a".repeat(40),
      gh: () => ({ status: 0, stdout: ciRuns({ status: "completed", conclusion: "failure" }), stderr: "" }),
      sleep: async () => {
        slept += 1;
      },
    });
    expect(result.ok).toBe(false);
    expect(result.line).toContain("nothing was tagged");
    expect(slept).toBe(0);
  });

  test("a commit CI never picked up is reported once the grace window passes", async () => {
    let clock = 0;
    const result = await awaitCi({
      sha: "a".repeat(40),
      gh: () => ({ status: 0, stdout: ciRuns(), stderr: "" }),
      graceMs: 60_000,
      intervalMs: 10_000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    expect(result.ok).toBe(false);
    expect(result.line).toContain("no ci.yml run for aaaaaaaa 60s after it reached beta");
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
      registry: served,
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
      registry: served,
      sleep: async () => {},
      log: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(1);
    expect(result.line).toContain('job "publish"');
  });

  test("npm not serving the release is waited on, bounded, and then names what it lacks", async () => {
    const sha = "a".repeat(40);
    let clock = 0;
    let asked = 0;
    const result = await awaitPublish({
      version: "0.38.4",
      sha,
      gh: ghFor([run({ headSha: sha })]),
      registry: {
        unserved: async () => {
          asked += 1;
          return ["@jgengine/core@0.38.4"];
        },
        defects: async () => [],
      },
      registryTimeoutMs: 60_000,
      intervalMs: 10_000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      log: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.line).toContain("after 1 minutes npm does not serve @jgengine/core@0.38.4");
    expect(asked).toBe(7);
  });

  test("a run whose registry check gave up while npm processed core answers published once npm serves it", async () => {
    // 0.49.0: every package uploaded at 03:01, the run's 5-minute check gave up at 03:08:32, and npm
    // served core at 03:08:56. The release was fine; this wait now says so instead of failing it.
    const sha = "f".repeat(40);
    let clock = 0;
    const servedAt = 24_000;
    const gh = (args: readonly string[]) => {
      if (args[0] === "run") return { status: 0, stdout: JSON.stringify([run({ headSha: sha, conclusion: "failure" })]), stderr: "" };
      if (args[1]?.endsWith("/jobs")) return { status: 0, stdout: JSON.stringify({ jobs: [{ id: 9, name: "publish", conclusion: "failure", html_url: "u" }] }), stderr: "" };
      if (args[1]?.endsWith("/jobs/9")) return { status: 0, stdout: JSON.stringify({ steps: [{ name: VERIFY_STEP, conclusion: "failure" }] }), stderr: "" };
      return { status: 0, stdout: JSON.stringify(run({ headSha: sha, conclusion: "failure" })), stderr: "" };
    };
    let checked = false;
    const result = await awaitPublish({
      version: "0.49.0",
      sha,
      gh,
      registry: {
        unserved: async () => (clock >= servedAt ? [] : ["@jgengine/core@0.49.0"]),
        defects: async () => {
          checked = true;
          return [];
        },
      },
      intervalMs: 10_000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      log: () => {},
    });
    expect(result.ok).toBe(true);
    expect(result.line).toBe("release: published @jgengine/core@0.49.0 (publish run 40107700057), served by npm 30s after the run");
    expect(checked).toBe(true);
  });

  test("a run whose registry check gave up still fails when what npm serves does not install", async () => {
    const sha = "f".repeat(40);
    const gh = (args: readonly string[]) => {
      if (args[0] === "run") return { status: 0, stdout: JSON.stringify([run({ headSha: sha, conclusion: "failure" })]), stderr: "" };
      if (args[1]?.endsWith("/jobs")) return { status: 0, stdout: JSON.stringify({ jobs: [{ id: 9, name: "publish", conclusion: "failure", html_url: "u" }] }), stderr: "" };
      if (args[1]?.endsWith("/jobs/9")) return { status: 0, stdout: JSON.stringify({ steps: [{ name: VERIFY_STEP, conclusion: "failure" }] }), stderr: "" };
      return { status: 0, stdout: JSON.stringify(run({ headSha: sha, conclusion: "failure" })), stderr: "" };
    };
    const result = await awaitPublish({
      version: "0.49.0",
      sha,
      gh,
      registry: { unserved: async () => [], defects: async () => ["@jgengine/core@0.49.0: ./data/definedOnly resolves to dist/data/definedOnly.js, which the tarball does not contain"] },
      sleep: async () => {},
      log: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.line).toContain("is on npm but does not install: @jgengine/core@0.49.0: ./data/definedOnly");
  });

  test("a run that failed at any other step is a failure without waiting on npm", async () => {
    const sha = "f".repeat(40);
    let asked = false;
    const gh = (args: readonly string[]) => {
      if (args[0] === "run") return { status: 0, stdout: JSON.stringify([run({ headSha: sha, conclusion: "failure" })]), stderr: "" };
      if (args[1]?.endsWith("/jobs")) return { status: 0, stdout: JSON.stringify({ jobs: [{ id: 9, name: "publish", conclusion: "failure", html_url: "u" }] }), stderr: "" };
      if (args[1]?.endsWith("/jobs/9")) return { status: 0, stdout: JSON.stringify({ steps: [{ name: "Refuse to publish a commit behind beta", conclusion: "failure" }] }), stderr: "" };
      return { status: 0, stdout: JSON.stringify(run({ headSha: sha, conclusion: "failure" })), stderr: "" };
    };
    const result = await awaitPublish({
      version: "0.49.0",
      sha,
      gh,
      registry: { unserved: async () => { asked = true; return []; }, defects: async () => [] },
      sleep: async () => {},
      log: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.line).toContain('at step "Refuse to publish a commit behind beta"');
    expect(asked).toBe(false);
  });

  test("a tag that never queued a run is reported by name, not waited on", async () => {
    const result = await awaitPublish({
      version: "0.38.4",
      sha: "c".repeat(40),
      gh: ghFor([], []),
      graceMs: 0,
      sleep: async () => {},
      log: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.line).toContain("no publish.yml run for cccccccc 0s after v0.38.4 was pushed");
  });
});
