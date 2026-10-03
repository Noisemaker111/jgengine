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

const QUEST_AUTHORING = `import type { QuestDef } from "@jgengine/core/game/quest";
import {
  validateQuestCatalog,
  type QuestCatalogReferenceKind,
  type QuestCatalogValidationOptions,
} from "@jgengine/core/game/questCatalog";

export interface QuestAuthoringFacts {
  revision: string;
  statements: Readonly<Record<string, readonly string[]>>;
  catalogs: Readonly<Record<QuestCatalogReferenceKind, readonly string[]>>;
  externalUnlocks: readonly string[];
  externallyStartedQuests: readonly string[];
}

export interface QuestBatchLimits {
  maxNewQuests: number;
  maxTotalQuests: number;
  maxObjectivesPerQuest: number;
  maxReferencesPerQuest: number;
}

function authoringSnapshot<T>(value: T): T {
  const detached = structuredClone(value);
  function freeze(value: unknown): void {
    if (value === null || typeof value !== "object") return;
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  freeze(detached);
  return detached;
}

export async function authorQuestBatch(
  canonicalFacts: QuestAuthoringFacts,
  establishedQuests: readonly QuestDef[],
  limits: QuestBatchLimits,
  generate: (request: {
    canonicalFacts: QuestAuthoringFacts;
    establishedQuests: readonly QuestDef[];
    limits: QuestBatchLimits;
  }) => Promise<readonly QuestDef[]>,
) {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(\`Invalid authoring limit: \${name}\`);
  }
  if (establishedQuests.length > limits.maxTotalQuests) throw new Error("Established catalog exceeds maxTotalQuests");
  const request = authoringSnapshot({ canonicalFacts, establishedQuests, limits });
  const reviewedFacts = request.canonicalFacts;
  const reviewedQuests = request.establishedQuests;
  const reviewedLimits = request.limits;
  const generated = authoringSnapshot(await generate(request));
  if (generated.length > reviewedLimits.maxNewQuests || generated.length + reviewedQuests.length > reviewedLimits.maxTotalQuests) {
    throw new Error("Generated quest batch exceeds quest limits");
  }
  for (const quest of generated) {
    const references = (quest.requires?.length ?? 0) + (quest.rewards?.quests?.length ?? 0)
      + (quest.rewards?.unlocks?.length ?? 0) + (quest.rewards?.items?.length ?? 0) * 2
      + Object.keys(quest.rewards?.economy ?? {}).length + quest.objectives.length * 2;
    if (quest.objectives.length > reviewedLimits.maxObjectivesPerQuest || references > reviewedLimits.maxReferencesPerQuest) {
      throw new Error(\`Generated quest exceeds objective/reference limits: \${quest.id}\`);
    }
  }
  const lookups = new Map<QuestCatalogReferenceKind, Set<string>>(
    Object.entries(reviewedFacts.catalogs).map(([kind, ids]) => [kind as QuestCatalogReferenceKind, new Set(ids)]),
  );
  const options: QuestCatalogValidationOptions = {
    externalUnlocks: reviewedFacts.externalUnlocks,
    externallyStartedQuests: reviewedFacts.externallyStartedQuests,
    hasReference: (kind, id) => lookups.get(kind)?.has(id) ?? false,
  };
  const candidate = [...reviewedQuests, ...generated];
  const diagnostics = validateQuestCatalog(candidate, options);
  const repair = diagnostics.filter((issue) => issue.severity === "error");
  return {
    factsRevision: reviewedFacts.revision,
    candidate: repair.length === 0 ? candidate : null,
    diagnostics,
    repair,
  };
}
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
import { boardVehicle, createVehicleSeats, leaveVehicle, type VehicleSeats } from "@jgengine/core/scene/vehicleSeat";
import { createKinematicVehicle, type KinematicVehicle } from "@jgengine/core/physics/kinematicVehicle";
import { tickDrivableVehicle } from "@jgengine/core/physics/drivableVehicle";
import type { GameContext } from "@jgengine/shell/gameKit";

const TUNING = {
  engineAccel: 14, brakeAccel: 22, topSpeed: 28, reverseSpeed: 8,
  turnRate: 2.2, turnSpeedRef: 10, gripStrength: 8, handbrakeGrip: 2,
};
const DRIVE = {
  throttle: { positive: ["moveForward"] }, brake: { positive: ["moveBack"] },
  steer: { positive: ["moveRight"], negative: ["moveLeft"] }, handbrake: { positive: ["jump"] },
};
const PEDAL = { min: 0, max: 1 };
const states = new WeakMap<GameContext, { seats: VehicleSeats; sims: Map<string, KinematicVehicle> }>();

function toggleSeat(ctx: GameContext): void {
  const { seats } = states.get(ctx)!;
  const riderId = ctx.player.userId;
  if (seats.isSeated(riderId)) {
    leaveVehicle(ctx, seats, riderId);
    return;
  }
  const vehicleId = ctx.scene.entity.inRadius(riderId, 3, (id) => ctx.scene.entity.get(id)?.name === "car")[0];
  if (vehicleId === undefined) return;
  if (!seats.mounts.isRegistered(vehicleId)) seats.register({ id: vehicleId, kit: { kind: "ground" } });
  boardVehicle(ctx, seats, riderId, vehicleId, { rig: "chase", chase: { distance: 7, height: 3 } });
}

const driving = defineSystem({
  id: "driving",
  tick: { type: "frame" },
  create(ctx) {
    const seats = createVehicleSeats();
    states.set(ctx, { seats, sims: new Map() });
    ctx.game.commands.define("use-vehicle", { apply: toggleSeat });
  },
  save(ctx) {
    const { seats, sims } = states.get(ctx)!;
    return { key: "vehicleSeats", snapshot: () => seats.snapshot(), hydrate(state) {
      for (const car of ctx.scene.entity.list().filter((entity) => entity.name === "car")) {
        if (!seats.mounts.isRegistered(car.id)) seats.register({ id: car.id, kit: { kind: "ground" } });
      }
      seats.restore(state as ReturnType<VehicleSeats["snapshot"]>); sims.clear();
    } };
  },
  reset(ctx) {
    const { seats, sims } = states.get(ctx)!;
    for (const { riderId, mountId } of seats.snapshot()) {
      const pose = ctx.scene.entity.get(mountId) ?? ctx.scene.entity.get(riderId);
      if (pose !== null) leaveVehicle(ctx, seats, riderId, { camera: false, pose });
    }
    seats.reset(); sims.clear(); ctx.camera.reset();
  },
  update(ctx, dt) {
    const { seats, sims } = states.get(ctx)!;
    const riderId = ctx.player.userId, vehicleId = seats.drivenBy(riderId);
    if (vehicleId === null) return;
    const vehicle = ctx.scene.entity.get(vehicleId);
    if (vehicle === null) return;
    let sim = sims.get(vehicleId);
    if (sim === undefined) {
      sim = createKinematicVehicle(TUNING, { position: vehicle.position, heading: vehicle.rotationY });
      sims.set(vehicleId, sim);
    }
    const axis = ctx.input.axis(DRIVE, { throttle: PEDAL, brake: PEDAL, handbrake: PEDAL });
    const drive = tickDrivableVehicle(sim, dt, axis);
    ctx.scene.entity.setPose(vehicleId, drive.pose);
    ctx.scene.entity.setPose(riderId, drive.pose);
  },
});

export const game = defineGame({
  name: "Drive",
  camera: { rig: "orbit" },
  input: { ...DEFAULT_WALK_CODES, "use-vehicle": ["KeyF"] },
  systems: [driving],
});
// Place catalog kind "car" in the editor. Handling remains caller data; see vehicle-feel for force-based motors.
`;

