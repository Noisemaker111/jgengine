import { fileURLToPath } from "node:url";

import { findModuleGlobals } from "./moduleGlobalState";
import { ignoredGames, referenceGames, requireGamesAtPin, warnIgnoredGames } from "./games-scope";
import { runRatchet } from "./ratchet";

const root = fileURLToPath(new URL("..", import.meta.url));
requireGamesAtPin("check-module-globals", root);

const games = referenceGames(root);
warnIgnoredGames("check-module-globals", ignoredGames(root, games));
runRatchet(
  {
    name: "check-module-globals",
    baselineRel: "scripts/module-global-baseline.json",
    scan: (scanRoot) => findModuleGlobals(scanRoot, games),
    guidance:
      "Module scope is shared by every GameContext in the process, so a server host running two\n" +
      "sessions, split-screen, and a test suite all read the same value. Put per-run or per-player\n" +
      "state in `defineStore(key, initial)` (or `perContext`) and read it through `ctx`; see\n" +
      "`Games/vice-isle/src/loop.ts`. See AGENTS.md — Scale by default.",
  },
  fileURLToPath(new URL("..", import.meta.url)),
  process.argv,
);
