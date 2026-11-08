import { expect, test } from "bun:test";

import { postAuditVerdict, renderPostAudit } from "./perf-post-audit";

const counters = (overrides: Record<string, number>) => ({

  changedFrames: 400,
  auditFrames: 20,
  auditSkipped: 1,
  auditFailed: 0,
  compositeFrames: 20,
  compositeTexels: 28_800_000,
  compositeDiffering: 0,
  bloomFrames: 20,
  bloomTexels: 28_800_000,
  bloomDiffering: 0,
  ...overrides,
});

test("a game passes only when every compared draw has the same bits", () => {
  expect(postAuditVerdict({ game: "a", counters: counters({}), error: null })).toBe("identical");
  expect(postAuditVerdict({ game: "a", counters: counters({ atmosphereDiffering: 1 }), error: null })).toBe("differs: atmosphere");
  expect(postAuditVerdict({ game: "a", counters: counters({ compositeDiffering: 3, bloomDiffering: 1 }), error: null })).toBe("differs: composite, bloom");
});

test("a chain with no changed draw passes; one that drew them but compared nothing, or failed, does not", () => {
  expect(postAuditVerdict({ game: "a", counters: counters({ changedFrames: 0, auditFrames: 0 }), error: null })).toBe("nothing changed");
  expect(postAuditVerdict({ game: "a", counters: counters({ auditFrames: 0 }), error: null })).toBe("nothing compared");
  expect(postAuditVerdict({ game: "a", counters: counters({ auditFailed: 1 }), error: null })).toBe("comparison failed");
  expect(postAuditVerdict({ game: "a", counters: null, error: "timed out" })).toBe("not measured");
});

test("the table shows each check's frames and differing texels, and a failed game's error", () => {
  const table = renderPostAudit([{ game: "harbor-heat", counters: counters({ bloomDiffering: 7 }), error: null }, { game: "fernwild", counters: null, error: "timed out" }]);
  expect(table).toContain("20: 7");
  expect(table).toContain("differs: bloom");
  expect(table).toContain("timed out");
});
