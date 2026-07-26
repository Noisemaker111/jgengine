import { fileURLToPath } from "node:url";

import { runRatchet } from "./ratchet";
import { findStatefulPrimitives } from "./statefulPrimitives";

runRatchet(
  {
    name: "check-stateful-ratchet",
    baselineRel: "scripts/stateful-primitive-baseline.json",
    scan: (root) => findStatefulPrimitives(root).map((entry) => ({ key: entry.key })),
    guidance:
      "A handle that owns mutable state must let a caller read it out and put one back — a server\n" +
      "host, save/load, replay, and tests all need the state outside the closure. Add a state-out\n" +
      "method (`snapshot()` / `state()`) and its counterpart (`restore(next)` / `reset(next)`); see\n" +
      "`cards/cardPile.ts` for the shape. See CLAUDE.md — Stateful primitives.",
  },
  fileURLToPath(new URL("..", import.meta.url)),
  process.argv,
);
