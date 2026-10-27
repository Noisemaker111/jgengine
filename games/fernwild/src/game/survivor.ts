import { canCraft, craftSeconds, type RecipeDef } from "@jgengine/core/crafting/recipe";
import { createUnlockPoints, type UnlockPoints, type UnlockPointsState } from "@jgengine/core/economy/unlockPoints";
import { createScatterHarvest, type ScatterHarvest, type ScatterHarvestState } from "@jgengine/core/harvest/scatterHarvest";
import { resolveEncumbrance, totalLoad } from "@jgengine/core/inventory/encumbrance";
import type { InventoryState } from "@jgengine/core/inventory/inventoryModel";
import { leveling } from "@jgengine/core/progression/leveling";
import { createStatPoints, type StatPointLine } from "@jgengine/core/progression/statPoints";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { resolveScatter } from "@jgengine/core/scatter/scatterRegion";
import { scatterClearingOf } from "@jgengine/core/scatter/scatterClearing";
import { bodyComfort, type BodyComfort } from "@jgengine/core/survival/bodyTemperature";
import { createVitals, type Vitals, type VitalsState } from "@jgengine/core/survival/vitals";
import { cancelJob, createWorkQueue, enqueue, jobProgress, tick as tickQueue, type WorkQueueConfig, type WorkQueueState } from "@jgengine/core/work/jobQueue";

import { editorLayers } from "../editorLayers";
import { BAG, BAG_SLOTS, HOTBAR } from "./bags";
import { ENGRAMS, engramDef, CRAFTING_RECIPES, recipeDef } from "./data/engrams";
import { gatheredBy, HARVESTABLES } from "./data/harvestables";
import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { FIST, itemDef, itemLabel, itemTraits, PICK_UP, type ToolDef } from "./data/items";
import { placeHeld, stations, strikeStructure } from "./base";
import { mountCanSprint, strikeCreature } from "./creatures";
import { climateAt, inWater, type ClimateHere } from "./climate";
import { leaveBody } from "./deathBody";
import { openScreen } from "./screens";
import { COMFORT, ENGRAM_POINTS, LEVEL_STATS, MAX_LEVEL, SURVIVOR, survivorVitals, XP_TO_LEVEL, type LevelStat } from "./data/survivor";


type StatId = LevelStat["id"];

interface CraftSpec {
  recipeId: string;
}

/** Everything that is the survivor's own and not the world's: vitals, levels, engrams, the crafting queue. */
interface Survivor {
  vitals: Vitals;
  points: Record<StatId, number>;
  engrams: UnlockPoints;
  queue: WorkQueueState<CraftSpec>;
  harvest: ScatterHarvest;
  placed: boolean;
  activeSlot: number | null;
  swingReady: number;
  comfort: BodyComfort;
  /** The air and weather where the survivor stood last tick. */
  climate: ClimateHere | null;
  lastGain: { text: string; at: number } | null;
  /** What sits in front of the survivor: the struck node in reach, or what E would pick. */
  aim: { strike: string | null; pick: string | null; pickAt: { x: number; z: number } | null; water: boolean };
  dead: boolean;
  /** Webbed (the Broodmother's spit): moving at this share of speed until this game time. */
  web: { slow: number; until: number } | null;
}

/** ARK's survivor stats: pools start at the survivor's base, percentages at 100%, fortitude at 0. */
const POINTS = createStatPoints({
  stats: Object.fromEntries(
    LEVEL_STATS.map((stat) => [stat.id, { base: stat.id === "melee" || stat.id === "speed" || stat.id === "crafting" ? 100 : stat.id === "fortitude" ? 0 : SURVIVOR[stat.id], perPoint: stat.per }]),
  ) as Record<StatId, StatPointLine>,
});

const track = leveling({ xpForLevel: XP_TO_LEVEL, maxLevel: MAX_LEVEL, thresholdMode: "cumulative" });

