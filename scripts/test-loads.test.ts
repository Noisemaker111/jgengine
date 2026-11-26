import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "bun:test";

import { currentLoads, parseLoadLogs, recordLoads } from "./test-loads";

const root = fileURLToPath(new URL("..", import.meta.url));

test("a record counts only while every file it names has its recorded bytes or is changed by this branch", () => {
  const records = {
    "a.test.ts": { "a.test.ts": "1", "a.ts": "1" },
    "b.test.ts": { "b.test.ts": "1", "a.ts": "1", "moved.ts": "1" },
  };
  const digest = (path: string): string => (path === "a.ts" || path === "moved.ts" ? "2" : "1");
  expect([...currentLoads(records, digest, new Set(["a.ts"])).keys()]).toEqual(["a.test.ts"]);
  expect(currentLoads(records, digest, new Set(["a.ts", "moved.ts"])).get("b.test.ts")).toEqual(["b.test.ts", "a.ts", "moved.ts"]);
});

test("the logs become repo paths per test, and only tests that passed and loaded themselves are recorded", () => {
  const dir = join(root, ".scratch", `test-loads-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    const line = (test: string, loaded: string): string => `${join(root, test)}\t${join(root, loaded)}\n`;
    writeFileSync(join(dir, "1.log"), line("a.test.ts", "a.test.ts") + line("a.test.ts", "a.ts") + line("a.test.ts", "outside.ts"));
    writeFileSync(join(dir, "2.log"), line("b.test.ts", "b.test.ts") + line("c.test.ts", "c.ts"));
    const loads = parseLoadLogs(root, dir, new Set(["a.test.ts", "a.ts", "b.test.ts", "c.test.ts", "c.ts"]));
    expect([...(loads.get("a.test.ts") ?? [])]).toEqual(["a.test.ts", "a.ts"]);
    const records = recordLoads(loads, new Set(["a.test.ts", "c.test.ts"]), () => "d");
    expect(records).toEqual({ "a.test.ts": { "a.test.ts": "d", "a.ts": "d" } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
