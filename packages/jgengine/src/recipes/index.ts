/**
 * Vetted, minimal, WIRED compositions an outside-game agent can copy-paste, printed
 * by `jgengine recipe <name>`. Each is the *shape of a joint* — what connects to what
 * — not a whole game, so intent maps to imports + a working snippet without reading
 * dozens of `.d.ts` files first.
 *
 * Every snippet's source of truth is the matching real module under
 * `src/recipes/snippets/<name>.ts` (`.tsx` for a recipe with UI), type-checked against the current SDK by
 * `tsconfig.recipes.json` (run in this package's `check-types`), so a recipe can't
 * rot when the SDK changes. `recipes.test.ts` asserts each `code` below stays
 * byte-identical to its snippet file, so the printed text is always the compiled text.
 */

export interface Recipe {
  /** CLI name, e.g. "combat-loop". */
  name: string;
  /** One-line description shown in the list. */
  description: string;
  /** The copy-paste snippet — identical to `src/recipes/snippets/<name>.ts` (`.tsx` for a recipe with UI). */
  code: string;
}

const COMBAT_LOOP = `import { defineGame, defineSystem } from "@jgengine/shell/gameKit";
import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

// The joint: damage goes through ctx.scene.entity.effect, never a raw stats.delta.
// The catalog \`receive\` map names the pools an effect drains, in order (put "shield"
// before "health" for shield-then-health). Draining the last pool runs the death
// pipeline: despawn, the \`entity.died\` event, and the catalog's \`onDeath\` drops.
// An effect with no \`receive\` rule is ignored — check with ctx.scene.entity.canReceive.
const content: GameContextContent = {
  entityById(catalogId) {
    if (catalogId !== "goblin") return null;
    return {
      role: "enemy",
      stats: { health: { max: 30 } },
      receive: { damage: { order: ["health"] } },
    };
  },
};

const combat = defineSystem({
  id: "combat",
  create(ctx) {
    ctx.game.commands.define<{ target: string; amount: number }>("attack", {
      apply(state, { target, amount }) {
        state.scene.entity.effect({ from: state.player.userId, to: target, effect: "damage", via: { amount } });
      },
    });
  },
});

export const game = defineGame({ name: "Combat", content, systems: [combat] });
// Mount: <GameHost playable={game} />  ·  fire: ctx.game.commands.run("attack", { target: goblinId, amount: 12 })
// Data-defined hit math (channels, resistances): resolveDamageHit from @jgengine/core/combat/damageResolution,
// then pass its \`impact\` as \`via.amount\`.
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

const LOOT = `import { defineGame, defineSystem } from "@jgengine/shell/gameKit";
import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

// The joint: register the table on ctx.game.loot (rolled with the world's seeded
// ctx.rng, so a host and its replicas roll the same drops) and point the enemy's
// catalog \`onDeath\` at it. A kill through ctx.scene.entity.effect rolls the table and
// grants the drops to the killer's bag. For drops on the ground: \`recipe world-drops\`.
const content: GameContextContent = {
  entityById(catalogId) {
    if (catalogId !== "goblin") return null;
    return {
      role: "enemy",
      stats: { health: { max: 30 } },
      receive: { damage: { order: ["health"] } },
      onDeath: { drops: [{ table: "goblin" }] },
    };
  },
};

const loot = defineSystem({
  id: "loot",
  create(ctx) {
    ctx.game.loot.register({
      id: "goblin",
      entries: [
        { item: "coin", count: [3, 8], weight: 70 },
        { item: "dagger", count: 1, weight: 25 },
        { item: "ruby", count: 1, weight: 5 },
      ],
    });
  },
});

export const game = defineGame({ name: "Loot", content, inventories: { bag: { slots: 20 } }, systems: [loot] });
// A chest or quest reward: ctx.game.loot.grantToPlayer(userId, ctx.game.loot.roll("goblin"), "chest")
// Listen: ctx.game.events.on("loot.granted", ({ userId, drops }) => ...)
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