const survivorOf = perContext((ctx: GameContext): Survivor => ({
  vitals: createVitals(survivorVitals()),
  points: POINTS.empty(),
  engrams: freshEngrams(),
  queue: createWorkQueue<CraftSpec>(),
  harvest: createScatterHarvest({ kinds: HARVESTABLES, clearing: scatterClearingOf(ctx), rng: () => ctx.rng() }),
  placed: false,
  activeSlot: null,
  swingReady: 0,
  comfort: bodyComfort(25, COMFORT),
  climate: null,
  lastGain: null,
  aim: { strike: null, pick: null, pickAt: null, water: false },
  dead: false,
  web: null,
}));

/** Level-1 engrams are known from the start, like a fresh ARK survivor. */
function freshEngrams(): UnlockPoints {
  const engrams = createUnlockPoints({ perLevel: ENGRAM_POINTS });
  for (const entry of ENGRAMS) if (entry.points === 0) engrams.spend(entry.id, 0);
  return engrams;
}

// --- stats --------------------------------------------------------------------------------

function statValue(survivor: Survivor, id: StatId): number {
  return POINTS.value(survivor.points, id);
}

/** The survivor's level, 1 at the start. */
export function survivorLevel(ctx: GameContext): number {
  return ctx.scene.entity.stats.get(ctx.player.userId, "level")?.current ?? 1;
}

function unspentPoints(ctx: GameContext, survivor: Survivor): number {
  return POINTS.unspent(survivor.points, survivorLevel(ctx) - 1);
}

/** Push levelled maxes into the vitals and the entity's health pool. */
function applyMaxes(ctx: GameContext, survivor: Survivor, fill: boolean): void {
  for (const id of ["health", "stamina", "oxygen", "food", "water"] as const) {
    survivor.vitals.setMax(id, statValue(survivor, id), fill);
  }
  ctx.scene.entity.stats.set(ctx.player.userId, "health", { max: survivor.vitals.max("health"), current: survivor.vitals.value("health") });
}

export function grantXp(ctx: GameContext, amount: number): void {
  const survivor = survivorOf(ctx);
  const before = survivorLevel(ctx);
  track.grantXp(ctx.scene.entity.stats, ctx.player.userId, amount, (reached) => {
    ctx.game.notices.push({ text: `Level ${reached}! A stat point and ${survivor.engrams.grantForLevel(reached)} engram points to spend.`, tone: "success" });
  });
  if (survivorLevel(ctx) !== before) ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: "Level up!", kind: "pickup" });
}

// --- inventory ---------------------------------------------------------------------------

function slotsOf(state: InventoryState) {
  return state.slots.flatMap((slot) => (slot === null ? [] : [{ itemId: slot.itemId, quantity: slot.count }]));
}

function carried(ctx: GameContext) {
  return [...slotsOf(ctx.player.inventory.state(BAG)), ...slotsOf(ctx.player.inventory.state(HOTBAR))];
}

function encumbrance(ctx: GameContext, survivor: Survivor) {
  return resolveEncumbrance(totalLoad(carried(ctx), (id) => itemDef(id)?.weight ?? 0), statValue(survivor, "weight"));
}

/** Put items in the bag; whatever does not fit is lost with a notice. */
export function give(ctx: GameContext, itemId: string, count: number): number {
  if (count <= 0) return 0;
  const put = ctx.player.inventory.put(BAG, itemId, count);
  if (put.status !== "ok") {
    ctx.game.notices.push({ text: `No room for ${itemLabel(itemId)}`, tone: "deny" });
    return 0;
  }
  return count;
}

/** Take `count` of an item from the bag, then the hotbar; false (and nothing taken) when there are not that many. */
export function takeAnywhere(ctx: GameContext, itemId: string, count: number): boolean {
  const inBag = ctx.player.inventory.count(BAG, itemId);
  const fromBag = Math.min(inBag, count);
  if (fromBag + ctx.player.inventory.count(HOTBAR, itemId) < count) return false;
  if (fromBag > 0) ctx.player.inventory.take(BAG, itemId, fromBag);
  if (count - fromBag > 0) ctx.player.inventory.take(HOTBAR, itemId, count - fromBag);
  return true;
}

