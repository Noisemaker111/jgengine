import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { findGameFeelGaps } from "./gameFeel";
import { runRatchet } from "./ratchet";

const root = fileURLToPath(new URL("..", import.meta.url));
if (!existsSync(`${root}/Games`) && !existsSync(`${root}/created-game`)) {
  if (process.env.CI === "true") {
    console.error("check-game-feel: Games/ checkout is required in CI — run bun run games:clone first");
    process.exit(1);
  }
  process.exit(0);
}
runRatchet({ name: "check-game-feel", baselineRel: "scripts/game-feel-baseline.json", scan: findGameFeelGaps, guidance: "Add audio and responsive hit/camera feedback to input, combat, and camera features." }, root, process.argv);
