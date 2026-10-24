import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EXIT_CANNOT_ANSWER,
  EXIT_CLOSED,
  EXIT_VERIFY_FAILED,
  EXIT_WAITED,
  closeLane,
  isWaitingCall,
  auditShapeProblem,
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
      if (key === "run land --commit") return { ...run([]), status: script.land ?? 0 };
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

function attributedAudit(sessions: AuditSession[], reason: string): string {
  return JSON.stringify({
    sessions,
    totals: { sessions: 193 },
    attribution: { session: sessions[0]?.id ?? null, target: "/repo", basis: "commands", references: 14, reason },
  });
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
      session({ sleepMs: 2_000, waits: [{ kind: "sleep", command: "Start-Sleep -Seconds 2", ms: 2_000 }] }),
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

  test("the audit's attribution names the session and its reason", () => {
    const picked = pickSession([session({ id: "ses_lane" })], {
      env: {},
      attribution: { session: "ses_lane", reason: "attributed ses_lane (14 references to C:/repo/.claude/worktrees/lane-x)" },
    });
    expect(picked.session?.id).toBe("ses_lane");
    expect(picked.note).toBe("attributed ses_lane (14 references to C:/repo/.claude/worktrees/lane-x)");
  });

  test("a harness id that is not one of the lane's rows does not override the attribution", () => {
    const picked = pickSession([session({ id: "ses_lane" })], {
      env: { OPENCODE_SESSION_ID: "ses_parent" },
      attribution: { session: "ses_lane", reason: "attributed ses_lane (9 references to C:/repo/.claude/worktrees/lane-x)" },
    });
    expect(picked.session?.id).toBe("ses_lane");
    expect(picked.note).toContain("attributed ses_lane");
    expect(picked.note).toContain("named session ses_parent is not in this lane's rows");
  });
});

