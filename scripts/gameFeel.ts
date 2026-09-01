import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { RatchetFinding } from "./ratchet";

const INPUT = /\b(?:fire|attack|interact)\b/i;
const AUDIO = /audio\.play|ctx\.game\.audio/;
const COMBAT = /combat|hit|damage|attack/i;
const REACTION = /hitReaction|impactPresets|cameraShake/;
const CAMERA = /camera/i;
const SMOOTHING = /targetSmoothing|smoothing/;

function sources(root: string): { rel: string; source: string }[] {
  const roots = [join(root, "Games")];
  if (existsSync(join(root, "created-game", "src"))) roots.push(join(root, "created-game"));
  const result: { rel: string; source: string }[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return;
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) { if (entry !== "node_modules" && entry !== "dist") walk(path); }
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) result.push({ rel: relative(root, path).replace(/\\/g, "/"), source: readFileSync(path, "utf8") });
    }
  };
  for (const dir of roots) walk(dir);
  return result;
}

export function findGameFeelGaps(root: string): RatchetFinding[] {
  const files = sources(root);
  const byGame = new Map<string, string>();
  for (const { rel, source } of files) {
    const parts = rel.split("/");
    const game = parts[0] === "Games" ? parts[1]! : "created-game";
    byGame.set(game, `${byGame.get(game) ?? ""}\n${source}`);
  }
  const gaps: RatchetFinding[] = [];
  for (const [game, source] of byGame) {
    if (INPUT.test(source) && !AUDIO.test(source)) gaps.push({ key: `${game}#input-audio`, where: `${game} — input actions need audio.play or ctx.game.audio` });
    if (COMBAT.test(source) && !REACTION.test(source)) gaps.push({ key: `${game}#combat-feedback`, where: `${game} — combat needs hitReaction, impactPresets, or cameraShake` });
    if (CAMERA.test(source) && !SMOOTHING.test(source)) gaps.push({ key: `${game}#camera-smoothing`, where: `${game} — camera needs targetSmoothing or smoothing` });
  }
  return gaps.sort((a, b) => a.key.localeCompare(b.key));
}
