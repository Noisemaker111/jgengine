import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The concurrency block decides whether a run finishes. On 24 Oct a push to beta cancelled the
// previous beta run 6 times in 13 minutes: 122 runner-minutes were spent on runs that never
// reached a verdict, and "is beta green" was answered by a run that never finished. A pull
// request may still cancel its own superseded run; the two branches whose green is a fact do not.
const workflow = readFileSync(join(import.meta.dir, "..", ".github", "workflows", "ci.yml"), "utf8");

function concurrencyBlock(text: string): { group: string; cancel: string } {
  const block = /^concurrency:\n((?: {2}.*\n)+)/m.exec(text)?.[1] ?? "";
  return {
    group: /group:\s*(.+)/.exec(block)?.[1]?.trim() ?? "",
    cancel: /cancel-in-progress:\s*(.+)/.exec(block)?.[1]?.trim() ?? "",
  };
}

/** The refs a `github.ref != '<ref>'` expression names, in order. */
function serialisedRefs(expression: string): string[] {
  return [...expression.matchAll(/github\.ref != '([^']+)'/g)].map((match) => match[1]!);
}

test("beta serialises instead of cancelling, so a batched push gets a verdict", () => {
  const { cancel } = concurrencyBlock(workflow);
  expect(cancel).not.toBe("true");
  expect(cancel).not.toBe("${{ !cancelled() }}");
  expect(serialisedRefs(cancel)).toContain("refs/heads/beta");
});

test("main keeps the behaviour it had: never cancelled", () => {
  expect(serialisedRefs(concurrencyBlock(workflow).cancel)).toContain("refs/heads/main");
});

test("a pull request still cancels its own superseded run", () => {
  const { cancel } = concurrencyBlock(workflow);
  expect(cancel.startsWith("${{")).toBe(true);
  expect(cancel.endsWith("}}")).toBe(true);
  expect(cancel).not.toContain("refs/pull");
  expect(serialisedRefs(cancel)).toEqual(["refs/heads/main", "refs/heads/beta"]);
});

test("the group still keys on the ref, so one branch cannot cancel another", () => {
  expect(concurrencyBlock(workflow).group).toContain("github.ref");
});