/** The item in the active hotbar slot: a tool, or a structure to place. */
export function heldItem(ctx: GameContext): string | null {
  const survivor = survivorOf(ctx);
  if (survivor.activeSlot === null) return null;
  return ctx.player.inventory.state(HOTBAR).slots[survivor.activeSlot]?.itemId ?? null;
}

function heldTool(ctx: GameContext, survivor: Survivor): { id: string | null; tool: ToolDef } {
  if (survivor.activeSlot === null) return { id: null, tool: FIST };
  const slot = ctx.player.inventory.state(HOTBAR).slots[survivor.activeSlot] ?? null;
  const tool = slot === null ? undefined : itemDef(slot.itemId)?.tool;
  return tool === undefined || slot === null ? { id: null, tool: FIST } : { id: slot.itemId, tool };
}

// --- gathering ---------------------------------------------------------------------------

function ensurePlacements(ctx: GameContext, survivor: Survivor): void {
  if (survivor.placed) return;
  survivor.harvest.setPlacements(resolveScatter(editorLayers, ctx.world.ground));
  survivor.placed = true;
}

function grantGather(ctx: GameContext, survivor: Survivor, granted: readonly { kind: string; amount: number }[]): string[] {
  const got: string[] = [];
  for (const grant of granted) {
    const whole = Math.floor(grant.amount + ctx.rng());
    if (give(ctx, grant.kind, whole) > 0) got.push(`${whole} ${itemLabel(grant.kind)}`);
  }
  if (got.length > 0) {
    survivor.lastGain = { text: got.join(", "), at: ctx.time.now() };
    grantXp(ctx, SURVIVOR.gatherXp);
  }
  return got;
}

function aimAt(ctx: GameContext, survivor: Survivor, position: readonly [number, number, number], yaw: number): Survivor["aim"] {
  const label = (hit: { item: string } | null) => (hit === null ? null : (HARVESTABLES[hit.item]?.label ?? null));
  const strike = survivor.harvest.target({ x: position[0], z: position[2], yaw, reach: heldTool(ctx, survivor).tool.reach, accepts: gatheredBy("strike") });
  const pick = survivor.harvest.target({ x: position[0], z: position[2], yaw, reach: PICK_UP.reach, cone: Math.PI, accepts: gatheredBy("pick") });
  return { strike: label(strike), pick: label(pick), pickAt: pick === null ? null : { x: pick.x, z: pick.z }, water: inWater(ctx, position) };
}

/** Left click: swing whatever is in hand at what is in front. */
export function swing(ctx: GameContext, yaw?: number): void {
  const survivor = survivorOf(ctx);
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null || survivor.dead || survivor.vitals.has("unconscious") || openScreen(ctx) !== null) return;
  const now = ctx.time.now();
  if (now < survivor.swingReady) return;
  const held = heldItem(ctx);
  if (held !== null && itemDef(held)?.kind === "structure") {
    survivor.swingReady = now + 0.25;
    placeHeld(ctx, held, yaw);
    if (ctx.player.inventory.count(HOTBAR, held) === 0) survivor.activeSlot = null;
    return;
  }
  const { tool } = heldTool(ctx, survivor);
  if (!survivor.vitals.spend("stamina", tool.stamina)) {
    ctx.game.notices.push({ text: "Too tired to swing", tone: "deny" });
    return;
  }
  survivor.swingReady = now + tool.cooldown;
  // Like ARK's third-person swing: the survivor turns to where the camera aims before striking.
  if (yaw !== undefined && yaw !== me.rotationY) ctx.scene.entity.setPose(me.id, { position: me.position, rotationY: yaw });
  const melee = statValue(survivor, "melee") / 100;
  const struck = strikeCreature(ctx, ctx.player.userId, yaw ?? me.rotationY, tool, melee);
  if (struck !== null) {
    const got = grantGather(ctx, survivor, struck.granted);
    if (got.length > 0) ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: `+${got.join(", +")}`, kind: "pickup" });
    if (struck.killed) grantXp(ctx, struck.xp);
    return;
  }
  if (strikeStructure(ctx, yaw ?? me.rotationY, tool.reach + 0.5, tool.damage * melee, tool.damageClass ?? "primitive")) return;
  ensurePlacements(ctx, survivor);
  const hit = survivor.harvest.strike({
    x: me.position[0],
    z: me.position[2],
    yaw: yaw ?? me.rotationY,
    reach: tool.reach,
    tool: tool.gather,
    multiplier: melee,
    accepts: gatheredBy("strike"),
  });
  if (hit === null) return;
  const got = grantGather(ctx, survivor, hit.granted);
  if (got.length > 0) ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: `+${got.join(", +")}`, kind: "pickup" });
}

