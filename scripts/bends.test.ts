import { describe, expect, test } from "bun:test";

import { bendsSection, findBends, inLiteral, withBends } from "./bends";

function diff(file: string, removed: string[], added: string[]): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -1 +1 @@",
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
  ].join("\n");
}

describe("findBends", () => {
  test("a deleted assertion is named; one rewritten in place or moved is not", () => {
    const deleted = findBends(diff("a.test.ts", ["  expect(x).toBe(1);", "  expect(y).toBe(2);"], ["  expect(y).toBe(2);"]));
    expect(deleted).toEqual([{ kind: "assertion removed", file: "a.test.ts", detail: "1 fewer assertion(s), e.g. expect(x).toBe(1);" }]);
    expect(findBends(diff("a.test.ts", ["  expect(x).toBe(1);"], ["  expect(x).toBe(2);"]))).toEqual([]);
  });

  test("a skipped test and a disabled check are named", () => {
    expect(findBends(diff("b.test.ts", [], ['test.skip("flaky", () => {});']))[0]?.kind).toBe("test skipped");
    expect(findBends(diff(".github/workflows/ci.yml", [], ["        continue-on-error: true"]))[0]?.kind).toBe("check disabled");
    expect(findBends(diff("c.ts", [], ["  // @ts-ignore"]))[0]?.kind).toBe("check disabled");
    expect(findBends(diff("games/x/src/a.ts", [], ["// framework-ok: authored content"]))[0]?.kind).toBe("check disabled");
  });

  test("a raised number and a loosened matcher are not bends", () => {
    expect(findBends(diff("perf-budget.json", ['  "drawsFrame": 8000,'], ['  "drawsFrame": 9500,']))).toEqual([]);
    expect(findBends(diff("x.ts", ["const timeoutMs = 30;"], ["const timeoutMs = 90;"]))).toEqual([]);
    expect(findBends(diff("x.browser.test.ts", ["beforeAll(start, 30_000);"], ["beforeAll(start, 60_000);"]))).toEqual([]);
    expect(findBends(diff("a.test.ts", ["  expect(ms).toBe(12);"], ["  expect(ms).toBeLessThan(400);"]))).toEqual([]);
  });

  test("a removed CI step is a disabled check; setup steps are not", () => {
    const bends = findBends(diff(".github/workflows/ci.yml", ["      - run: bun run check skills", "      - run: bun install --frozen-lockfile"], []));
    expect(bends.map((bend) => bend.detail)).toEqual(["CI step removed: - run: bun run check skills"]);
  });

  test("a rule written in a string or a regex is not the rule applied", () => {
    expect(inLiteral('  const line = "test.skip(x)";', /test\.skip/)).toBe(true);
    expect(inLiteral("const SKIP = /test.skip/;", /test\.skip/)).toBe(true);
    expect(inLiteral("test.skip('x', () => {});", /test\.skip/)).toBe(false);
  });
});

describe("the PR body section", () => {
  test("lists each bend, and is empty when there is none", () => {
    expect(bendsSection([])).toBe("");
    const section = bendsSection([{ kind: "test skipped", file: "b.test.ts", detail: "test.skip(`x`)" }]);
    expect(section).toContain("- test skipped: `b.test.ts` - test.skip('x')");
  });

  test("replaces an existing section and keeps what follows it", () => {
    const body = "Context.\n\n## Bends\n\nold\n\n## Verification\n\n- ok\n";
    expect(withBends(body, "## Bends\n\nnew")).toBe("Context.\n\n## Bends\n\nnew\n\n## Verification\n\n- ok\n");
    expect(withBends("Context.", "## Bends\n\nnew")).toBe("Context.\n\n## Bends\n\nnew\n");
  });

  test("an empty section removes the old one and adds nothing to a body without one", () => {
    const body = "Context.\n\n## Bends\n\nold\n\n## Verification\n\n- ok\n";
    expect(withBends(body, "")).toBe("Context.\n\n## Verification\n\n- ok\n");
    expect(withBends("Context.\n\n## Bends\n\nold\n", "")).toBe("Context.\n");
    expect(withBends("Context.", "")).toBe("Context.");
  });
});
