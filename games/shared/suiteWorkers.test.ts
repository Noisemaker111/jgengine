import { describe, expect, test } from "bun:test";

import { SUITE_WORKERS_ENV, suiteWorkers } from "./suiteTest";

describe("suite workers", () => {
  test("half the machine's threads by default, never more than there are proofs, never none", () => {
    expect(suiteWorkers(62, {}, 8)).toBe(4);
    expect(suiteWorkers(3, {}, 16)).toBe(3);
    expect(suiteWorkers(62, {}, 1)).toBe(1);
    expect(suiteWorkers(0, {}, 8)).toBe(1);
  });

  test("JG_SUITE_WORKERS sets the count; a value that is not a positive whole number is ignored", () => {
    expect(suiteWorkers(62, { [SUITE_WORKERS_ENV]: "1" }, 8)).toBe(1);
    expect(suiteWorkers(62, { [SUITE_WORKERS_ENV]: "12" }, 8)).toBe(12);
    expect(suiteWorkers(62, { [SUITE_WORKERS_ENV]: "zero" }, 8)).toBe(4);
    expect(suiteWorkers(62, { [SUITE_WORKERS_ENV]: "-2" }, 8)).toBe(4);
  });
});
