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

  test("a strict matcher swapped for a weak one is loosened", () => {
    const bends = findBends(diff("a.test.ts", ["  expect(ms).toBe(12);"], ["  expect(ms).toBeLessThan(400);"]));
    expect(bends.map((bend) => bend.kind)).toEqual(["assertion loosened"]);
  });

  test("a raised budget, a skipped test and a disabled check are named", () => {
    expect(findBends(diff("perf-budget.json", ['  "drawsFrame": 8000,'], ['  "drawsFrame": 9500,']))[0]).toEqual({
      kind: "budget raised",
      file: "perf-budget.json",
      detail: '8000 -> 9500: "drawsFrame": 9500,',
    });
    expect(findBends(diff("x.ts", ["const timeoutMs = 30;"], ["const timeoutMs = 90;"]))[0]?.kind).toBe("budget raised");
    expect(findBends(diff("x.ts", ["const timeoutMs = 90;"], ["const timeoutMs = 30;"]))).toEqual([]);
    expect(findBends(diff("x.ts", ["const speed = 3;"], ["const speed = 9;"]))).toEqual([]);
    expect(findBends(diff("b.test.ts", [], ['test.skip("flaky", () => {});']))[0]?.kind).toBe("test skipped");
    expect(findBends(diff(".github/workflows/ci.yml", [], ["        continue-on-error: true"]))[0]?.kind).toBe("check disabled");
    expect(findBends(diff("c.ts", [], ["  // @ts-ignore"]))[0]?.kind).toBe("check disabled");
  });

  test("a removed CI step is a disabled check; setup steps are not", () => {
    const bends = findBends(diff(".github/workflows/ci.yml", ["      - run: bun run check-skills", "      - run: bun install --frozen-lockfile"], []));
    expect(bends.map((bend) => bend.detail)).toEqual(["CI step removed: - run: bun run check-skills"]);
  });

  test("a rule written in a string or a regex is not the rule applied", () => {
    expect(inLiteral('  const line = "test.skip(x)";', /test\.skip/)).toBe(true);
    expect(inLiteral("const SKIP = /test.skip/;", /test\.skip/)).toBe(true);
    expect(inLiteral("test.skip('x', () => {});", /test\.skip/)).toBe(false);
  });
});

describe("the PR body section", () => {
  test("lists each bend, or says there is none", () => {
    expect(bendsSection([])).toContain("None found in the diff");
    const section = bendsSection([{ kind: "test skipped", file: "b.test.ts", detail: "test.skip(`x`)" }]);
    expect(section).toContain("- test skipped: `b.test.ts` - test.skip('x')");
  });

  test("replaces an existing section and keeps what follows it", () => {
    const body = "Context.\n\n## Bends\n\nold\n\n## Verification\n\n- ok\n";
    expect(withBends(body, "## Bends\n\nnew")).toBe("Context.\n\n## Bends\n\nnew\n\n## Verification\n\n- ok\n");
    expect(withBends("Context.", "## Bends\n\nnew")).toBe("Context.\n\n## Bends\n\nnew\n");
  });
});
