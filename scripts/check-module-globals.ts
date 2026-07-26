import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { findModuleGlobals } from "./moduleGlobalState";

const BASELINE_REL = "scripts/module-global-baseline.json";
const root = fileURLToPath(new URL("..", import.meta.url));
const baselinePath = join(root, BASELINE_REL);
const write = process.argv.includes("--write");

const live = findModuleGlobals(root);
const liveKeys = live.map((entry) => entry.key);

if (write) {
  writeFileSync(baselinePath, `${JSON.stringify(liveKeys, null, 2)}\n`);
  console.log(`check-module-globals: wrote ${liveKeys.length} entr(ies) to ${BASELINE_REL}`);
  process.exit(0);
}

const baseline = new Set(JSON.parse(readFileSync(baselinePath, "utf8")) as string[]);
const added = live.filter((entry) => !baseline.has(entry.key));
const fixed = [...baseline].filter((key) => !liveKeys.includes(key)).sort();

if (added.length > 0) {
  console.error(`\ncheck-module-globals failed: ${added.length} new module-level mutable binding(s)\n`);
  for (const entry of added) console.error(`  ${entry.declaration}`);
  console.error(
    "\nModule scope is shared by every GameContext in the process, so a server host running two" +
      "\nsessions, split-screen, and a test suite all read the same value. Put per-run or per-player" +
      "\nstate in `defineStore(key, initial)` (or `perContext`) and read it through `ctx`; see" +
      "\n`Games/vice-isle/src/loop.ts`. See CLAUDE.md — Scale by default.\n",
  );
  process.exit(1);
}

if (fixed.length > 0) {
  console.error(`\ncheck-module-globals failed: ${fixed.length} baselined entr(ies) no longer apply\n`);
  for (const key of fixed) console.error(`  ${key}`);
  console.error(`\nThe baseline is shrink-only — commit the smaller list.\nFix: bun run check-module-globals --write\n`);
  process.exit(1);
}

console.log(`check-module-globals ok: ${baseline.size} baselined, none added`);