describe("lane:close end to end", () => {
  test("a clean lane verifies, lands with --commit and prints the numbers", () => {
    const calls: string[] = [];
    const fake = io({ audit: audit([session()]) });
    const sh = fake.sh;
    fake.sh = (argv, inherit) => {
      calls.push(argv.join(" "));
      return sh(argv, inherit);
    };
    expect(closeLane({}, fake)).toBe(EXIT_CLOSED);
    const printed = fake.lines.out.join("\n");
    expect(printed).toContain("Lane report");
    expect(printed).toContain("- PR: #2278");
    expect(printed).toContain("- checks: 21 pass, 0 fail, 0 pending — pass (run 40034099879)");
    expect(printed).toContain("- span 38 min, tool 34 min, waiting 0 min — 61st percentile of 193 recent lanes");
    expect(printed).toContain("- files changed: 3 files changed, 120 insertions(+), 4 deletions(-)");
    expect(fake.lines.err).toEqual([]);
    expect(calls).toContain("run land --commit");
  });

  test("a PR that is still open and armed is named, not refused", () => {
    const pending = JSON.stringify({
      ok: true,
      pr: 2278,
      url: "https://github.com/o/r/pull/2278",
      state: "OPEN",
      verdict: "pending",
      counts: { pass: 3, fail: 0, pending: 8 },
      runIds: [40034099879],
    });
    const fake = io({ audit: audit([session()]), ci: pending });
    expect(closeLane({}, fake)).toBe(EXIT_CLOSED);
    const printed = fake.lines.out.join("\n");
    expect(printed).toContain("- PR: #2278 open https://github.com/o/r/pull/2278");
    expect(printed).toContain("- checks: 3 pass, 0 fail, 8 pending — pending");
  });

  test("a landing with no PR to name cannot answer", () => {
    const fake = io({ pr: null, audit: audit([session()]) });
    expect(closeLane({}, fake)).toBe(EXIT_CANNOT_ANSWER);
    expect(fake.lines.err.join("\n")).toContain("cannot name its PR");
  });

  test("the lane says which session it read and why", () => {
    const reason = "attributed ses_1 (14 references to /repo/.claude/worktrees/lane-attribution)";
    const fake = io({ audit: attributedAudit([session()], reason) });
    expect(closeLane({}, fake)).toBe(EXIT_CLOSED);
    expect(fake.lines.out.join("\n")).toContain(reason);
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
    expect(landed).not.toContain("run land --commit");
  });

  test("a lane that slept is refused, and its calls are named", () => {
    const fake = io({
      audit: audit([
        session({
          sleepMs: 90_000,
          waitingShare: 4,
          waits: [
            { kind: "sleep", command: "Start-Sleep -Seconds 90", ms: 90_000 },
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
    const fake = io({ audit: audit([session({ ciWatchMs: 420_000, waits: [{ kind: "ci-watch", command: "gh pr checks 2278 --watch", ms: 420_000 }] })]) });
    expect(closeLane({}, fake)).toBe(EXIT_WAITED);
    expect(fake.lines.err.join("\n")).toContain("CI watch 7 min");
  });

  test("--waive passes and the reason is recorded in the report", () => {
    const fake = io({
      audit: audit([session({ sleepMs: 60_000, waits: [{ kind: "sleep", command: "Start-Sleep -Seconds 60", ms: 60_000 }] })]),
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

  test("checks that have not registered yet are a hand-off, and the lane still closes", () => {
    const fake = io({
      ci: JSON.stringify({ ok: false, reason: "no-checks", message: "PR #2278 has no checks yet" }),
      ciStatus: 3,
      audit: audit([session()]),
    });
    expect(closeLane({}, fake)).toBe(EXIT_CLOSED);
    const printed = fake.lines.out.join("\n");
    expect(printed).toContain("checks: unavailable — PR #2278 has no checks yet");
    expect(printed).toContain("ask again for the checks: bun run ci:status --pr 2278");
    expect(fake.lines.err).toEqual([]);
  });

  test("a ci:status that answers nothing at all leaves the lane unable to report", () => {
    const fake = io({ ci: "not json", audit: audit([session()]) });
    expect(closeLane({}, fake)).toBe(EXIT_CANNOT_ANSWER);
    expect(fake.lines.err.join("\n")).toContain("cannot report the checks");
  });

  test("the base branch is refused before anything runs", () => {
    const fake = io({ branch: "beta" });
    expect(closeLane({}, fake)).toBe(EXIT_CANNOT_ANSWER);
    expect(fake.lines.err.join("\n")).toContain("refusing to close beta");
  });
});

describe("the gate reads what lane:audit actually emits", () => {
  const fixturePath = join(import.meta.dir, "fixtures", "lane-audit-real.json");
  const captured = (): string => readFileSync(fixturePath, "utf8");

  test("the captured real output parses as the shape lane:close reads", () => {
    const document = JSON.parse(captured()) as { sessions: Record<string, unknown>[] };
    expect(auditShapeProblem(document)).toBeNull();
    // The field that crashed a finished lane: `calls` is a count, not the calls themselves.
    expect(typeof document.sessions[0]!.calls).toBe("number");
    expect(document.sessions[0]!.waits).toBeArray();
    expect(Object.keys(document.sessions[0]!).sort()).toEqual(
      [
        "id",
        "title",
        "directory",
        "spanMs",
        "toolMs",
        "sleepMs",
        "ciWatchMs",
        "over60Ms",
        "waitingShare",
        "percentile",
        "calls",
        "longest",
        "waits",
      ].sort(),
    );
  });

  test("the real lane that slept and watched CI is refused with its waits named", () => {
    const fake = io({ audit: captured() });
    expect(closeLane({}, fake)).toBe(EXIT_WAITED);
    const refused = fake.lines.err.join("\n");
    expect(refused).toContain("this lane waited");
    expect(refused).toContain("sleep 0 min, CI watch 0 min");
    expect(refused).toContain("Start-Sleep -Milliseconds 1");
    expect(refused).toContain("gh pr checks 2283");
    expect(fake.lines.out.join("\n")).toContain("- span 23 min");
  });

  test("--waive records the reason on the same real output", () => {
    const fake = io({ audit: captured() });
    expect(closeLane({ waive: "the audit greps for waits, and its own greps look like waits" }, fake)).toBe(EXIT_CLOSED);
    expect(fake.lines.out.join("\n")).toContain("- waiting waived: the audit greps for waits");
    expect(fake.lines.err).toEqual([]);
  });

  test("a changed audit shape fails loudly with the keys it saw, never a TypeError", () => {
    const document = JSON.parse(captured()) as { sessions: Record<string, unknown>[] };
    document.sessions[0]!.calls = [{ command: "Start-Sleep -Seconds 9", ms: 9_000 }];
    const fake = io({ audit: JSON.stringify(document) });
    expect(closeLane({}, fake)).toBe(EXIT_CANNOT_ANSWER);
    const message = fake.lines.err.join("\n");
    expect(message).toContain("the audit output shape changed: sessions[0].calls");
    expect(message).toContain("keys seen: ");
    expect(message).not.toContain("TypeError");

    const broken = JSON.parse(captured()) as { sessions: Record<string, unknown>[] };
    broken.sessions[0]!.waits = { kind: "sleep" };
    expect(auditShapeProblem(broken)).toContain("sessions[0].waits is an object, expected an array");
    expect(auditShapeProblem({ sessions: "none" })).toContain("sessions is a string, expected an array");
    expect(auditShapeProblem({})).toContain("sessions is undefined");
  });
});

describe("arguments", () => {
  test("--pr, --waive and --session", () => {
    expect(parseArgs(["--pr", "12", "--waive", "slow CI"])).toEqual({ pr: 12, waive: "slow CI", allow: [] });
    expect(parseArgs(["--allow", "bun.lock"])).toEqual({ allow: ["bun.lock"] });
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