/**
 * The E prompts, one source for the key and the HUD: harvest what is in reach by hand, or drink when
 * standing in water. The engine routes E to whichever prompt is active.
 */
export function survivorPrompts(ctx: GameContext): PositionedPrompt[] {
  const survivor = survivorOf(ctx);
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null || survivor.dead) return [];
  const prompts: PositionedPrompt[] = [];
  if (survivor.aim.pick !== null && survivor.aim.pickAt !== null) {
    prompts.push({ id: "harvest", position: survivor.aim.pickAt, priority: 1, prompt: proximityPrompt({ radius: PICK_UP.reach + 2, display: keybind("interact", `Harvest ${survivor.aim.pick}`), invoke: command("harvest") }) });
  }
  if (survivor.aim.water) {
    prompts.push({ id: "drink", position: { x: me.position[0], z: me.position[2] }, prompt: proximityPrompt({ radius: 1, display: keybind("interact", "Drink"), invoke: command("harvest") }) });
  }
  return prompts;
}

/** E: pick a bush or stones within reach, or drink when standing in water. */
export function use(ctx: GameContext): void {
  const survivor = survivorOf(ctx);
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null || survivor.dead || survivor.vitals.has("unconscious")) return;
  ensurePlacements(ctx, survivor);
  const hit = survivor.harvest.strike({
    x: me.position[0],
    z: me.position[2],
    yaw: me.rotationY,
    reach: PICK_UP.reach,
    cone: Math.PI,
    tool: PICK_UP.gather,
    accepts: gatheredBy("pick"),
  });
  if (hit !== null) {
    const got = grantGather(ctx, survivor, hit.granted);
    if (got.length > 0) ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: `+${got.join(", +")}`, kind: "pickup" });
    return;
  }
  if (inWater(ctx, me.position)) {
    survivor.vitals.change("water", SURVIVOR.drink);
    ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: "Drank", kind: "pickup" });
  }
}


// --- eating ------------------------------------------------------------------------------

export function consume(ctx: GameContext, inventoryId: string, slot: number): boolean {
  const survivor = survivorOf(ctx);
  const stack = ctx.player.inventory.state(inventoryId).slots[slot] ?? null;
  const effect = stack === null ? undefined : itemDef(stack.itemId)?.consume;
  if (stack === null || effect === undefined) return false;
  if (stack.itemId === "waterskin") {
    survivor.vitals.change("water", effect.water ?? 0);
    return true;
  }
  ctx.player.inventory.take(inventoryId, stack.itemId, 1);
  for (const [vital, amount] of Object.entries(effect)) {
    if (vital === "health") ctx.scene.entity.stats.delta(ctx.player.userId, "health", amount);
    else survivor.vitals.change(vital, amount);
  }
  ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: `Ate ${itemLabel(stack.itemId)}`, kind: "pickup" });
  return true;
}