const NARRATIVE_AUTHORING = `import {
  freezeNarrativeCanon,
  validateNarrativeBatch,
  type NarrativeBatch,
  type NarrativeBatchLimits,
  type NarrativeCanon,
  type NarrativeIssue,
} from "@jgengine/core/game/narrativeAuthoring";

interface AuthoringRequest {
  readonly canon: NarrativeCanon;
  readonly brief: string;
  readonly limits: NarrativeBatchLimits;
  readonly attempt: number;
  readonly previous?: NarrativeBatch;
  readonly issues: readonly NarrativeIssue[];
}

interface ReviewDecision {
  readonly approved: boolean;
  readonly issues: readonly NarrativeIssue[];
}

function frozenCopy<T>(source: T): T {
  const copy = structuredClone(source);
  function freeze(value: unknown): void {
    if (value === null || typeof value !== "object") return;
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  freeze(copy);
  return copy;
}

// Typed authored data only: decode external JSON before returning it from generate.
// The generator and reviewer receive detached frozen snapshots across every await.
export async function authorNarrative(options: {
  canon: NarrativeCanon;
  brief: string;
  limits: NarrativeBatchLimits;
  maxAttempts: number;
  generate: (request: AuthoringRequest) => Promise<NarrativeBatch>;
  review: (request: AuthoringRequest & { readonly candidate: NarrativeBatch }) => Promise<ReviewDecision>;
}): Promise<
  | { status: "accepted"; batch: NarrativeBatch; attempts: number }
  | { status: "needs-review"; batch: NarrativeBatch | undefined; issues: readonly NarrativeIssue[]; attempts: number }
> {
  const { generate, review, maxAttempts, brief } = options;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) throw new RangeError("maxAttempts must be a positive safe integer.");
  const canon = freezeNarrativeCanon(options.canon);
  const limits = frozenCopy(options.limits);
  validateNarrativeBatch(canon, { canonRevision: canon.revision, dialogues: [] }, limits);
  let previous: NarrativeBatch | undefined;
  let issues: readonly NarrativeIssue[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const request = frozenCopy({ canon, brief, limits, attempt, previous, issues });
    const generated = await generate(request);
    issues = frozenCopy(validateNarrativeBatch(canon, generated, limits));
    if (issues.some((issue) => issue.code === "batch-budget" || issue.code === "stale-canon")) {
      previous = undefined;
      continue;
    }
    const candidate = frozenCopy(generated);
    previous = candidate;
    if (issues.some((issue) => issue.severity === "error")) continue;
    const decision = frozenCopy(await review(frozenCopy({ ...request, issues, candidate })));
    issues = frozenCopy([...issues, ...decision.issues]);
    if (decision.approved === true && !issues.some((issue) => issue.severity === "error")) {
      return { status: "accepted", batch: candidate, attempts: attempt };
    }
    if (decision.issues.length === 0) {
      issues = frozenCopy([...issues, {
        code: "semantic-review", severity: "error" as const, path: "/dialogues",
        message: "Reviewer did not explicitly approve. Review motivations, chronology, consequences and playable choices.",
      }]);
    }
  }
  return { status: "needs-review", batch: previous, issues, attempts: maxAttempts };
}

// Caller supplies the style brief, chapter slice, generator and semantic reviewer.
// Stage an accepted batch for playtesting; promotion and new canon revisions stay explicit.
// No model, network service, genre, assets or automatic canon replacement is selected here.
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
    name: "quest-authoring",
    description: "bounded generated quest batches against canonical facts with located repair diagnostics",
    code: QUEST_AUTHORING,
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
  {
    name: "narrative-authoring",
    description: "reviewed canon → bounded dialogue generation → located repair → explicit semantic approval",
    code: NARRATIVE_AUTHORING,
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
