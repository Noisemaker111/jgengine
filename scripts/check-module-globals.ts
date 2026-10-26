import { fileURLToPath } from "node:url";

import { findModuleGlobals } from "./moduleGlobalState";
import { runRatchet } from "./ratchet";

// Every game under games/, not only the reference set: module state in any game breaks a server
// host running two sessions, so no game is exempt.
runRatchet(
  {
    name: "check-module-globals",
    baselineRel: "scripts/module-global-baseline.json",
    scan: (scanRoot) => findModuleGlobals(scanRoot),
    guidance:
      "Module scope is shared by every GameContext in the process, so a server host running two\n" +
      "sessions, split-screen, and a test suite all read the same value. Put per-run or per-player\n" +
      "state in `defineStore(key, initial)` (or `perContext`) and read it through `ctx`; see\n" +
      "`games/vice-isle/src/loop.ts`. See AGENTS.md — Scale by default.",
  },
  fileURLToPath(new URL("..", import.meta.url)),
  process.argv,
);
