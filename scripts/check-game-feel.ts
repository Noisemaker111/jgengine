import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { findGameFeelGaps } from "./gameFeel";
import { referenceGames, ignoredGames, requireGamesAtPin, warnIgnoredGames } from "./games-scope";
import { runRatchet } from "./ratchet";

const root = fileURLToPath(new URL("..", import.meta.url));
// The scene-owned scaffold probe (`jgengine create`) has no games repo; only a tree
// with neither is asked to name its Games/ commit.
if (!existsSync(`${root}/created-game`)) requireGamesAtPin("check-game-feel", root);
const games = referenceGames(root);
warnIgnoredGames("check-game-feel", ignoredGames(root, games));
runRatchet({ name: "check-game-feel", baselineRel: "scripts/game-feel-baseline.json", scan: (scanRoot) => findGameFeelGaps(scanRoot, games), guidance: "Add audio and responsive hit/camera feedback to input, combat, and camera features." }, root, process.argv);