const WORLD_DROPS = `import { defineGame, defineSystem } from "@jgengine/shell/gameKit";
import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

// The joint: catalog \`onDeath\` with dropMode "world" scatters a kill's drops on the
// ground as world items; \`worldItem.rarityStyle\` gives each rarity a beam, color and
// label; item \`rarity\` comes from the item catalog. Pick up with a click
// (\`pointer.grabWorldItems\`), by walking over (\`worldItem.autoPickup\`), or on a key
// through ctx.scene.worldItem as the "loot" command below does.
const content: GameContextContent = {
  itemById(itemId) {
    if (itemId === "rusty-sword") return { rarity: "common" };
    if (itemId === "sunblade") return { rarity: "legendary" };
    return null;
  },
  entityById(catalogId) {
    if (catalogId !== "bandit") return null;
    return {
      role: "enemy",
      stats: { health: { max: 40 } },
      receive: { damage: { order: ["health"] } },
      onDeath: { drops: [{ table: "bandit" }], dropMode: "world" },
    };
  },
};

const looting = defineSystem({
  id: "looting",
  create(ctx) {
    ctx.game.loot.register({
      id: "bandit",
      entries: [
        { item: "rusty-sword", count: 1, weight: 90 },
        { item: "sunblade", count: 1, weight: 10 },
      ],
    });
    ctx.game.commands.define("loot", {
      apply(state) {
        const me = state.scene.entity.get(state.player.userId);
        if (me === null) return;
        const nearest = state.scene.worldItem.nearestInRadius(me.position, 2.5);
        if (nearest !== null) state.scene.worldItem.pickup(nearest, state.player.userId);
      },
    });
  },
});

export const game = defineGame({
  name: "Drops",
  content,
  inventories: { bag: { slots: 20 } },
  input: { loot: ["KeyE"] },
  pointer: { grabWorldItems: true },
  worldItem: {
    rarityStyle: {
      common: { color: "#d0d0d0", label: "Common" },
      legendary: { color: "#ff9a1f", beam: true, label: "Legendary" },
    },
    beamHeight: 4,
  },
  systems: [looting],
});
// Pressing E runs the same-named "loot" command. Bag contents: ctx.player.inventory.count("bag", "sunblade").
`;

const CLICK_TARGET = `import { defineGame, defineSystem } from "@jgengine/shell/gameKit";

// The joint: \`pointer.moveCommand\` runs on every left-click with the clicked \`entity\`
// (or null on open ground), so one command turns clicks into ctx.scene.entity.setTarget.
// Tab cycles hostiles with cycleTarget. The HUD reads the same target:
//   const target = useTarget(userId)   (@jgengine/react)
//   <StatBar entityId={target ?? ""} statId="health" />   (@jgengine/shell/gameKit)
const targeting = defineSystem({
  id: "targeting",
  create(ctx) {
    ctx.game.commands.define<{ entity: string | null }>("select-target", {
      apply(state, { entity }) {
        const me = state.player.userId;
        state.scene.entity.setTarget(me, entity === me ? null : entity);
      },
    });
    ctx.game.commands.define("next-target", {
      apply(state) {
        state.scene.entity.cycleTarget(state.player.userId, { filter: "hostile" });
      },
    });
  },
});

export const game = defineGame({
  name: "Targeting",
  pointer: { moveCommand: "select-target" },
  input: { "next-target": ["Tab"] },
  systems: [targeting],
});
// Abilities read the target: ctx.scene.entity.getTarget(ctx.player.userId), then range-check with
// ctx.scene.entity.distance(me, target) before ctx.scene.entity.effect(...).
`;

