import { expect, test } from "bun:test";

import { postAuditVerdict, renderPostAudit } from "./perf-post-audit";

const counters = (overrides: Record<string, number>) => ({ tailFrames: 400, sharpenFrames: 380, auditFrames: 20, auditTexels: 28_800_000, auditDifferingTexels: 900, auditTexelsOverOneLevel: 0, auditFailed: 0, ...overrides });

test("a game passes when its merged ending is at most one level off on at most 1 texel in 1000", () => {
  expect(postAuditVerdict({ game: "a", counters: counters({}), error: null })).toBe("matches");
  expect(postAuditVerdict({ game: "a", counters: counters({ auditTexelsOverOneLevel: 1 }), error: null })).toBe("differs by more than one level");
  expect(postAuditVerdict({ game: "a", counters: counters({ auditDifferingTexels: 30_000 }), error: null })).toBe("differs on too many texels");
});

test("a chain that never merged its ending passes; one that merged but compared nothing, or failed, does not", () => {
  expect(postAuditVerdict({ game: "a", counters: counters({ tailFrames: 0, sharpenFrames: 0, auditFrames: 0, auditTexels: 0, auditDifferingTexels: 0 }), error: null })).toBe("nothing merged");
  expect(postAuditVerdict({ game: "a", counters: counters({ auditFrames: 0 }), error: null })).toBe("nothing compared");
  expect(postAuditVerdict({ game: "a", counters: counters({ auditFailed: 1 }), error: null })).toBe("comparison failed");
  expect(postAuditVerdict({ game: "a", counters: null, error: "timed out" })).toBe("not measured");
});

test("the table shows the differing share and a failed game's error", () => {
  const table = renderPostAudit([{ game: "harbor-heat", counters: counters({}), error: null }, { game: "fernwild", counters: null, error: "timed out" }]);
  expect(table).toContain("1 in 32000");
  expect(table).toContain("timed out");
});