/** Number key: equip the tool there (again to put it away), or eat what is there. */
export function selectSlot(ctx: GameContext, slot: number): void {
  const survivor = survivorOf(ctx);
  const stack = ctx.player.inventory.state(HOTBAR).slots[slot] ?? null;
  const def = stack === null ? null : itemDef(stack.itemId);
  if (def?.consume !== undefined && def.tool === undefined) {
    consume(ctx, HOTBAR, slot);
    return;
  }
  const holdable = def?.tool !== undefined || def?.kind === "structure";
  survivor.activeSlot = survivor.activeSlot === slot || !holdable ? null : slot;
}

/** Double-click in the inventory: tools and food go to the hotbar, hotbar items come back. */
export function shuttle(ctx: GameContext, from: string, slot: number): void {
  const to = from === BAG ? HOTBAR : BAG;
  const moved = ctx.player.inventory.move(from, slot, to);
  if (moved.status !== "ok") ctx.game.notices.push({ text: to === HOTBAR ? "Hotbar is full" : "Inventory is full", tone: "deny" });
  const survivor = survivorOf(ctx);
  if (from === HOTBAR && survivor.activeSlot === slot) survivor.activeSlot = null;
}

// --- engrams and crafting ----------------------------------------------------------------

export function learn(ctx: GameContext, engramId: string): void {
  const survivor = survivorOf(ctx);
  const engram = engramDef(engramId);
  if (engram === null) return;
  if (engram.level > survivorLevel(ctx)) {
    ctx.game.notices.push({ text: `Needs level ${engram.level}`, tone: "deny" });
    return;
  }
  const spent = survivor.engrams.spend(engram.id, engram.points);
  if (!spent.ok) ctx.game.notices.push({ text: spent.reason === "insufficient-points" ? "Not enough engram points" : "Already learned", tone: "deny" });
  else ctx.game.notices.push({ text: `Learned ${itemLabel(engram.recipe.outputs[0]!.itemId)}`, tone: "success" });
}

function queueConfig(survivor: Survivor): WorkQueueConfig<CraftSpec, undefined, CraftSpec> {
  return {
    duration: (spec) => craftSeconds(recipeDef(spec.recipeId)!) / (statValue(survivor, "crafting") / 100),
    capacity: 50,
    output: (job) => job.spec,
  };
}

/** What a recipe checks against: learned engrams, and the stations placed near the survivor. */
function craftContext(ctx: GameContext, survivor: Survivor) {
  const me = ctx.scene.entity.get(ctx.player.userId);
  const origin: readonly [number, number] = me === null ? [0, 0] : [me.position[0], me.position[2]];
  return { unlocked: (id: string) => survivor.engrams.isUnlocked(id), stations: stations(ctx), origin };
}

/** Why a recipe cannot start now, or null when it can. */
export function craftBlock(ctx: GameContext, recipe: RecipeDef): string | null {
  const survivor = survivorOf(ctx);
  const check = canCraft(ctx.player.inventory.state(BAG), { slots: BAG_SLOTS }, itemTraits, recipe, craftContext(ctx, survivor));
  if (check.ok) return null;
  if (check.reason === "locked") return "Not learned";
  if (check.reason === "no-station") return `Needs a ${itemLabel(check.station)}`;
  if (check.reason === "missing-inputs") return `Missing ${check.missing.map((entry) => `${entry.count} ${itemLabel(entry.itemId)}`).join(", ")}`;
  return "No room";
}

export function startCraft(ctx: GameContext, recipeId: string, count = 1): void {
  const survivor = survivorOf(ctx);
  const recipe = recipeDef(recipeId);
  if (recipe === null) return;
  for (let made = 0; made < count; made += 1) {
    const blocked = craftBlock(ctx, recipe);
    if (blocked !== null) {
      if (made === 0) ctx.game.notices.push({ text: blocked, tone: "deny" });
      return;
    }
    const queued = enqueue(survivor.queue, queueConfig(survivor), { recipeId });
    if (!queued.ok) return;
    for (const input of recipe.inputs) ctx.player.inventory.take(BAG, input.itemId, input.count);
    survivor.queue = queued.state;
  }
}