const ABILITY_BAR = `import { useMemo } from "react";
import { defineGame, defineSystem } from "@jgengine/shell/gameKit";
import { createAbilityKit } from "@jgengine/core/combat/abilityKit";
import { ActionBar, actionFromAbilitySlot, useAbilitySlots, useGameContext } from "@jgengine/react";

// The joint: one ability kit is the source of truth for cooldowns. A cooldown group
// every slot joins is the global cooldown. Keys go through \`input\` actions that run
// same-named commands; the bar only renders the kit and forwards clicks, with its own
// hotkeys off so a key press never casts twice.
const ABILITIES = [
  { id: "ability1", label: "Strike", key: "Digit1", cooldownMs: 0, damage: 12, range: 3 },
  { id: "ability2", label: "Rend", key: "Digit2", cooldownMs: 6000, damage: 20, range: 3 },
  { id: "ability3", label: "Throw", key: "Digit3", cooldownMs: 10000, damage: 15, range: 20 },
] as const;

export const abilities = createAbilityKit(
  ABILITIES.map((a) => ({ id: a.id, cooldownMs: a.cooldownMs, groups: ["gcd"] })),
  { groups: [{ id: "gcd", cooldownMs: 1500 }] },
);

const casting = defineSystem({
  id: "casting",
  tick: { type: "frame" },
  create(ctx) {
    for (const ability of ABILITIES) {
      ctx.game.commands.define(ability.id, {
        apply(state) {
          const me = state.player.userId;
          const target = state.scene.entity.getTarget(me);
          if (target === null) return;
          const distance = state.scene.entity.distance(me, target);
          if (distance === null || distance > ability.range) return;
          if (!abilities.cast(ability.id).ok) return;
          state.scene.entity.effect({ from: me, to: target, effect: "damage", via: { amount: ability.damage } });
        },
      });
    }
  },
  update(_ctx, dt) {
    abilities.tick(dt);
  },
});

function AbilityBar() {
  const ctx = useGameContext();
  const slots = useAbilitySlots(abilities);
  const defs = useMemo(
    () =>
      slots.map((slot) => {
        const ability = ABILITIES.find((a) => a.id === slot.id);
        return actionFromAbilitySlot(slot, { label: ability?.label ?? slot.id, hotkey: ability?.key.replace("Digit", "") });
      }),
    [slots],
  );
  return <ActionBar defs={defs} hotkeys={false} onActivate={(id) => ctx.game.commands.run(id, {})} />;
}

export const game = defineGame({
  name: "Abilities",
  input: Object.fromEntries(ABILITIES.map((a) => [a.id, [a.key]])),
  systems: [casting],
  GameUI: AbilityBar,
});
// Targets come from \`recipe click-target\`; damage lands through the \`receive\` map in \`recipe combat-loop\`.
`;

const HITSCAN_WEAPON = `import { defineGame, defineSystem } from "@jgengine/shell/gameKit";
import { resolveShot } from "@jgengine/core/combat/shotOrigin";
import type { GameContextContent } from "@jgengine/core/runtime/gameContext";
import type { Aim } from "@jgengine/core/scene/spatial";

// The joint: an input action runs the same-named command with the camera's \`aim\`
// ({ yaw, pitch }); \`repeatMs\` re-fires it while held, so it is the fire rate.
// resolveShot turns the aim into an eye-height ray, ctx.scene.raycast finds the first
// hitbox, and the hit lands through ctx.scene.entity.effect so shields, death and
// onDeath drops all run. \`receive\` order "shield" then "health" is shield-over-health.
const content: GameContextContent = {
  entityById(catalogId) {
    if (catalogId !== "raider") return null;
    return {
      role: "enemy",
      stats: { shield: { max: 40 }, health: { max: 60 } },
      receive: { bullet: { order: ["shield", "health"] } },
    };
  },
};

const shooting = defineSystem({
  id: "shooting",
  create(ctx) {
    ctx.game.commands.define<{ aim: Aim }>("fire", {
      apply(state, { aim }) {
        const me = state.player.userId;
        const shot = resolveShot(
          {
            positionOf: (id) => state.scene.entity.get(id)?.position,
            rotationYOf: (id) => state.scene.entity.get(id)?.rotationY,
            collidersOf: (id) => state.scene.entity.collidersOf(id),
          },
          me,
          aim,
        );
        if (shot === null) return;
        const hit = state.scene.raycast({ origin: shot.origin, direction: shot.direction, maxDistance: 80, excludeInstanceIds: [me] });
        if (hit === null || hit.targetKind !== "entity" || !hit.damageEligible) return;
        state.scene.entity.effect({ from: me, to: hit.instanceId, effect: "bullet", via: { amount: 9 } });
      },
    });
  },
});

export const game = defineGame({
  name: "Hitscan",
  content,
  camera: { rig: "first" },
  input: { fire: { hold: ["mouse0"], repeatMs: 120 } },
  systems: [shooting],
});
// Magazine and reload: createMagazine (@jgengine/core/combat/magazine). Player shield regen:
// createRegenShield (@jgengine/core/combat/regenShield). Rolled gun stats: \`recipe rolled-gear\`.
`;

