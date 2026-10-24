import { fileURLToPath } from "node:url";

import { runRatchet } from "./ratchet";
import { findStatefulPrimitives } from "./statefulPrimitives";

const argv = process.argv.slice(2);
const at = argv.indexOf("--root");
const root = at < 0 ? fileURLToPath(new URL("..", import.meta.url)) : argv[at + 1];

if (root === undefined) {
  console.error("check-stateful-ratchet: --root needs a value");
  process.exit(2);
}

runRatchet(
  {
    name: "check-stateful-ratchet",
    baselineRel: "scripts/stateful-primitive-baseline.json",
    scan: (scanRoot) =>
      findStatefulPrimitives(scanRoot).map((entry) => ({
        key: entry.key,
        group: entry.gap === "state-out-only" ? "round-trip" : undefined,
      })),
    guidance:
      "A handle that owns mutable state must let a caller read it out and put one back — a server\n" +
      "host, save/load, replay, and tests all need the state outside the closure. Add a state-out\n" +
      "method (`snapshot()` / `state()`) and its counterpart (`restore(next)` / `reset(next)`); see\n" +
      "`cards/cardPile.ts` for the shape. A `snapshot()` with no way back is the `round-trip` group\n" +
      "in the baseline: the state can be saved but not resumed, so every consumer rebuilds it by\n" +
      "hand and drops whatever the snapshot did not carry. The ceiling only shrinks.\n" +
      "See AGENTS.md — Stateful primitives.",
  },
  root,
  argv,
);