export function cancelCraft(ctx: GameContext, jobId: string): void {
  const survivor = survivorOf(ctx);
  const cancelled = cancelJob(survivor.queue, queueConfig(survivor), jobId);
  if (!cancelled.ok) return;
  survivor.queue = cancelled.state;
  for (const input of recipeDef(cancelled.job.spec.recipeId)?.inputs ?? []) give(ctx, input.itemId, input.count);
}

function finishCraft(ctx: GameContext, spec: CraftSpec): void {
  const recipe = recipeDef(spec.recipeId);
  if (recipe === null) return;
  for (const output of recipe.outputs) {
    const def = itemDef(output.itemId);
    // ARK slots a freshly made tool onto the hotbar when there is room.
    const toHotbar = def?.tool !== undefined && ctx.player.inventory.put(HOTBAR, output.itemId, output.count).status === "ok";
    if (!toHotbar) give(ctx, output.itemId, output.count);
    ctx.game.notices.push({ text: `Crafted ${itemLabel(output.itemId)}`, tone: "success" });
  }
  grantXp(ctx, Math.max(1, craftSeconds(recipe) * 0.4));
}

// --- levelling -----------------------------------------------------------------------------

export function levelStat(ctx: GameContext, stat: StatId): void {
  const survivor = survivorOf(ctx);
  if (!POINTS.spend(survivor.points, stat, survivorLevel(ctx) - 1)) return;
  applyMaxes(ctx, survivor, false);
  const def = LEVEL_STATS.find((entry) => entry.id === stat)!;
  if (["health", "stamina", "oxygen", "food", "water"].includes(stat)) survivor.vitals.change(stat, def.per);
}

// --- the tick ------------------------------------------------------------------------------

export function tickSurvivor(ctx: GameContext, dt: number): void {
  const survivor = survivorOf(ctx);
  const id = ctx.player.userId;
  const me = ctx.scene.entity.get(id);
  if (me === null) return;
  const health = ctx.scene.entity.stats.get(id, "health");
  if (health !== null) survivor.vitals.change("health", health.current - survivor.vitals.value("health"));
  // A blow that empties health kills before this step's healing can paper over it.
  if (survivor.vitals.value("health") <= 0 && !survivor.dead) {
    die(ctx, survivor);
    return;
  }

  const load = encumbrance(ctx, survivor);
  const moving = Math.hypot(me.velocity[0], me.velocity[2]) > 0.5;
  const running = moving && ctx.input.isDown("sprint") && mountCanSprint(ctx) === null && canRun(ctx);
  survivor.climate = climateAt(ctx, me.position);
  survivor.comfort = bodyComfort(survivor.climate.temperature, COMFORT, { fortitude: survivor.points.fortitude * 2 });
  const extra = [
    ...(running ? [{ vital: "stamina", rate: -SURVIVOR.runStamina }, { vital: "water", rate: -0.03 }] : []),
    ...(survivor.comfort.damagePerSecond > 0 ? [{ vital: "health", rate: -survivor.comfort.damagePerSecond }] : []),
  ];
  // An empty stomach or dry throat stops healing, as in ARK, so the 1 HP per 5 s actually lands.
  const wasting = survivor.vitals.has("starving") || survivor.vitals.has("dehydrated");
  const regen = { health: wasting ? 0 : 1, stamina: moving ? 0.5 : 1 };
  const changes = survivor.vitals.tick(dt, { drain: survivor.comfort.drain, regen, extra });
  for (const change of changes) {
    if (change.id === "unconscious" && change.raised) ctx.game.notices.push({ text: "You passed out", tone: "deny" });
    if (change.id === "starving" && change.raised) ctx.game.notices.push({ text: "You are starving", tone: "deny" });
    if (change.id === "dehydrated" && change.raised) ctx.game.notices.push({ text: "You are dehydrated", tone: "deny" });
  }
  ctx.scene.entity.stats.set(id, "health", { current: survivor.vitals.value("health") });

  const injured = survivor.vitals.value("health") <= SURVIVOR.injuredAt;
  const knocked = survivor.vitals.has("unconscious");
  if (survivor.web !== null && survivor.web.until <= ctx.time.now()) survivor.web = null;
  const speed = SURVIVOR.walkSpeed * (statValue(survivor, "speed") / 100) * load.moveMultiplier * (injured ? SURVIVOR.injuredSpeed : 1) * (knocked ? 0 : 1) * (survivor.web?.slow ?? 1);
  if (Math.abs((me.movement?.walkSpeed ?? 0) - speed) > 0.01) ctx.scene.entity.update(id, { movement: { ...me.movement, walkSpeed: speed } });

  const crafted = tickQueue(survivor.queue, queueConfig(survivor), dt);
  survivor.queue = crafted.state;
  for (const event of crafted.events) if (event.type === "completed") finishCraft(ctx, event.output);

  ensurePlacements(ctx, survivor);
  survivor.harvest.tick(dt);
  survivor.aim = aimAt(ctx, survivor, me.position, me.rotationY);

  if (survivor.vitals.value("health") <= 0 && !survivor.dead) die(ctx, survivor);
  ctx.touch();
}