const ROLLED_GEAR = `import { seededRng } from "@jgengine/shell/gameKit";
import { createAffixRoller, type ItemBaseDef } from "@jgengine/core/item/affix";

// The joint: one roller turns a base item into a rolled one. A weighted rarity tier
// multiplies the base stats (\`statScale\`) and draws affixes from the base's pools;
// affix name parts build the display name. Pass a seeded rng (ctx.rng in a game) so a
// drop re-rolls identically on the host, its replicas and a reload.
const roller = createAffixRoller({
  rarities: [
    { id: "common", weight: 70, affixCount: 0 },
    { id: "rare", weight: 25, affixCount: 1, statScale: 1.15, namePart: "Rare" },
    { id: "legendary", weight: 5, affixCount: [2, 3], statScale: 1.4, namePart: "Legendary" },
  ],
  pools: [
    {
      id: "gun",
      affixes: [
        { id: "hot", stat: "fireDamage", op: "add", roll: [4, 9], weight: 3, namePart: { position: "prefix", text: "Blazing" } },
        { id: "fast", stat: "fireRate", op: "mul", roll: [1.1, 1.3], weight: 4, namePart: { position: "prefix", text: "Rapid" } },
        { id: "deep", stat: "magazine", op: "add", roll: [4, 12], weight: 3, namePart: { position: "suffix", text: "of Plenty" } },
      ],
    },
  ],
});

const RIFLE: ItemBaseDef = {
  id: "rifle",
  name: "Rifle",
  baseStats: { damage: 12, fireRate: 8, magazine: 24 },
  pools: ["gun"],
};

export function rollGun(seed: string) {
  return roller.rollRandom(RIFLE, seededRng(seed));
}
// rollGun("drop-42") → { rarity, name: "Legendary Blazing Rifle of Plenty", stats, affixes }.
// Drop it with a rarity beam: \`recipe world-drops\` (item catalog \`rarity\` = the rolled rarity).
`;

