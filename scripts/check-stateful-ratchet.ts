import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { findStatefulPrimitives } from "./statefulPrimitives";

/**
 * #1575: shrink-only baseline of stateful primitives that cannot hand their state back. A new
 * `create*` handle owning mutable state must expose a state-out method (`snapshot`/`state`/…) and a
 * way to take one back (`restore`/`reset`/…); everything already missing that is baselined here.
 */

const BASELINE_REL = "scripts/stateful-primitive-baseline.json";
const root = fileURLToPath(new URL("..", import.meta.url));
const baselinePath = join(root, BASELINE_REL);
const write = process.argv.includes("--write");

const live = findStatefulPrimitives(root).map((entry) => entry.key);

if (write) {
  writeFileSync(baselinePath, `${JSON.stringify(live, null, 2)}\n`);
  console.log(`check-stateful-ratchet: wrote ${live.length} entr(ies) to ${BASELINE_REL}`);
  process.exit(0);
}

const baseline = new Set(JSON.parse(readFileSync(baselinePath, "utf8")) as string[]);
const added = live.filter((key) => !baseline.has(key));
const fixed = [...baseline].filter((key) => !live.includes(key)).sort();

if (added.length > 0) {
  console.error(`\ncheck-stateful-ratchet failed: ${added.length} stateful primitive(s) cannot hand their state back\n`);
  for (const key of added) console.error(`  ${key}`);
  console.error(
    "\nA handle that owns mutable state must let a caller read it out and put one back — a server host," +
      "\nsave/load, replay, and tests all need the state outside the closure. Add a state-out method" +
      "\n(`snapshot()` / `state()`) and its counterpart (`restore(next)` / `reset(next)`); see" +
      "\n`cards/cardPile.ts` for the shape. See CLAUDE.md — Stateful primitives.\n",
  );
  process.exit(1);
}

if (fixed.length > 0) {
  console.error(`\ncheck-stateful-ratchet failed: ${fixed.length} baselined entr(ies) no longer apply\n`);
  for (const key of fixed) console.error(`  ${key}`);
  console.error(`\nThe baseline is shrink-only — commit the smaller list.\nFix: bun run check-stateful-ratchet --write\n`);
  process.exit(1);
}

console.log(`check-stateful-ratchet ok: ${baseline.size} baselined, none added`);
