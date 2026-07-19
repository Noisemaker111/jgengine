/**
 * Vetted, minimal, WIRED compositions an outside-game agent can copy-paste, printed
 * by `jgengine recipe <name>`. Each is the *shape of a joint* — what connects to what
 * — not a whole game, so intent maps to imports + a working snippet without reading
 * dozens of `.d.ts` files first.
 *
 * Every snippet's source of truth is the matching real module under
 * `src/recipes/snippets/<name>.ts`, type-checked against the current SDK by
 * `tsconfig.recipes.json` (run in this package's `check-types`), so a recipe can't
 * rot when the SDK changes. `recipes.test.ts` asserts each `code` below stays
 * byte-identical to its snippet file, so the printed text is always the compiled text.
 */

export interface Recipe {
  /** CLI name, e.g. "combat-loop". */
  name: string;
  /** One-line description shown in the list. */
  description: string;
  /** The copy-paste snippet — identical to `src/recipes/snippets/<name>.ts`. */
  code: string;
}

const COMBAT_LOOP = `import { defineGame, defineSystem } from "@jgengine/shell/gameKit";
import { resolveDamageHit } from "@jgengine/core/combat/damageResolution";

// The joint: a gameplay command resolves a data-defined hit, then drains the target's
// health pool through the entity-stats API. Damage math is an engine primitive; the
// system just registers the command and folds the result back into world state.
const combat = defineSystem({
  id: "combat",
  create(ctx) {
    ctx.game.commands.define<{ target: string; impact: number }>("attack", {
      apply(state, { target, impact }) {
        const hit = resolveDamageHit({ channel: "physical", impact, target });
        state.scene.entity.stats.delta(target, "health", -hit.impact);
      },
    });
  },
});

export const game = defineGame({ name: "Combat", systems: [combat] });
// Mount: <GameHost playable={game} />  ·  fire: ctx.game.commands.run("attack", { target: "goblin", impact: 12 })
`;

const BOSS_TELEGRAPH = `import { defineGame, defineSystem } from "@jgengine/shell/gameKit";
import { hazardCycleAt, type HazardCycleConfig } from "@jgengine/core/combat/telegraph";

// The joint: one authored hazard config drives BOTH the fairness contract (when it
// actually hits) and the tell (how full the windup bar is). Sample it each tick from
// the same config the HUD reads — no duplicated timers.
const slam: HazardCycleConfig = { windupMs: 1200, activeMs: 400, cooldownMs: 2000 };

let elapsedMs = 0;
const boss = defineSystem({
  id: "boss",
  tick: { type: "frame" },
  update(_ctx, dt) {
    elapsedMs += dt * 1000;
    const sample = hazardCycleAt(slam, elapsedMs);
    // sample.phase: "windup" | "active" | "cooldown"; during windup sample.fraction (0..1)
    // is the telegraph decal fill the HUD draws. Apply the hit only while it is active.
    if (sample.phase === "active") {
      // deal the slam's damage this frame
    }
  },
});

export const game = defineGame({ name: "Boss", systems: [boss] });
// <GameHost playable={game} />  ·  HUD windup fill = hazardCycleAt(slam, nowMs).fraction while phase === "windup"
`;

const LOOT = `import { seededRng } from "@jgengine/shell/gameKit";
import { createLootRegistry } from "@jgengine/core/game/lootTable";

// The joint: an authored weighted table rolled with INJECTED determinism (never
// Math.random), so a host can roll a kill's drops and replicate the exact result.
const loot = createLootRegistry();
loot.register({
  id: "goblin",
  entries: [
    { item: "coin", count: [3, 8], weight: 70 },
    { item: "dagger", count: 1, weight: 25 },
    { item: "ruby", count: 1, weight: 5 },
  ],
});

const rng = seededRng("run-seed");

export function rollKill(): void {
  for (const drop of loot.roll("goblin", rng)) {
    // grant drop.item × drop.count to the killer's inventory / feed
    void drop;
  }
}
`;