const ENTER_VEHICLE = `import { DEFAULT_WALK_CODES, defineGame, defineSystem } from "@jgengine/shell/gameKit";
import { createVehicleSeats } from "@jgengine/core/scene/vehicleSeat";
import { createKinematicVehicle, type KinematicVehicle, type KinematicVehicleTuning } from "@jgengine/core/physics/kinematicVehicle";
import { tickDrivableVehicle } from "@jgengine/core/physics/drivableVehicle";
import type { GameContext } from "@jgengine/shell/gameKit";

// The joint: VehicleSeats decides who sits where and returns the patches to apply
// (freeze the rider, point the camera at the car); the game applies them. While
// seated, the walk actions double as the drive axes: ctx.input.axis samples ACTION
// names, not key codes. tickDrivableVehicle steps the sim into a setPose-ready pose.
const TUNING: KinematicVehicleTuning = {
  engineAccel: 14,
  brakeAccel: 22,
  topSpeed: 28,
  reverseSpeed: 8,
  turnRate: 2.2,
  turnSpeedRef: 10,
  gripStrength: 8,
  handbrakeGrip: 2,
};
const DRIVE = {
  throttle: { positive: ["moveForward"] },
  brake: { positive: ["moveBack"] },
  steer: { positive: ["moveRight"], negative: ["moveLeft"] },
  handbrake: { positive: ["jump"] },
};
const PEDAL = { min: 0, max: 1 };

const seats = createVehicleSeats();
const sims = new Map<string, KinematicVehicle>();

// driveTarget returns the rider's own id when they are not seated, so check isSeated first.
function carDrivenBy(riderId: string): string | null {
  return seats.isSeated(riderId) ? seats.mounts.driveTarget(riderId) : null;
}

function toggleSeat(ctx: GameContext): void {
  const me = ctx.player.userId;
  const rider = ctx.scene.entity.get(me);
  if (rider === null) return;
  const seatedIn = carDrivenBy(me);
  if (seatedIn !== null) {
    const car = ctx.scene.entity.get(seatedIn);
    if (car === null) return;
    const out = seats.exit(me, { position: car.position, rotationY: car.rotationY });
    if (!out.ok) return;
    ctx.scene.entity.setPose(me, out.placement);
    ctx.scene.entity.update(me, { hidden: false, movement: { ...rider.movement, ...out.riderMovementPatch } });
    ctx.camera.follow(out.cameraTarget);
    return;
  }
  const car = ctx.scene.entity.list().find((e) => e.name === "car" && (ctx.scene.entity.distance(me, e.id) ?? Infinity) < 3);
  if (car === undefined) return;
  if (!sims.has(car.id)) {
    seats.register({ id: car.id, kit: { kind: "ground" }, seats: [{ id: "driver", offset: [0, 0, 0], control: true }] });
    sims.set(car.id, createKinematicVehicle(TUNING, { position: car.position, heading: car.rotationY }));
  }
  const inn = seats.enter(me, car.id);
  if (!inn.ok) return;
  ctx.scene.entity.update(me, { hidden: true, movement: { ...rider.movement, ...inn.riderMovementPatch } });
  ctx.camera.follow(inn.cameraTarget);
}

const driving = defineSystem({
  id: "driving",
  tick: { type: "frame" },
  create(ctx) {
    ctx.game.commands.define("use-vehicle", { apply: (state) => toggleSeat(state) });
  },
  update(ctx, dt) {
    const me = ctx.player.userId;
    const carId = carDrivenBy(me);
    const sim = carId === null ? undefined : sims.get(carId);
    if (carId === null || sim === undefined) return;
    const axis = ctx.input.axis(DRIVE, { throttle: PEDAL, brake: PEDAL, handbrake: PEDAL });
    const drive = tickDrivableVehicle(sim, dt, axis);
    ctx.scene.entity.setPose(carId, drive.pose);
    ctx.scene.entity.setPose(me, { position: drive.pose.position, rotationY: drive.pose.rotationY });
  },
});

export const game = defineGame({
  name: "Drive",
  input: { ...DEFAULT_WALK_CODES, "use-vehicle": ["KeyF"] },
  systems: [driving],
});
// Place the car in the editor as a spawn of catalog kind "car" (role "vehicle"). Chase feel:
// ctx.camera.setChaseTuning(...) with \`camera: { rig: "chase" }\`. Handling that matters: \`recipe\`
// vehicle-feel in jgengine-world (createVehicleDynamics + measureHandling).
`;

export const RECIPES: readonly Recipe[] = [
  {
    name: "combat-loop",
    description: "attack command → ctx.scene.entity.effect → catalog receive map → death + onDeath",
    code: COMBAT_LOOP,
  },
  {
    name: "boss-telegraph",
    description: "windup→active→cooldown hazard cycle with a readable telegraph fill",
    code: BOSS_TELEGRAPH,
  },
  {
    name: "loot",
    description: "ctx.game.loot table rolled on a kill via catalog onDeath, granted into the bag",
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
  {
    name: "world-drops",
    description: "kill drops scattered on the ground with rarity loot beams, picked up with a key or click",
    code: WORLD_DROPS,
  },
  {
    name: "click-target",
    description: "click an entity (or Tab) to set the player's target; target frame reads it",
    code: CLICK_TARGET,
  },
  {
    name: "ability-bar",
    description: "ability kit with a global cooldown on keys 1-3, rendered as an ActionBar",
    code: ABILITY_BAR,
  },
  {
    name: "hitscan-weapon",
    description: "held fire button → aim → raycast → shield-then-health damage",
    code: HITSCAN_WEAPON,
  },
  {
    name: "rolled-gear",
    description: "roll a gun's rarity, stats and prefix/suffix affixes from a seed",
    code: ROLLED_GEAR,
  },
  {
    name: "enter-vehicle",
    description: "walk up to a car, enter, drive with the walk keys, exit beside the door",
    code: ENTER_VEHICLE,
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
