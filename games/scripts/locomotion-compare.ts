// `bun run games:capabilities locomotion [game...]`: score each game's walking player against a real person.
// Loads each game's game.config.ts, finds the player entity in its content catalog, and runs the same start, stop,
// reversal, turn, jump and slope scenarios on the game's movement model and on the human locomotion reference.
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import type { PhysicsConfig } from "@jgengine/core/game/defineGame";
import type { PlayerMovementConfig } from "@jgengine/core/game/playableGame";
import { compareLocomotion, formatLocomotionComparison, type LocomotionComparisonRow } from "@jgengine/core/movement/reference/compareLocomotion";
import { formatHumanValidation, validateHumanReference } from "@jgengine/core/movement/reference/humanReferenceValidation";

const USAGE = `usage: bun run games:capabilities locomotion [game[:entity]...] [--sprint] [--json]
       bun run games:capabilities locomotion --validate
  game        a folder under games/ (default: every game with a walking player)
  :entity     the player's catalog id, when the game sets role "player" only at spawn
  --sprint    measure with sprint held
  --json      print the rows as JSON
  --validate  check the human reference itself against published biomechanics (slow: walks every fitted gait)`;

const GAMES = resolve(import.meta.dir, "..");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Every `defineGame({ movement })` field is optional, so any object is one; the probe reads only the fields it knows. */
function isMovementConfig(value: unknown): value is PlayerMovementConfig {
  return isRecord(value);
}

/** Every `defineGame({ physics })` field is optional. */
function isPhysicsConfig(value: unknown): value is PhysicsConfig {
  return isRecord(value);
}

interface WalkingPlayer {
  game: string;
  entity: string;
  walkSpeed: number;
  movement?: PlayerMovementConfig;
  physics?: PhysicsConfig;
}

/** Quoted identifiers in a game's source: candidates for its player's catalog id. */
function quotedIds(game: string): Set<string> {
  const out = spawnSync("git", ["grep", "-h", "-o", "-E", `"[a-z][a-z0-9_]*"`, "--", `games/${game}/src`], { cwd: resolve(GAMES, ".."), encoding: "utf8" });
  return new Set(["player", ...out.stdout.split("\n").map((line) => line.slice(1, -1)).filter((id) => id.length > 0)]);
}

async function walkingPlayer(target: string): Promise<WalkingPlayer | string> {
  const [game = target, named] = target.split(":");
  const file = join(GAMES, game, "src", "game.config.ts");
  if (!existsSync(file)) return "no game.config.ts";
  const module: unknown = await import(pathToFileURL(file).href);
  if (!isRecord(module)) return "no game export";
  const config = module["game"] ?? module["gameConfig"];
  if (!isRecord(config)) return "no game export";
  const content = config["content"];
  const entityById = isRecord(content) ? content["entityById"] : undefined;
  if (typeof entityById !== "function") return "no entity catalog";
  for (const id of named === undefined ? quotedIds(game) : [named]) {
    let entry: unknown;
    try {
      entry = entityById(id);
    } catch {
      continue;
    }
    if (!isRecord(entry) || (named === undefined && entry["role"] !== "player")) continue;
    const movement = entry["movement"];
    if (!isRecord(movement) || typeof movement["walkSpeed"] !== "number") return `player "${id}" does not walk`;
    const player: WalkingPlayer = { game, entity: id, walkSpeed: movement["walkSpeed"] };
    const gameMovement = config["movement"];
    const gamePhysics = config["physics"];
    if (isMovementConfig(gameMovement)) player.movement = gameMovement;
    if (isPhysicsConfig(gamePhysics)) player.physics = gamePhysics;
    return player;
  }
  return named === undefined ? "no player entity; name it as <game>:<entity> if role is set at spawn" : `no entity "${named}"`;
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return 0;
  }
  if (argv.includes("--validate")) {
    const rows = validateHumanReference();
    console.log(formatHumanValidation(rows));
    return rows.some((row) => !row.pass) ? 1 : 0;
  }
  const sprint = argv.includes("--sprint");
  const json = argv.includes("--json");
  const named = argv.filter((arg) => !arg.startsWith("--"));
  const games = named.length > 0 ? named : readdirSync(GAMES).filter((name) => existsSync(join(GAMES, name, "src", "game.config.ts"))).sort();
  const results: { game: string; entity?: string; walkSpeed?: number; skipped?: string; rows?: LocomotionComparisonRow[] }[] = [];
  for (const game of games) {
    const player = await walkingPlayer(game);
    if (typeof player === "string") {
      results.push({ game, skipped: player });
      continue;
    }
    const subject = { walkSpeed: player.walkSpeed, ...(player.movement === undefined ? {} : { movement: player.movement }), ...(player.physics === undefined ? {} : { physics: player.physics }) };
    results.push({ game, entity: player.entity, walkSpeed: player.walkSpeed, rows: compareLocomotion(subject, { sprint }) });
  }
  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return 0;
  }
  for (const result of results) {
    if (result.rows === undefined) {
      console.log(`## ${result.game}: skipped (${result.skipped ?? "unknown"})\n`);
      continue;
    }
    console.log(`## ${result.game} (${result.entity ?? "player"}, walkSpeed ${result.walkSpeed ?? 0}${sprint ? ", sprinting" : ""})\n`);
    console.log(formatLocomotionComparison(result.rows));
    console.log("");
  }
  return 0;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
