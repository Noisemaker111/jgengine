import { describe, expect, test } from "bun:test";

import {
  EXIT_CANNOT_ANSWER,
  EXIT_CLOSED,
  EXIT_VERIFY_FAILED,
  EXIT_WAITED,
  closeLane,
  isWaitingCall,
  ordinal,
  parseArgs,
  pickSession,
  placement,
  population,
  reportSkeleton,
  waitingGate,
  type AuditSession,
  type LaneIo,
} from "./lane-close";

function session(overrides: Partial<AuditSession> = {}): AuditSession {
  return {
    id: "ses_1",
    title: "Close the lane",
    directory: "/repo",
    spanMs: 38 * 60_000,
    toolMs: 34 * 60_000,
    sleepMs: 0,
    ciWatchMs: 0,
    waitingShare: 0,
    percentile: 61,
    ...overrides,
  };
}

const CI_OK = JSON.stringify({
  ok: true,
  pr: 2278,
  url: "https://github.com/o/r/pull/2278",
  state: "MERGED",
  verdict: "pass",
  counts: { pass: 21, fail: 0, pending: 0 },
  runIds: [40034099879],
});

interface Script {
  verify?: number;
  land?: number;
  ci?: string;
  ciStatus?: number;
  audit?: string;
  auditStatus?: number;
  branch?: string;
  shortstat?: string;
  pr?: number | null;
}

function io(script: Script = {}): LaneIo & { lines: { out: string[]; err: string[] } } {
  const lines = { out: [] as string[], err: [] as string[] };
  const run = (keys: string[]) => ({ status: 0, stdout: "", stderr: "" });
  return {
    lines,
    cwd: "/repo",
    env: {},
    out: (line) => lines.out.push(line),
    err: (line) => lines.err.push(line),
    sh: (argv) => {
      const key = argv.join(" ");
      if (key === "git rev-parse --abbrev-ref HEAD") return { ...run([]), stdout: `${script.branch ?? "agent/x"}\n` };
      if (key === "run verify:fast") return { ...run([]), status: script.verify ?? 0 };
      if (key === "run land") return { ...run([]), status: script.land ?? 0 };
      if (key.startsWith("run ci:status")) {
        return { ...run([]), stdout: script.ci ?? CI_OK, status: script.ciStatus ?? 0 };
      }
      if (key.startsWith("run lane:audit")) {
        return { ...run([]), stdout: script.audit ?? "", stderr: script.auditStatus ? "Script not found lane:audit" : "", status: script.auditStatus ?? 0 };
      }
      if (key.startsWith("gh pr list")) {
        return { ...run([]), stdout: JSON.stringify(script.pr === null ? [] : [{ number: script.pr ?? 2278 }]) };
      }
      if (key.startsWith("git diff --shortstat")) {
        return { ...run([]), stdout: script.shortstat ?? " 3 files changed, 120 insertions(+), 4 deletions(-)\n" };
      }
      return run([]);
    },
  };
}

function audit(sessions: AuditSession[], totals = { sessions: 193 }): string {
  return JSON.stringify({ sessions, totals });
}

describe("the gate is the count, not a percentage", () => {
  test("no wait at all passes", () => {
    const gate = waitingGate(session());
    expect(gate.blocked).toBe(false);
    expect(gate.sleepMs).toBe(0);
    expect(gate.ciWatchMs).toBe(0);
  });

  test("one sleep call blocks, however short", () => {
    const gate = waitingGate(
      session({ sleepMs: 2_000, calls: [{ command: "Start-Sleep -Seconds 2", ms: 2_000 }] }),
    );
    expect(gate.blocked).toBe(true);
    expect(gate.calls).toEqual([{ command: "Start-Sleep -Seconds 2", ms: 2_000 }]);
  });

  test("one CI watch blocks, however short", () => {
    const gate = waitingGate(
      session({ ciWatchMs: 5_000, longest: [{ command: "gh pr checks 12 --watch", ms: 5_000 }] }),
    );
    expect(gate.blocked).toBe(true);
    expect(gate.calls.map((call) => call.command)).toEqual(["gh pr checks 12 --watch"]);
  });

  test("sleep and watch are told apart from ordinary work", () => {
    expect(isWaitingCall({ command: "Start-Sleep -Milliseconds 500", kind: "sleep" })).toBe(true);
    expect(isWaitingCall({ command: "gh run watch 1234" })).toBe(true);
    expect(isWaitingCall({ command: "bun run verify:fast" })).toBe(false);
    expect(isWaitingCall({ command: "bun test scripts/land.test.ts" })).toBe(false);
  });
});

describe("where the lane sits", () => {
  test("the percentile comes from the audit, with its population", () => {
    expect(placement(session(), 193)).toBe("61st percentile of 193 recent lanes");
    expect(placement(session({ percentile: 2 }), 1)).toBe("2nd percentile of recent lane");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(113)).toBe("113th");
    expect(ordinal(22)).toBe("22nd");
  });

  test("a missing percentile is said, not invented", () => {
    expect(placement(session({ percentile: null }), 193)).toContain("percentile not reported");
  });

  test("the population comes from the report's own totals", () => {
    expect(population({ sessions: [], totals: { sessions: 193 } })).toBe(193);
    expect(population({ sessions: [session(), session()] })).toBe(2);
  });
});

