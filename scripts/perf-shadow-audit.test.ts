import { describe, expect, test } from "bun:test";

import { auditVerdict, parseAuditArgs, renderShadowAudit, type AuditRow } from "./perf-shadow-audit";

const counters = (overrides: Record<string, number>) => ({ casters: 10, static: 8, full: 1, rebuild: 1, reuse: 5, hold: 20, auditMaps: 26, auditMismatchedMaps: 0, auditMismatchedTexels: 0, auditFailed: 0, ...overrides });

describe("auditVerdict", () => {
  test("only a game whose compared maps all match is identical", () => {
    expect(auditVerdict({ game: "a", counters: counters({}), error: null })).toBe("identical");
  });

  test("a game whose every pass drew in full has nothing cached to compare and passes", () => {
    expect(auditVerdict({ game: "a", counters: counters({ auditMaps: 0, rebuild: 0, reuse: 0, hold: 0, full: 1634 }), error: null })).toBe("identical (every pass full)");
  });

  test("a differing texel, a comparison that did not run, or nothing compared all fail", () => {
    const rows: [AuditRow, string][] = [
      [{ game: "a", counters: counters({ auditMismatchedMaps: 1, auditMismatchedTexels: 3 }), error: null }, "differs"],
      [{ game: "a", counters: counters({ auditFailed: 1 }), error: null }, "comparison failed"],
      [{ game: "a", counters: counters({ auditMaps: 0 }), error: null }, "nothing compared"],
      [{ game: "a", counters: counters({ auditMaps: 0, rebuild: 0, reuse: 0, hold: 0, full: 0 }), error: null }, "nothing compared"],
      [{ game: "a", counters: null, error: "timed out" }, "not measured"],
    ];
    for (const [row, verdict] of rows) expect(auditVerdict(row)).toBe(verdict as ReturnType<typeof auditVerdict>);
  });

  test("the table names a failed game's error in place of a verdict", () => {
    const table = renderShadowAudit([{ game: "fernwild", counters: null, error: "timed out" }]);
    expect(table).toContain("fernwild");
    expect(table).toContain("timed out");
  });
});

describe("parseAuditArgs", () => {
  test("defaults to every frame game walking for 8 s", () => {
    const parsed = parseAuditArgs([]);
    expect(parsed).not.toBe("help");
    if (parsed === "help") return;
    expect(parsed.path).toBe("walk");
    expect(parsed.seconds).toBe(8);
    expect(parsed.games.length).toBeGreaterThan(0);
  });

  test("reads games, seconds and path, and refuses a bad path", () => {
    expect(parseAuditArgs(["--games", "deepward,fernwild", "--seconds", "4", "--path", "still"])).toEqual({ games: ["deepward", "fernwild"], seconds: 4, path: "still" });
    expect(() => parseAuditArgs(["--path", "run"])).toThrow("--path must be walk or still");
    expect(() => parseAuditArgs(["--nope"])).toThrow("unknown argument");
  });
});