/**
 * Death, as in ARK: everything carried stays with the body where the survivor fell, and they wake on the beach with
 * empty hands and full vitals, keeping their level and engrams. The body lasts an hour.
 */
function die(ctx: GameContext, survivor: Survivor): void {
  survivor.dead = true;
  const me = ctx.scene.entity.get(ctx.player.userId);
  const left = me === null ? 0 : leaveBody(ctx, me.position);
  ctx.game.notices.push({ text: left > 0 ? "You died. Your things lie with your body where you fell." : "You died. You wake on the beach.", tone: "deny" });
  respawn(ctx, survivor);
}

function respawn(ctx: GameContext, survivor: Survivor): void {
  survivor.vitals.reset();
  survivor.web = null;
  applyMaxes(ctx, survivor, true);
  ctx.scene.entity.resetToSpawn(ctx.player.userId);
  survivor.dead = false;
}

/** Webbed: the survivor moves at `slow` of their speed for `seconds`. */
export function webSurvivor(ctx: GameContext, slow: number, seconds: number): void {
  survivorOf(ctx).web = { slow, until: ctx.time.now() + seconds };
}

/** Torpor from venom or acid: enough of it and the survivor passes out. */
export function drugSurvivor(ctx: GameContext, torpor: number): void {
  survivorOf(ctx).vitals.change("torpor", torpor);
}

/** Shift sprints while there is stamina for it: the mount's when riding, else the survivor's. */
export function canRun(ctx: GameContext): boolean {
  const mount = mountCanSprint(ctx);
  if (mount !== null) return mount;
  const survivor = survivorOf(ctx);
  return survivor.vitals.value("stamina") > 1 && encumbrance(ctx, survivor).canSprint && !survivor.vitals.has("unconscious");
}

/** First spawn: the survivor's pools from their level. */
export function setUpSurvivor(ctx: GameContext): void {
  const survivor = survivorOf(ctx);
  ctx.scene.entity.stats.set(ctx.player.userId, "level", { current: 1, max: MAX_LEVEL });
  ctx.scene.entity.stats.set(ctx.player.userId, "xp", { current: 0, max: track.xpForLevel(2) });
  applyMaxes(ctx, survivor, true);
}

// --- save ----------------------------------------------------------------------------------

interface SurvivorSave {
  vitals: VitalsState;
  points: Record<StatId, number>;
  engrams: UnlockPointsState;
  queue: WorkQueueState<CraftSpec>;
  harvest: ScatterHarvestState;
}

