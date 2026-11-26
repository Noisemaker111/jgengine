import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "bun:test";

import { currentLoads, parseLoadLogs, recordLoads } from "./test-loads";
import { recorderEnv } from "./verify-fast";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");

function scratch(name: string): string {
  const dir = join(root, ".scratch", `test-loads-${name}-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

test("a record counts only while every file it names has its recorded bytes or is changed by this branch", () => {
  const records = {
    "a.test.ts": { loads: { "a.test.ts": "1", "a.ts": "1" } },
    "b.test.ts": { loads: { "b.test.ts": "1", "a.ts": "1", "moved.ts": "1" }, opaque: true as const },
  };
  const digest = (path: string): string => (path === "a.ts" || path === "moved.ts" ? "2" : "1");
  expect([...currentLoads(records, digest, new Set(["a.ts"])).keys()]).toEqual(["a.test.ts"]);
  expect(currentLoads(records, digest, new Set(["a.ts", "moved.ts"])).get("b.test.ts")).toEqual({ files: ["b.test.ts", "a.ts", "moved.ts"], opaque: true });
});

test("a child process's loads and opaque starts belong to the test its parent was running when it started", () => {
  const dir = scratch("logs");
  try {
    const at = (path: string): string => join(root, path);
    // Process 10 runs a.test.ts then b.test.ts; 11 is started during a.test.ts, 12 by 11; 13 has no recorded parent.
    writeFileSync(join(dir, "10.log"), ["@\t1\t100", `#\t${at("a.test.ts")}\t110`, `L\t${at("a.test.ts")}`, `#\t${at("b.test.ts")}\t200`, `L\t${at("b.test.ts")}`, `L\t${at("outside.ts")}`, ""].join("\n"));
    writeFileSync(join(dir, "11.log"), ["@\t10\t150", `L\t${at("a.ts")}`, ""].join("\n"));
    writeFileSync(join(dir, "12.log"), ["@\t11\t160", `L\t${at("deep.ts")}`, "O\ttsgo -p .", ""].join("\n"));
    writeFileSync(join(dir, "13.log"), ["@\t1\t100", `#\t${at("c.test.ts")}\t110`, `L\t${at("c.test.ts")}`, ""].join("\n"));
    const loads = parseLoadLogs(root, dir, new Set(["a.test.ts", "a.ts", "deep.ts", "b.test.ts", "c.test.ts"]));
    expect(loads.get("a.test.ts")).toEqual({ files: new Set(["a.test.ts", "a.ts", "deep.ts"]), opaque: true });
    expect(loads.get("b.test.ts")).toEqual({ files: new Set(["b.test.ts"]), opaque: false });
    const records = recordLoads(loads, new Set(["a.test.ts", "c.test.ts"]), () => "d");
    expect(records).toEqual({ "a.test.ts": { loads: { "a.test.ts": "d", "a.ts": "d", "deep.ts": "d" }, opaque: true }, "c.test.ts": { loads: { "c.test.ts": "d" } } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the recorder follows a test into the Bun scripts it starts and marks what it cannot see into", () => {
  const dir = scratch("live");
  const logs = join(dir, "logs");
  const files = {
    "child.ts": 'import "./dep";\n',
    "dep.ts": "export const dep = 1;\n",
    "spawns.test.ts": [
      'import { test } from "bun:test";',
      'import { spawnSync } from "node:child_process";',
      'test("starts", () => {',
      '  spawnSync(process.execPath, [import.meta.dir + "/child.ts"], { env: { PATH: process.env.PATH } });',
      "});",
      "",
    ].join("\n"),
    "opaque.test.ts": ['import { test } from "bun:test";', 'test("starts", () => { Bun.spawnSync(["bun", "run", "nothing"], { cwd: import.meta.dir }); });', ""].join("\n"),
  };
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    const env = { ...process.env, ...recorderEnv(logs) };
    const run = Bun.spawnSync([process.execPath, "test", "--parallel=2", join(dir, "spawns.test.ts"), join(dir, "opaque.test.ts")], { cwd: root, env, stdout: "pipe", stderr: "pipe" });
    expect(run.exitCode, run.stderr.toString()).toBe(0);
    const rel = (name: string): string => `${dir.slice(root.length + 1).replaceAll("\\", "/")}/${name}`;
    const loads = parseLoadLogs(root, logs, new Set(Object.keys(files).map(rel)));
    expect(loads.get(rel("spawns.test.ts"))).toEqual({ files: new Set([rel("spawns.test.ts"), rel("child.ts"), rel("dep.ts")]), opaque: false });
    expect(loads.get(rel("opaque.test.ts"))?.opaque).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);