describe("which session is this lane", () => {
  test("a named session wins, an unnamed single one is used as is", () => {
    expect(pickSession([session({ id: "a" }), session({ id: "b" })], { env: {} }).note).toContain("pass --session");
    expect(pickSession([session({ id: "a" })], { env: {} }).session?.id).toBe("a");
    expect(pickSession([session({ id: "a" }), session({ id: "b" })], { session: "b" }).session?.id).toBe("b");
  });

  test("an unnamed ambiguous directory is read as its worst session, never the hopeful one", () => {
    const picked = pickSession(
      [session({ id: "a", title: "clean" }), session({ id: "b", title: "slept", sleepMs: 60_000 })],
      { env: {} },
    );
    expect(picked.session?.id).toBe("b");
    expect(picked.note).toContain("most waiting of 2");
  });

  test("the harness session id is used when the audit knows it", () => {
    const picked = pickSession([session({ id: "a" }), session({ id: "b" })], { env: { CLAUDE_SESSION_ID: "b" } });
    expect(picked.session?.id).toBe("b");
    expect(pickSession([], { env: {} }).session).toBeNull();
  });
});

describe("lane:close end to end", () => {
  test("a clean lane verifies, lands and prints the numbers", () => {
    const fake = io({ audit: audit([session()]) });
    expect(closeLane({}, fake)).toBe(EXIT_CLOSED);
    const printed = fake.lines.out.join("\n");
    expect(printed).toContain("Lane report");
    expect(printed).toContain("- PR: #2278");
    expect(printed).toContain("- checks: 21 pass, 0 fail, 0 pending — pass (run 40034099879)");
    expect(printed).toContain("- span 38 min, tool 34 min, waiting 0 min — 61st percentile of 193 recent lanes");
    expect(printed).toContain("- files changed: 3 files changed, 120 insertions(+), 4 deletions(-)");
    expect(fake.lines.err).toEqual([]);
  });

  test("verify:fast failing stops before land", () => {
    const landed: string[] = [];
    const fake = io({ verify: 1 });
    const sh = fake.sh;
    fake.sh = (argv, inherit) => {
      landed.push(argv.join(" "));
      return sh(argv, inherit);
    };
    expect(closeLane({}, fake)).toBe(EXIT_VERIFY_FAILED);
    expect(landed).not.toContain("run land");
  });

  test("a lane that slept is refused, and its calls are named", () => {
    const fake = io({
      audit: audit([
        session({
          sleepMs: 90_000,
          waitingShare: 4,
          calls: [
            { command: "Start-Sleep -Seconds 90", ms: 90_000 },
            { command: "bun run verify:fast", ms: 600_000 },
          ],
        }),
      ]),
    });
    expect(closeLane({}, fake)).toBe(EXIT_WAITED);
    const refused = fake.lines.err.join("\n");
    expect(refused).toContain('session "Close the lane" (ses_1)');
    expect(refused).toContain("sleep 2 min, CI watch 0 min");
    expect(refused).toContain("2 min  Start-Sleep -Seconds 90");
    expect(refused).toContain("--waive");
    expect(fake.lines.out.join("\n")).toContain("- span 38 min");
  });

  test("a lane that watched CI is refused too", () => {
    const fake = io({ audit: audit([session({ ciWatchMs: 420_000, longest: [{ command: "gh pr checks 2278 --watch", ms: 420_000 }] })]) });
    expect(closeLane({}, fake)).toBe(EXIT_WAITED);
    expect(fake.lines.err.join("\n")).toContain("CI watch 7 min");
  });

  test("--waive passes and the reason is recorded in the report", () => {
    const fake = io({
      audit: audit([session({ sleepMs: 60_000, calls: [{ command: "Start-Sleep -Seconds 60", ms: 60_000 }] })]),
    });
    expect(closeLane({ waive: "nightly build really is 20 minutes" }, fake)).toBe(EXIT_CLOSED);
    const printed = fake.lines.out.join("\n");
    expect(printed).toContain("waiting waived (nightly build really is 20 minutes)");
    expect(printed).toContain("- waiting waived: nightly build really is 20 minutes");
    expect(fake.lines.err).toEqual([]);
  });

  test("no audit is a refusal, not a reassuring zero", () => {
    const fake = io({ auditStatus: 1, audit: "" });
    expect(closeLane({}, fake)).toBe(EXIT_CANNOT_ANSWER);
    expect(fake.lines.err.join("\n")).toContain("lane:audit did not run");
    expect(fake.lines.out.join("\n")).toContain("span/time: unavailable");
  });

  test("no checks answer is reported as unavailable and exits non-zero", () => {
    const fake = io({
      ci: JSON.stringify({ ok: false, reason: "no-checks", message: "PR #2278 has no checks yet" }),
      ciStatus: 3,
      audit: audit([session()]),
    });
    expect(closeLane({}, fake)).toBe(EXIT_CANNOT_ANSWER);
    expect(fake.lines.out.join("\n")).toContain("checks: unavailable — PR #2278 has no checks yet");
  });

  test("the base branch is refused before anything runs", () => {
    const fake = io({ branch: "beta" });
    expect(closeLane({}, fake)).toBe(EXIT_CANNOT_ANSWER);
    expect(fake.lines.err.join("\n")).toContain("refusing to close beta");
  });
});

describe("arguments", () => {
  test("--pr, --waive and --session", () => {
    expect(parseArgs(["--pr", "12", "--waive", "slow CI"])).toEqual({ pr: 12, waive: "slow CI" });
    expect(() => parseArgs(["--waive", "  "])).toThrow("--waive needs a reason");
    expect(() => parseArgs(["--branch", "x"])).toThrow("unknown argument");
  });
});

describe("the report skeleton", () => {
  test("an unknown session says so rather than printing zeroes", () => {
    const text = reportSkeleton({ branch: "b", pr: 1, session: null, lanes: 0, filesChanged: "none" });
    expect(text).toContain("span/time: unavailable");
    expect(text).not.toContain("waiting 0 min");
  });
});