export function survivorSave(ctx: GameContext) {
  return {
    key: "fernwild.survivor",
    snapshot: (): SurvivorSave => {
      const survivor = survivorOf(ctx);
      return { vitals: survivor.vitals.state(), points: { ...survivor.points }, engrams: survivor.engrams.snapshot(), queue: survivor.queue, harvest: survivor.harvest.snapshot() };
    },
    hydrate: (data: SurvivorSave) => {
      const survivor = survivorOf(ctx);
      survivor.points = POINTS.normalize(data.points);
      survivor.vitals.restore(data.vitals);
      survivor.engrams.hydrate(data.engrams);
      survivor.queue = data.queue;
      ensurePlacements(ctx, survivor);
      survivor.harvest.restore(data.harvest);
      applyMaxes(ctx, survivor, false);
    },
  };
}

export function resetSurvivor(ctx: GameContext): void {
  const survivor = survivorOf(ctx);
  survivor.points = POINTS.empty();
  survivor.vitals.reset();
  survivor.engrams = freshEngrams();
  survivor.queue = createWorkQueue<CraftSpec>();
  survivor.harvest.reset();
  survivor.activeSlot = null;
}

// --- what the HUD reads ----------------------------------------------------------------------

export function survivorView(ctx: GameContext) {
  const survivor = survivorOf(ctx);
  const xp = ctx.scene.entity.stats.get(ctx.player.userId, "xp");
  const lvl = survivorLevel(ctx);
  const load = encumbrance(ctx, survivor);
  const pool = ctx.scene.entity.stats.get(ctx.player.userId, "health");
  const vital = (id: string) => ({ value: Math.round(survivor.vitals.value(id) * 10) / 10, max: survivor.vitals.max(id) });
  const now = ctx.time.now();
  return {
    level: lvl,
    xp: Math.floor(xp?.current ?? 0),
    xpNext: track.xpForLevel(Math.min(MAX_LEVEL, lvl + 1)),
    xpFrom: track.xpForLevel(lvl),
    statPoints: unspentPoints(ctx, survivor),
    engramPoints: survivor.engrams.available(),
    // Damage lands on the entity's health pool first and reaches the vitals on the next tick: read the pool.
    health: pool === null ? vital("health") : { value: Math.round(pool.current * 10) / 10, max: pool.max },
    stamina: vital("stamina"),
    oxygen: vital("oxygen"),
    food: vital("food"),
    water: vital("water"),
    torpor: vital("torpor"),
    weight: { value: Math.round(load.mass * 10) / 10, max: statValue(survivor, "weight") },
    encumbered: load.tier !== "unencumbered",
    stats: LEVEL_STATS.map((stat) => ({ ...stat, points: survivor.points[stat.id], value: statValue(survivor, stat.id) })),
    flags: survivor.vitals.flags(),
    temperature: Math.round(survivor.comfort.ambientC),
    comfort: survivor.comfort.band,
    weather: survivor.climate?.weather ?? "clear",
    sheltered: survivor.climate?.covered ?? false,
    webbed: survivor.web !== null && survivor.web.until > now,
    activeSlot: survivor.activeSlot,
    aim: survivor.aim,
    gain: survivor.lastGain !== null && now - survivor.lastGain.at < 2.5 ? survivor.lastGain.text : null,
    queue: survivor.queue.jobs.map((job) => ({ id: job.id, recipeId: job.spec.recipeId, output: recipeDef(job.spec.recipeId)?.outputs[0]?.itemId ?? job.spec.recipeId, progress: jobProgress(job) })),
    engrams: ENGRAMS.map((entry) => ({ id: entry.id, level: entry.level, points: entry.points, learned: survivor.engrams.isUnlocked(entry.id) })),
  };
}

export type SurvivorView = ReturnType<typeof survivorView>;

/** Recipes the crafting tab lists: learned engrams plus cooking. */
export function craftable(ctx: GameContext) {
  return CRAFTING_RECIPES.filter((recipe) => recipe.requires === undefined || survivorOf(ctx).engrams.isUnlocked(recipe.id)).map((recipe) => ({
    id: recipe.id,
    output: recipe.outputs[0]!.itemId,
    inputs: recipe.inputs.map((input) => ({ ...input, have: ctx.player.inventory.count(BAG, input.itemId) })),
    blocked: craftBlock(ctx, recipe),
  }));
}
