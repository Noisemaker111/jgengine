import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { findGameFeelGaps } from "./gameFeel";
import { referenceGames, ignoredGames, warnIgnoredGames } from "./games-scope";
import { runRatchet } from "./ratchet";

const root = fileURLToPath(new URL("..", import.meta.url));
const games = referenceGames(root);
warnIgnoredGames("check-game-feel", ignoredGames(root, games));
runRatchet({ name: "check-game-feel", baselineRel: "scripts/game-feel-baseline.json", scan: (scanRoot) => findGameFeelGaps(scanRoot, games), guidance: "Add audio and responsive hit/camera feedback to input, combat, and camera features." }, root, process.argv);
