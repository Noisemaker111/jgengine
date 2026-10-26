import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { CAPABILITIES } from "../games/scripts/capabilities-tools";
import { BACKGROUND } from "./background";
import { PERF } from "./perf";
import { resolveVerb, usageOf, type VerbTable } from "./subcommands";
import { WORKTREE } from "./worktree";

const root = fileURLToPath(new URL("..", import.meta.url));
const TABLES: readonly VerbTable[] = [WORKTREE, BACKGROUND, PERF, CAPABILITIES];

describe("resolveVerb", () => {
  test("a verb runs its own script with the caller's flags after its fixed ones", () => {
    expect(resolveVerb(WORKTREE, ["new", "my-lane"])).toEqual(["bun", "scripts/agent-worktree.ts", "my-lane"]);
    expect(resolveVerb(BACKGROUND, ["await", "abc"])).toEqual(["bun", "scripts/bg-await.ts", "abc"]);
  });

  test("a guarded verb runs under scripts/guard.ts with its own limit, as one command so guard passes the flags", () => {
    expect(resolveVerb(PERF, ["gate", "--jobs", "8"])).toEqual(["bun", "scripts/guard.ts", "1500", "bun scripts/perf-gate.ts", "--jobs", "8"]);
  });

  test("a first word that names no verb goes to the fallback with that word kept", () => {
    expect(resolveVerb(PERF, ["deepward", "--seconds", "5"])).toEqual(["bun", "scripts/guard.ts", "420", "bun scripts/perf-play.ts", "deepward", "--seconds", "5"]);
  });

  test("an unknown verb, or a flag where a verb belongs, resolves to nothing rather than a guess", () => {
    expect(resolveVerb(WORKTREE, ["nope"])).toBeNull();
    expect(resolveVerb(PERF, ["--jobs"])).toBeNull();
    expect(resolveVerb(WORKTREE, [])).toBeNull();
  });
});

describe("the verb tables", () => {
  test("every verb names a script the repo has, and the usage lists every verb", () => {
    for (const table of TABLES) {
      for (const [verb, entry] of Object.entries(table.verbs)) {
        expect(`${table.name} ${verb}: ${existsSync(join(root, entry.script))}`).toBe(`${table.name} ${verb}: true`);
      }
      const usage = usageOf(table);
      expect(usage.flags.map((flag) => flag.flag)).toEqual(Object.keys(table.verbs));
      if (table.fallback !== undefined) expect(Object.keys(table.verbs)).toContain(table.fallback);
    }
  });

  test("each table is one root script, so a verb never needs its own package.json entry", () => {
    const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
    for (const table of TABLES) expect(scripts[table.name]).toBeDefined();
    for (const table of TABLES) {
      for (const entry of Object.values(table.verbs)) {
        const direct = Object.values(scripts).filter((command) => command.includes(entry.script));
        expect(direct).toEqual([]);
      }
    }
  });
});