const QUEST = `import { defineGame, defineSystem } from "@jgengine/shell/gameKit";

// The joint: installing a system with \`feature: "quest"\` turns on \`ctx.game.quest\`
// (a journal) — no separate features flag. Register quests in \`create\`, then gameplay
// nudges per-objective progress; the journal is the single source the HUD reads.
const quests = defineSystem({
  id: "quests",
  feature: "quest",
  create(ctx) {
    ctx.game.quest?.register([
      {
        id: "clear-cave",
        title: "Clear the Cave",
        objectives: [{ id: "goblins", kind: "kill", target: "goblin", count: 10 }],
      },
    ]);
    ctx.game.quest?.accept(ctx.player.userId, "clear-cave");
  },
});

export const game = defineGame({ name: "Quest", systems: [quests] });
// advance from gameplay: ctx.game.quest?.progress(userId, "clear-cave", "goblins", 1)
// <GameHost playable={game} />  ·  read ctx.game.quest?.list(userId) for the HUD quest log
`;

const COOP_PRESENCE = `import {
  DEFAULT_POSE_SYNC_RULES,
  decidePoseSync,
  spawnPresenceState,
  type IncomingPose,
} from "@jgengine/core/multiplayer/presenceModel";

// The joint: remote presence is host-authoritative and pure. Spawn a serializable
// state per teammate, then reconcile each incoming pose against the shared rules
// (speed clamp, jump band, staleness) before moving their avatar. No transport
// coupling — feed it whatever your session channel delivers.
let mate = spawnPresenceState({ x: 0, y: 0, z: 0 }, 0, DEFAULT_POSE_SYNC_RULES);

export function onRemotePose(incoming: IncomingPose, nowMs: number): void {
  const decision = decidePoseSync(mate, incoming, DEFAULT_POSE_SYNC_RULES, nowMs);
  if (decision.changed) {
    mate = { ...mate, position: decision.position, rotationY: decision.rotationY, lastSeenAtMs: nowMs };
    // apply decision.position / decision.rotationY to the rendered avatar
  }
}
`;

const THIRD_PERSON_CAMERA = `import { defineGame, type GameCameraConfig } from "@jgengine/shell/gameKit";

// The joint: the camera is game DATA, not chrome. Hand \`defineGame\` a camera config
// and the shell mounts the matching rig — "orbit" is the third-person chase camera
// that follows the player. Tune boom distance/height here; no camera component to wire.
const camera: GameCameraConfig = {
  rig: "orbit",
  minDistance: 3,
  maxDistance: 9,
  targetHeight: 1.6,
};

export const game = defineGame({ name: "Explore", camera });
// <GameHost playable={game} />  — the orbit rig chases the player entity automatically
`;

export const RECIPES: readonly Recipe[] = [
  {
    name: "combat-loop",
    description: "attack command → data-defined damage hit → drained health pool",
    code: COMBAT_LOOP,
  },
  {
    name: "boss-telegraph",
    description: "windup→active→cooldown hazard cycle with a readable telegraph fill",
    code: BOSS_TELEGRAPH,
  },
  {
    name: "loot",
    description: "roll a weighted loot table deterministically on a kill",
    code: LOOT,
  },
  {
    name: "quest",
    description: "enable ctx.game.quest via `feature` and advance per-objective progress",
    code: QUEST,
  },
  {
    name: "coop-presence",
    description: "reconcile a teammate's incoming pose against host-authoritative sync rules",
    code: COOP_PRESENCE,
  },
  {
    name: "third-person-camera",
    description: "mount the orbit (third-person chase) rig via a camera config",
    code: THIRD_PERSON_CAMERA,
  },
] as const;

/** Recipe names in list order. */
export function recipeNames(): string[] {
  return RECIPES.map((recipe) => recipe.name);
}

/** Look a recipe up by name. */
export function getRecipe(name: string): Recipe | undefined {
  return RECIPES.find((recipe) => recipe.name === name);
}

/** Two-space-indented `name   <description>` lines with the name column padded. */
export function renderRecipeList(): string {
  const width = Math.max(...RECIPES.map((recipe) => recipe.name.length));
  return RECIPES.map((recipe) => `  ${recipe.name.padEnd(width)}   ${recipe.description}`).join("\n");
}

/** The copy-paste code for a recipe, or null when the name is unknown. */
export function renderRecipe(name: string): string | null {
  return getRecipe(name)?.code ?? null;
}
