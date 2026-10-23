import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { RatchetFinding } from "./ratchet";

const INPUT = /\b(?:fire|attack|interact)\b/i;
const AUDIO = /audio\.play|ctx\.game\.audio/;
const COMBAT = /combat|hit|damage|attack/i;
const REACTION = /hitReaction|impactPresets|cameraShake/;
const RENDERED_REACTION = /\{\s*(?:[\w$]+\.)*(?:hurt|flash)\s*>\s*0\s*(?:&&\s*<|\?\s*["'])/;
const CAMERA = /camera/i;
const FIRST_PERSON = /\bcamera\s*:\s*\{[^}]*\bperspective\s*:\s*["']first["']/;
const CHASE_DAMPING = /\bcamera\s*:\s*\{[^}]*\bchase\s*:\s*\{[^}]*\bspringDamping\s*:\s*(\d+(?:\.\d+)?|\.\d+)/;
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

/** A game owns `src/`; the games repo also keeps tooling folders (`scripts/`, `.github/`) beside its games. */
function isGameDir(root: string, dir: string): boolean {
  return existsSync(join(root, dir, "src"));
}

export function findGameFeelGaps(root: string): RatchetFinding[] {
  const files = sources(root);
  const byGame = new Map<string, string>();
  const gameDirs = new Map<string, boolean>();
  for (const { rel, source } of files) {
    const parts = rel.split("/");
    const game = parts[0] === "Games" ? parts[1]! : "created-game";
    const dir = parts[0] === "Games" ? join("Games", game) : "created-game";
    const known = gameDirs.get(dir) ?? isGameDir(root, dir);
    gameDirs.set(dir, known);
    if (!known) continue;
    byGame.set(game, `${byGame.get(game) ?? ""}\n${source}`);
  }
  const gaps: RatchetFinding[] = [];
  for (const [game, source] of byGame) {
    if (INPUT.test(source) && !AUDIO.test(source)) gaps.push({ key: `${game}#input-audio`, where: `${game} — input actions need audio.play or ctx.game.audio` });
    if (COMBAT.test(source) && !REACTION.test(source) && !RENDERED_REACTION.test(source)) gaps.push({ key: `${game}#combat-feedback`, where: `${game} — combat needs rendered damage feedback, hitReaction, impactPresets, or cameraShake` });
    if (CAMERA.test(source) && !SMOOTHING.test(source) && !FIRST_PERSON.test(source) && !(Number(CHASE_DAMPING.exec(source)?.[1]) > 0)) gaps.push({ key: `${game}#camera-smoothing`, where: `${game} — camera needs damping or smoothing unless it uses responsive first-person look` });
  }
  return gaps.sort((a, b) => a.key.localeCompare(b.key));
}
