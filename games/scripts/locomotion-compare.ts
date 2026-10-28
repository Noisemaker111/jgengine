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
import { compareRagdollFall, formatRagdollFall } from "@jgengine/core/movement/reference/compareRagdollFall";
import { validateHumanFall } from "@jgengine/core/movement/reference/humanFall";
import { compareQuadruped, validateQuadrupedReference, type QuadrupedComparison } from "@jgengine/core/movement/reference/quadrupedGait";
import { compareBiped, validateBipedReference, type BipedComparison } from "@jgengine/core/movement/reference/bipedRunning";

const USAGE = `usage: bun run games:capabilities locomotion [game[:entity]...] [--sprint] [--json]
       bun run games:capabilities locomotion --creatures <module>#<export> [--bipeds <id,...>] [--json]
       bun run games:capabilities locomotion --falls [--json]
       bun run games:capabilities locomotion --validate
  game        a folder under games/ (default: every game with a walking player)
  :entity     the player's catalog id, when the game sets role "player" only at spawn
  --sprint    measure with sprint held
  --json      print the rows as JSON
  --creatures every {id, walk, sprint} record in the export (a CreatureBody table) vs a real animal of the size the
              game's entityModels draw it (hip height 0.45 of targetHeight)
  --bipeds    creatures (by id) to score as two-legged theropods instead: bird walk-run, top speed and whether
              a Tyrannosaurus leg scaled to them could carry a fast run (hip height 0.75 of targetHeight)
  --falls     the stock humanoid ragdoll's backward fall and drop landings vs a simulated person and injury limits
  --validate  check the human, quadruped, biped and fall references themselves against published biomechanics (slow: walks every fitted gait)`;

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

/** Hip-joint height over a standing animal's overall height (head up): about 0.45 for a horse or a dog. */
const HIP_OVER_HEIGHT = 0.45;

/** Hip-joint height over a theropod's standing height: about 0.75 for Tyrannosaurus (3.1 m leg, about 4 m tall). */
const BIPED_HIP_OVER_HEIGHT = 0.75;

/** Every record with numeric `walk` and `sprint` (a `CreatureBody`) and a string `id` inside `value`. */
function collectCreatures(value: unknown, out: { id: string; walk: number; sprint: number }[], depth = 0): void {
  if (!isRecord(value) || depth > 4) return;
  const id = value["id"];
  const walk = value["walk"];
  const sprint = value["sprint"];
  if (typeof id === "string" && typeof walk === "number" && typeof sprint === "number") {
    out.push({ id, walk, sprint });
    return;
  }
  for (const entry of Object.values(value)) collectCreatures(entry, out, depth + 1);
}

async function creatures(spec: string, bipedIds: ReadonlySet<string>, json: boolean): Promise<number> {
  const [file, name] = spec.split("#");
  if (file === undefined || name === undefined) {
    console.error(USAGE);
    return 2;
  }
  const path = resolve(GAMES, "..", file);
  const module: unknown = await import(pathToFileURL(path).href);
  const found: { id: string; walk: number; sprint: number }[] = [];
  if (isRecord(module)) collectCreatures(module[name], found);
  const game = /games[\\/]([^\\/]+)[\\/]/.exec(path)?.[1];
  const configModule: unknown = game === undefined ? undefined : await import(pathToFileURL(join(GAMES, game, "src", "game.config.ts")).href);
  const config = isRecord(configModule) ? (configModule["game"] ?? configModule["gameConfig"]) : undefined;
  const models = isRecord(config) && isRecord(config["entityModels"]) ? config["entityModels"] : {};
  const rows: ({ id: string; walk: number; sprint: number; height: number } & QuadrupedComparison)[] = [];
  const bipeds: ({ id: string; walk: number; sprint: number; height: number } & BipedComparison)[] = [];
  const skipped: string[] = [];
  for (const creature of found) {
    const model = models[creature.id];
    const height = isRecord(model) && typeof model["targetHeight"] === "number" ? model["targetHeight"] : undefined;
    if (height === undefined) {
      skipped.push(creature.id);
      continue;
    }
    if (bipedIds.has(creature.id)) bipeds.push({ ...creature, height, ...compareBiped({ walkSpeed: creature.walk, runSpeed: creature.sprint, hipHeight: BIPED_HIP_OVER_HEIGHT * height }) });
    else rows.push({ ...creature, height, ...compareQuadruped({ walkSpeed: creature.walk, runSpeed: creature.sprint, hipHeight: HIP_OVER_HEIGHT * height }) });
  }
  if (json) {
    console.log(JSON.stringify({ rows, bipeds, skipped }, null, 2));
    return 0;
  }
  const f = (v: number, digits = 1) => v.toFixed(digits);
  console.log("| Creature | Height (m) | Mass est. (kg) | Walk (m/s) | Real walk–trot | Walk gait | Sprint (m/s) | Sprint gait | Real top speed | Sprint ÷ real |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of rows) console.log(`| ${r.id} | ${f(r.height)} | ${f(r.mass, 0)} | ${f(r.walk)} | ${f(r.referenceWalkMax)} | ${r.walkGait} | ${f(r.sprint)} | ${r.runGait} | ${f(r.referenceTopSpeed)} | ${f(r.topSpeedRatio, 2)} |`);
  if (bipeds.length > 0) {
    console.log("\n| Biped | Height (m) | Mass est. (kg) | Walk (m/s) | Real walk–run | Walk gait | Sprint (m/s) | Sprint Froude | Real top speed | Sprint ÷ real | Leg muscle a fast run needs (% body) | Muscle there ÷ needed |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const r of bipeds) console.log(`| ${r.id} | ${f(r.height)} | ${f(r.mass, 0)} | ${f(r.walk)} | ${f(r.referenceWalkMax)} | ${r.walkGait} | ${f(r.sprint)} | ${f(r.runFroude)} | ${f(r.referenceTopSpeed)} | ${f(r.topSpeedRatio, 2)} | ${f(r.extensorMassNeeded)} | ${f(r.runningSupport, 2)} |`);
  }
  if (skipped.length > 0) console.log(`\nNo model height: ${skipped.join(", ")}`);
  return 0;
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return 0;
  }
  const creatureSpec = argv.indexOf("--creatures");
  const bipedFlag = argv.indexOf("--bipeds");
  const bipedIds = new Set(bipedFlag >= 0 ? (argv[bipedFlag + 1] ?? "").split(",").filter((id) => id.length > 0) : []);
  if (creatureSpec >= 0) return creatures(argv[creatureSpec + 1] ?? "", bipedIds, argv.includes("--json"));
  if (argv.includes("--falls")) {
    const rows = compareRagdollFall();
    console.log(argv.includes("--json") ? JSON.stringify(rows, null, 2) : formatRagdollFall(rows));
    return 0;
  }
  if (argv.includes("--validate")) {
    const rows = [...validateHumanReference(), ...validateQuadrupedReference(), ...validateBipedReference(), ...validateHumanFall()];
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
