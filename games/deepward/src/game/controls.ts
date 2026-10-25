import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { DamageRuntime } from "@jgengine/core/combat/damageRuntime";
import type { WeaponAmmo, WeaponSystem } from "@jgengine/core/combat/weaponSystem";
import { createPerception, type PerceptionService } from "@jgengine/core/sensor/perception";
import { BAYS, distance, depthAt, EXIT, EXIT_REACH, FABRICATOR, FABRICATOR_REACH, FRAGMENTS, GARAGE, GARAGE_REACH, HOME_SPAWN, inside, LIFTS, lineOfSight, NODES, PRINT_ID, PRINT_SPAWN, PRINTER_ZERO, PRINTER_ZERO_REACH, RECEIVING_BACK_Z, SALVAGE, STASH, STASH_REACH, STEAM, STRATUM_SPAWNS, SUPPLIES, VAULT_SPAWN, walkable, type Point } from "../world";
import { acknowledgeReprint, ageDive, depart, fits, ITEMS, ledgerOf, newDive, newHome, normalizeDive, pack, peekLoot, recoverInterrupted, settle, takeLoot, type Dive, type Home, type ItemKind, type Result } from "./state";
import { installRefit, REFITS, type RefitId } from "./progression";
import { buySupply, dismantle } from "./counter";
import { canCache, loadOf } from "./haul";
import { itemValue, kindOf, rollItem } from "./items";
import { createDeepwardDamage, createDeepwardWeapon, MAGAZINE, weaponDefinition, weaponReadout } from "./combat";
import { openRecord, recordProfile, type RecordSession, type RunSnapshot } from "./save";
import { advanceRoute, createNavigator } from "./navigation";
import { decayMeters, refillMeter } from "@jgengine/core/survival/decayMeter";
import { BODY, GALLEY_FEEDS_BELOW, HOME_DRAIN, hungriest, MEAL, STARVE_DAMAGE } from "./survival";
import { airBonus, deepestCharted, has, liftLock, newDeep, sealMark, type Deep } from "./deep";
import { CODEX_ENTRIES, createDeepCodex, GEAR, spendRecipe, type Gear } from "./fabricator";
import { MODULES, marrowOf, marrowState, restoreMarrow, setMarrowLive, type Module } from "./marrow";
import { crushDamage, isStratum, STRATA, type Stratum } from "./strata";
import { broadcast, createSenses, creatureInSight, hazardsAt, lureLanding, tickCreatures, type Senses } from "./descent";
import { createSpeciesSenses, SPECIES } from "./fauna";
import { shotTargets } from "./combat";

export const keybinds: ActionCodesMap = {
  moveForward: ["KeyW", "ArrowUp"], moveBack: ["KeyS", "ArrowDown"],
  moveLeft: ["KeyA", "ArrowLeft"], moveRight: ["KeyD", "ArrowRight"],
  sprint: ["ShiftLeft"],
  deepwardInteract: ["KeyE"], deepwardFire: ["mouse0"], deepwardReload: ["KeyR"], deepwardCache: ["Tab"],
  deepwardLamp: ["KeyF"], deepwardEat: ["KeyQ"], deepwardLure: ["KeyG"], deepwardScan: ["KeyC"],
};
/** What a HUD ammo line reads from the held weapon: the shared runtime's own ammo record. */
export interface AmmoReadout {
  loaded: number; capacity: number; reserve: number;
  reloading: boolean; reloadProgress: number;
}
export interface View {
  home: Home; dive: Dive | null; mode: "home" | "dive" | "saving" | "blocked" | "reprinting" | "loading";
  panel: "stash" | "cache" | "fabricator" | null; paused: boolean; hint: string; error: string;
  /** Everything the record keeps about going deeper: body, gear, scans, charted strata, the base. */
  deep: Deep;
  /** Where the next departure lands; only the rail crawler takes you past receiving. */
  departTo: Stratum;
  rifleUid: string | null;
  ammo: AmmoReadout | null;
  pending: { kind: Result["kind"]; reason: string } | null;
  trace: { from: Point; to: Point; remaining: number } | null;
}
export const viewStore = defineStore<View>("deepward.session", () => ({ home: newHome(), dive: null, mode: "loading", panel: null, paused: false, hint: "Walk to the Garage. E to take the rail to Bellwether.", error: "", pending: null, trace: null, rifleUid: null, ammo: null, deep: newDeep(), departTo: "vault" }));
const runtime = perContext(() => ({
  save: null as RecordSession | null, ready: false, boot: Promise.resolve(),
  writes: Promise.resolve() as Promise<void>, checkpoint: 0, writing: false,
  aim: [0, 0, -1] as Point, worldItems: new Map<string, string>(), navigation: createNavigator(), airBeat: -1,
  damage: null as DamageRuntime | null, weapon: null as WeaponSystem | null, armed: null as string | null,
  senses: null as PerceptionService | null, facing: 0,
  creatures: null as Senses | null,
  /** The dive whose belt has already been carried into the galley, so a retried save banks it once. */
  galleyBanked: null as number | null,
}));
/** Station bed is muted while the game is frozen; it is a retained loop, so only its gain changes. */
const BED_GAIN = 0.45;
const message = (e: unknown): string => e instanceof Error ? e.message : String(e);
export function setAim(ctx: GameContext, direction: Point): void {
  runtime(ctx).aim = direction;
  // The shared weapon aims in yaw/pitch; this is the same camera vector the local shot path read.
  const pitch = Math.asin(Math.max(-1, Math.min(1, direction[1])));
  runtime(ctx).weapon?.setAim(Math.atan2(direction[0], direction[2]), pitch);
}
function playerAt(ctx: GameContext): Point | null { return ctx.scene.entity.get(ctx.player.userId)?.position ?? null; }
function damageOf(ctx: GameContext): DamageRuntime {
  const state = runtime(ctx);
  state.damage ??= createDeepwardDamage(ctx.rng);
  return state.damage;
}
/** How far the Fitter sees, how wide its cone is, and how far a search carries. */
export const FITTER_SIGHT = 12;
export const FITTER_CONE_DEG = 200;
export const FITTER_HEARING = 15;
/** The Fitter's senses: the shared perception service, wired to the station's own sight test. */
export function createFitterSenses(): PerceptionService {
  return createPerception({
    sightRange: FITTER_SIGHT,
    sightConeDeg: FITTER_CONE_DEG,
    hearingRange: FITTER_HEARING,
    // A sighting has to be fresh to matter: the Fitter reacts to what it saw this half second.
    memorySeconds: 0.5,
    // The station's authored wall and machinery test, the same line the shot and the search read.
    isSegmentClear: (from, to) => lineOfSight([from[0], from[1], from[2]], [to[0], to[1], to[2]]),
    devtoolsName: "deepward.perception",
  });
}
function sensesOf(ctx: GameContext): PerceptionService {
  const state = runtime(ctx);
  state.senses ??= createFitterSenses();
  return state.senses;
}
/** The held weapon, retuned to the hand in force so ammo, cadence and reload carry across a swap. */
function arm(ctx: GameContext, dive: Dive): WeaponSystem {
  const state = runtime(ctx), definition = weaponDefinition(dive);
  if (state.weapon === null) {
    state.weapon = createDeepwardWeapon(definition, {
      rng: ctx.rng, damage: damageOf(ctx),
      at: () => playerAt(ctx),
      print: () => viewStore.read(ctx).dive?.print ?? null,
      creatures: () => { const dive = viewStore.read(ctx).dive; return dive === null ? [] : shotTargets(dive.fauna, dive.stratum); },
      place: () => viewStore.read(ctx).dive?.stratum ?? "vault",
    });
  } else if (state.armed !== definition.id) state.weapon.retune(definition);
  state.armed = definition.id;
  return state.weapon;
}
/** Ammo as a HUD line reads it, from the shared magazine rather than a copy on the dive. */
export function ammoOf(weapon: WeaponSystem): AmmoReadout {
  const ammo: WeaponAmmo = weapon.ammo();
  return {
    loaded: ammo.loaded ?? MAGAZINE, capacity: ammo.capacity ?? MAGAZINE, reserve: ammo.reserve ?? 0,
    reloading: ammo.reload === "reloading", reloadProgress: ammo.reloadFraction,
  };
}
/** A hand swap costs one cycle: the new hand's rate gate restarts, the same wait the L1 had. */
function restartCadence(weapon: WeaponSystem): void {
  const state = weapon.snapshot();
  weapon.restore({ ...state, cadenceElapsedMs: 0, pendingPull: false });
}
/** Forget the dive's weapon: a new Life starts with a fresh magazine in the issued hand. */
function disarm(ctx: GameContext): void {
  const state = runtime(ctx);
  state.weapon?.dispose();
  state.weapon = null; state.armed = null;
}
/** The scanner's codex as the record holds it; rebuilt from the snapshot at each scan. */
function knows(deep: Deep, id: string): boolean { return Object.hasOwn(deep.codex.discovered, id); }
/** Tell Marrow's world what it cannot read for itself: a learned growbed, and whether you are home. */
function liveMarrow(ctx: GameContext): void {
  const v = viewStore.read(ctx);
  setMarrowLive(ctx, { growbedKnown: knows(v.deep, "growbed"), home: v.mode !== "dive" });
}
function feed(deep: Deep, id: "food" | "water", amount: number): Deep {
  return { ...deep, body: { ...deep.body, values: refillMeter(deep.body.values, BODY, id, amount) } };
}
function drain(deep: Deep, dt: number, modifier: Record<string, number>): Deep {
  return { ...deep, body: { ...deep.body, values: decayMeters(deep.body.values, BODY, dt, modifier) } };
}
/** Marrow's galley tops the body up from its tins and flasks whenever you stand at home. */
function galley(ctx: GameContext, deep: Deep): { deep: Deep; fed: string | null } {
  const world = marrowOf(ctx);
  let next = deep, fed: string | null = null;
  if (next.body.values.food! < GALLEY_FEEDS_BELOW && world.spend({ "marrow.food": -1 })) { next = feed(next, "food", MEAL.food); fed = "Halloway: ate from the galley."; }
  if (next.body.values.water! < GALLEY_FEEDS_BELOW && world.spend({ "marrow.water": -1 })) { next = feed(next, "water", MEAL.water); fed = "Halloway: drank from the galley."; }
  return { deep: next, fed };
}
/** The creatures' senses for this dive, one perception service per species. */
function creaturesOf(ctx: GameContext): Senses {
  const state = runtime(ctx);
  state.creatures ??= createSenses(species => createSpeciesSenses(species, () => viewStore.read(ctx).dive?.stratum ?? "vault"));
  return state.creatures;
}
/** Where the diver steps off a lift: beside the lift in `to` that leads back to `from`. */
export function arrivalAt(from: Stratum, to: Stratum): Point {
  const spawn = to === "vault" ? STRATUM_SPAWNS.vault ?? VAULT_SPAWN : STRATUM_SPAWNS[to] ?? VAULT_SPAWN;
  const back = LIFTS.find(lift => lift.place === to && lift.to === from);
  if (back === undefined) return spawn;
  const dx = spawn[0] - back.at[0], dz = spawn[2] - back.at[2], length = Math.hypot(dx, dz) || 1;
  const step = back.reach + 0.6;
  const at: Point = [back.at[0] + dx / length * step, spawn[1], back.at[2] + dz / length * step];
  return walkable(at[0], at[2], to) ? at : spawn;
}
function rollItemFor(kind: ItemKind, id: string) { return rollItem(kind, 1, `deepward:seed:${id}`, id); }
/** The stash instances a recipe takes, spent, and the record that results. */
function payFromStash(home: Home, recipe: Parameters<typeof spendRecipe>[1]): Home {
  return { ...home, stash: spendRecipe(home.stash, recipe), revision: home.revision + 1 };
}
function playable(ctx: GameContext): boolean {  const view = viewStore.read(ctx);
  return !view.paused && view.panel === null && (view.mode === "home" || view.mode === "dive");
}
/** Serialise record writes: a settle and a checkpoint never interleave on one document. */
function persist(ctx: GameContext, next: Home, run?: RunSnapshot | null, after?: () => void): Promise<void> {
  const state = runtime(ctx), save = state.save;
  if (save === null) { state.writing = false; return Promise.reject(new Error("Persistent storage unavailable")); }
  const write = state.writes.then(async () => {
    try {
      await save.commit(next, run);
      after?.();
    } finally {
      // The write is no longer in flight once the commit (or its refusal) is known, so a retry
      // from the same frame is allowed without waiting for another microtask.
      state.writing = false;
    }
  });
  state.writes = write.catch(() => undefined);
  return write;
}
/** A record write that does not change the persistent section - a checkpoint inside a dive. */
function checkpoint(ctx: GameContext): Promise<void> {
  return persist(ctx, viewStore.read(ctx).home);
}
/** Awaited by a caller that must not continue until the record is on disk. */
export function whenWritten(ctx: GameContext): Promise<void> {
  return runtime(ctx).writes;
}
/** The boot read (a shared game-save document is read asynchronously); tests await this. */
export function whenReady(ctx: GameContext): Promise<void> {
  return runtime(ctx).boot;
}
/** The live run as the save's `run` section: what the HUD shows and where the diver stands. */
function snapshotRun(ctx: GameContext): RunSnapshot {
  const v = viewStore.read(ctx), state = runtime(ctx);
  return {
    mode: v.mode === "loading" || v.mode === "blocked" ? "home" : v.mode,
    dive: v.dive, rifleUid: v.rifleUid, hint: v.hint, pending: v.pending,
    player: playerAt(ctx) ?? null,
    weapon: state.weapon?.snapshot() ?? null,
    hand: state.armed,
  };
}
/** The live run with a few fields replaced, for a document that describes the screen after the write. */
function runOf(ctx: GameContext, patch: Partial<RunSnapshot>): RunSnapshot {
  return { ...snapshotRun(ctx), ...patch };
}
/** Whether a run section is a dive this build can resume; a corrupt one starts at home instead. */
function validRun(next: unknown): next is RunSnapshot {
  if (typeof next !== "object" || next === null) return false;
  const run = next as RunSnapshot;
  if (run.mode !== "home" && run.mode !== "dive" && run.mode !== "saving" && run.mode !== "reprinting") return false;
  if (run.dive === null) return true;
  const dive = run.dive;
  return Number.isFinite(dive.id) && Number.isFinite(dive.elapsed) && Number.isFinite(dive.oxygen) && Number.isFinite(dive.health)
    && Array.isArray(dive.cache) && Array.isArray(dive.collected) && typeof dive.print === "object" && dive.print !== null
    && Array.isArray(dive.print.at) && Number.isFinite(dive.print.health);
}
function ungrab(): void { if (typeof document !== "undefined") document.exitPointerLock?.(); }
function freeze(ctx: GameContext): void { ctx.time.pause(); setGamePhase(ctx, "paused"); ctx.game.audio.setLoop("bed", { gain: 0 }); ungrab(); }
function run(ctx: GameContext): void { setGamePhase(ctx, "playing"); ctx.game.audio.setLoop("bed", { gain: BED_GAIN }); ctx.time.play(); }
function teleport(ctx: GameContext, at: Point): void {
  ctx.scene.entity.setPose(ctx.player.userId, { position: at, rotationY: Math.PI, dt: 0 });
}
function spawnLoot(ctx: GameContext, source: string, kind: ItemKind, at: Point, diveId: number): void {
  const records = runtime(ctx).worldItems;
  if (records.has(source)) return;
  const item = ctx.scene.worldItem.spawn({ itemId: kind, position: at, rarity: ITEMS[kind].rarity.toLowerCase(), baseType: kind, source: `${diveId}:${source}` });
  records.set(source, item.instanceId);
}
function clearLoot(ctx: GameContext): void {
  const records = runtime(ctx).worldItems;
  for (const instanceId of records.values()) ctx.scene.worldItem.consume(instanceId);
  records.clear();
  runtime(ctx).navigation = createNavigator();
  runtime(ctx).senses?.forget(PRINT_ID);
  disarm(ctx);
}
function syncPrint(ctx: GameContext, dive: Dive | null): void {
  const present = ctx.scene.entity.get(PRINT_ID);
  // The Fitter walks receiving only; on any other floor it is not in the scene at all.
  if (dive === null || dive.print.health <= 0 || dive.stratum !== "vault") {
    if (present !== null) ctx.scene.entity.despawn(PRINT_ID);
    return;
  }
  const p = dive.print;
  if (present === null) ctx.scene.entity.spawn("fitter", { id: PRINT_ID, position: p.at, role: "npc" });
  else ctx.scene.entity.setPose(PRINT_ID, { position: p.at, rotationY: Math.atan2((playerAt(ctx)?.[0] ?? 0) - p.at[0], (playerAt(ctx)?.[2] ?? 0) - p.at[2]), dt: 0 });
  ctx.scene.entity.stats.set(PRINT_ID, "health", { current: p.health });
}
function syncPlayer(ctx: GameContext, dive: Dive | null): void {
  ctx.scene.entity.stats.set(ctx.player.userId, "health", { current: dive?.health ?? 100 });
  ctx.scene.entity.stats.set(ctx.player.userId, "oxygen", { current: dive?.oxygen ?? 110, max: dive?.tankSeconds ?? 110 });
  const weapon = runtime(ctx).weapon;
  ctx.scene.entity.stats.set(ctx.player.userId, "ammo", { current: dive === null || weapon === null ? MAGAZINE : ammoOf(weapon).loaded });
}
/** The authored depth behind a carried source: a salvage locker keeps its room, a stopped Fitter its own floor. */
function sourceDepth(ctx: GameContext, dive: Dive, source: string, kind: ItemKind): number {
  if (source === "fitter") return depthAt(dive.print.drop ?? dive.print.at, "vault");
  const locker = SALVAGE.find(entry => entry.id === source);
  return locker === undefined ? 1 : depthAt(locker.at, "vault");
}
/** What E does at a spot: the verb behind the prompt the HUD draws. */
export type Act =
  | { type: "garage" } | { type: "stash" } | { type: "fabricator" } | { type: "exit" } | { type: "loot" }
  | { type: "lift"; to: Stratum; locked: string | null; crawler: boolean }
  | { type: "node"; node: (typeof NODES)[number]; missing: "cutter" | "drill" | null }
  | { type: "supply"; supply: (typeof SUPPLIES)[number] }
  | { type: "scan"; fragment: (typeof FRAGMENTS)[number] }
  | { type: "zero" };
export interface Target { label: string; id: string; kind?: ItemKind; at: Point; act: Act }
const TOOL_NAME = { cutter: "plasma cutter", drill: "seam drill" } as const;
export const CHANNEL_SECONDS: Record<NonNullable<NonNullable<Dive["channel"]>["kind"]>, number> = { search: 1.4, harvest: 2, scan: 1.6, supply: 0.8, creature: 1, zero: 4 };
export function nearby(ctx: GameContext): Target | null {
  const v = viewStore.read(ctx), at = playerAt(ctx);
  if (at === null) return null;
  if (v.mode === "home") {
    const to = has(v.deep, "crawler") && v.departTo !== "vault" ? ` / crawler to ${STRATA[v.departTo].name}` : "";
    const spots: (Target & { reach: number })[] = [
      { label: `E · Ride to Bellwether${to} / full tank`, id: "garage", at: GARAGE, act: { type: "garage" }, reach: GARAGE_REACH },
      { label: "E · Inspect Marrow's persistent stash", id: "stash", at: STASH, act: { type: "stash" }, reach: STASH_REACH },
      { label: "E · Fabricator / print gear, build bays", id: "fabricator", at: FABRICATOR, act: { type: "fabricator" }, reach: FABRICATOR_REACH },
    ];
    const near = spots.filter(spot => distance(at, spot.at) <= spot.reach).sort((a, b) => distance(at, a.at) - distance(at, b.at))[0];
    return near === undefined ? null : { label: near.label, id: near.id, at: near.at, act: near.act };
  }
  const dive = v.dive;
  if (v.mode !== "dive" || dive === null) return null;
  const stratum = dive.stratum, world = marrowOf(ctx);
  if (stratum === "vault" && distance(at, EXIT) <= EXIT_REACH) return { label: "E · Return by rail / bank carried haul", id: "exit", at: EXIT, act: { type: "exit" } };
  for (const lift of LIFTS) {
    if (lift.place !== stratum || distance(at, lift.at) > lift.reach) continue;
    const up = STRATA[lift.to].pressure < STRATA[stratum].pressure;
    if (up && has(v.deep, "crawler")) return { label: "E · Crawler home to Marrow / bank carried haul", id: lift.id, at: lift.at, act: { type: "lift", to: lift.to, locked: null, crawler: true } };
    const locked = up ? null : liftLock(lift.to, world);
    const weak = crushDamage(lift.to, sealMark(v.deep)) > 0 ? " / seal too weak" : "";
    const label = locked !== null ? `${STRATA[lift.to].name} / cage code needed` : `E · ${up ? "Up" : "Down"} to ${STRATA[lift.to].name} / P${STRATA[lift.to].pressure}${weak}`;
    return { label, id: lift.id, at: lift.at, act: { type: "lift", to: lift.to, locked, crawler: false } };
  }
  const visible = (spot: Point, reach: number) => distance(at, spot) <= reach && lineOfSight(at, spot, stratum);
  const choices: Target[] = [];
  if (stratum === "vault") {
    for (const s of SALVAGE) {
      const instanceId = runtime(ctx).worldItems.get(s.id);
      if (instanceId === undefined || ctx.scene.worldItem.get(instanceId) === null || dive.collected.includes(s.id)) continue;
      choices.push({ label: `E · Search ${ITEMS[s.kind].name} / 1.4s`, id: s.id, kind: s.kind, at: s.at, act: { type: "loot" } });
    }
    if (dive.print.drop !== null && !dive.collected.includes("fitter") && runtime(ctx).worldItems.has("fitter")) choices.push({ label: "E · Take the Fitter's service rifle / 1.4s", id: "fitter", kind: "service-rifle", at: dive.print.drop, act: { type: "loot" } });
  }
  for (const node of NODES) {
    if (node.place !== stratum || (dive.harvested[node.id] ?? 0) >= node.amount) continue;
    const missing = node.tool === "hands" || has(v.deep, node.tool) ? null : node.tool;
    const left = node.amount - (dive.harvested[node.id] ?? 0);
    choices.push({ label: missing !== null ? `${node.label} / needs the ${TOOL_NAME[missing]}` : `E · ${node.tool === "drill" ? "Drill" : node.tool === "cutter" ? "Cut" : "Strip"} ${node.label} / ${ITEMS[node.yields].name} ×${left}`,
      id: `node:${node.id}`, kind: node.yields, at: node.at, act: { type: "node", node, missing } });
  }
  for (const supply of SUPPLIES) {
    if (supply.place !== stratum || dive.collected.includes(`supply:${supply.id}`)) continue;
    choices.push({ label: `E · Take ${supply.label} / +${supply.amount} ${supply.gives === "ration" ? "ration" : "water"}`, id: `supply:${supply.id}`, at: supply.at, act: { type: "supply", supply } });
  }
  for (const fragment of FRAGMENTS) {
    if (fragment.place !== stratum || v.deep.scanned.includes(fragment.id)) continue;
    choices.push({ label: `E · Scan ${fragment.label} / 1.6s`, id: `scan:${fragment.id}`, at: fragment.at, act: { type: "scan", fragment } });
  }
  if (stratum === "choir" && world.fact("story.zero") !== true) choices.push({ label: "E · Take the pattern from Printer Zero / 4s", id: "zero", at: PRINTER_ZERO, act: { type: "zero" } });
  const reach = (target: Target) => target.act.type === "zero" ? PRINTER_ZERO_REACH : target.act.type === "scan" ? 2.4 : 2.1;
  return choices.filter(target => visible(target.at, reach(target))).sort((a, b) => distance(at, a.at) - distance(at, b.at))[0] ?? null;
}
function begin(ctx: GameContext): Promise<void> | void {
  const v = viewStore.read(ctx), at = playerAt(ctx), save = runtime(ctx).save;
  if (!playable(ctx) || v.mode !== "home" || at === null || distance(at, GARAGE) > GARAGE_REACH || save === null) return;
  const state = runtime(ctx);
  if (state.writing) return;
  const rifle = v.rifleUid === null ? null : v.home.stash.find(item => item.id === v.rifleUid && kindOf(item) === "service-rifle") ?? null;
  let home: Home;
  try { home = depart(v.home, v.rifleUid); }
  catch (error) { viewStore.update(ctx, s => ({ ...s, error: message(error) })); return; }
  // The crawler lands you at the deepest lift you have charted; without it the rail stops at receiving.
  const before = v.deep;
  const stratum: Stratum = has(before, "crawler") && before.charted.includes(v.departTo) ? v.departTo : "vault";
  const lures = Math.min(3, before.lures);
  const dive = newDive(home.activeDive!, home, rifle, { airBonus: airBonus(before, marrowOf(ctx)), lures, stratum });
  const deep: Deep = { ...before, lures: before.lures - lures };
  const spawn = stratum === "vault" ? VAULT_SPAWN : STRATUM_SPAWNS[stratum] ?? VAULT_SPAWN;
  const opening = stratum === "vault" ? null : `Crawler / ${STRATA[stratum].arrival}`;
  const hint = opening ?? (rifle === null ? "Bellwether / salvage shift. Empty cache; issue sidearm. The rail behind you is the only way home." : "Bellwether / armed shift. Your banked rifle is now at risk and takes three cache squares. Return it by rail to keep it.");
  clearLoot(ctx);
  const weapon = arm(ctx, dive);
  // The departure is written with its dive as one document before the vault opens: a failed
  // write leaves the player at Marrow with the record unchanged.
  state.writing = true;
  viewStore.update(ctx, s => ({ ...s, deep }));
  return persist(ctx, home, runOf(ctx, { mode: "dive", dive, rifleUid: null, hint, player: spawn, weapon: weapon.snapshot(), hand: weapon.definition().id }), () => {
    viewStore.write(ctx, { ...viewStore.read(ctx), home, dive, mode: "dive", panel: null, pending: null, error: "", trace: null, rifleUid: null, ammo: ammoOf(weapon), hint });
    teleport(ctx, spawn);
    for (const loot of SALVAGE) spawnLoot(ctx, loot.id, loot.kind, loot.at, dive.id);
    syncPrint(ctx, dive);
    syncPlayer(ctx, dive);
    liveMarrow(ctx);
    ctx.game.audio.play("rail");
    runtime(ctx).checkpoint = 0;
  })
    .catch((error: unknown) => {
      // The diver never left: the record still holds the previous state, so leave them at the rail.
      clearLoot(ctx); syncPrint(ctx, null); syncPlayer(ctx, null);
      runtime(ctx).writing = false;
      viewStore.update(ctx, s => ({ ...s, deep: before, error: message(error), hint: "Departure was not saved. Marrow still holds the previous record." }));
    });
}
/**
 * Capture staging for the mid-dive shot: the diver is standing in a vault room with the cache
 * loaded. The shift itself is a real departure through `begin`, and every item is carried through
 * the same 1.4 s search channel and cache fit a player uses - the stage only decides where the
 * diver stands. Dev-only; never reachable in a production build.
 */
export async function stageMidDive(ctx: GameContext): Promise<void> {
  await runtime(ctx).boot;
  if (viewStore.read(ctx).mode !== "dive") {
    if (viewStore.read(ctx).mode !== "home" || runtime(ctx).save === null) return;
    teleport(ctx, GARAGE);
    run(ctx);
    await begin(ctx);
    if (viewStore.read(ctx).mode !== "dive") return;
  }
  // Load the pack the way a diver does: search a locker, hold still, let the channel finish.
  for (const loot of SALVAGE.slice(0, 3)) {
    teleport(ctx, loot.at);
    interact(ctx);
    for (let elapsed = 0; elapsed < 1.8; elapsed += 0.1) tick(ctx, 0.1);
  }
}
/**
 * Capture staging for a floor's look: a record that owns the crawler and a Mk III seal departs
 * straight to `stratum` through the real `begin`, so every floor can be framed without replaying
 * the story that unlocks it. Dev-only.
 */
export async function stageFloor(ctx: GameContext, stratum: Stratum): Promise<void> {
  await runtime(ctx).boot;
  const v = viewStore.read(ctx);
  if (v.mode !== "home" || runtime(ctx).save === null || !isStratum(stratum)) return;
  const gear: Gear[] = [...new Set<Gear>([...v.deep.gear, "crawler", "seal3"])];
  viewStore.write(ctx, { ...v, departTo: stratum, deep: { ...v.deep, gear, charted: [...new Set([...v.deep.charted, stratum])] } });
  teleport(ctx, GARAGE);
  run(ctx);
  await begin(ctx);
}
function finish(ctx: GameContext, kind: Result["kind"], reason: string): void {
  const v = viewStore.read(ctx);
  if (v.dive === null || (v.mode !== "dive" && v.mode !== "saving")) return;
  const state = runtime(ctx);
  if (state.writing) return;
  viewStore.write(ctx, { ...v, mode: "saving", pending: { kind, reason }, panel: null, paused: false });
  freeze(ctx);
  let home: Home;
  try {
    const save = state.save;
    if (save === null) throw new Error("Persistent storage unavailable");
    home = settle(v.home, v.dive, kind, reason);
    // What rode home on the belt goes into the galley; the pattern from Printer Zero ends the story.
    // A lost Life wakes fed in a new print, and its belt stays in Bellwether.
    const belt = v.dive.belt;
    if (state.galleyBanked !== v.dive.id) {
      state.galleyBanked = v.dive.id;
      const world = marrowOf(ctx);
      let deep = v.deep;
      if (kind === "extracted") {
        world.change({ "marrow.food": belt.ration, "marrow.water": belt.water });
        if (world.fact("story.zero") === true) world.set("story.home", true);
        deep = { ...deep, lures: deep.lures + belt.lure };
      } else deep = { ...deep, body: newDeep().body };
      viewStore.update(ctx, s => ({ ...s, deep }));
    }
    const galleyLine = kind === "extracted" && belt.ration + belt.water > 0 ? ` Galley +${belt.ration} rations, +${belt.water} water.` : "";
    // The return writes the settled record and the home screen it produces together.
    const hint = kind === "extracted" ? `Haul committed to Marrow / ${home.last!.count} items.${galleyLine} Walk left to the stash.` : "Halloway: the printer has you. Your old stash is safe; that Life's haul is gone.";
    state.writing = true;
    void persist(ctx, home, runOf(ctx, { mode: kind === "lost" ? "reprinting" : "home", dive: null, rifleUid: null, hint,
        pending: null, player: HOME_SPAWN, weapon: null, hand: null }), () => {
        if (kind === "lost") {
          viewStore.write(ctx, { ...viewStore.read(ctx), home, mode: "reprinting", pending: null, paused: false, panel: null, error: "", trace: null, ammo: null,
            hint: "Signal ended. The carried haul is lost; Marrow is preparing the next Life." });
          return; // Preserve the failed expedition view until the player acknowledges its consequence.
        }
        clearLoot(ctx);
        syncPrint(ctx, null);
        teleport(ctx, HOME_SPAWN);
        syncPlayer(ctx, null);
        viewStore.write(ctx, { ...viewStore.read(ctx), home, dive: null, mode: "home", pending: null, paused: false, panel: null, error: "", trace: null, ammo: null, hint });
        run(ctx);
        ctx.game.audio.play("banked");
      })
      .catch((error: unknown) => {
        runtime(ctx).writing = false;
        viewStore.update(ctx, s => ({ ...s, error: message(error), hint: "Return has not been acknowledged. Retry or reload the saved record." }));
      });
  } catch (error) {
    viewStore.update(ctx, s => ({ ...s, error: message(error), hint: "Return has not been acknowledged. Retry or reload the saved record." }));
  }
}
function interact(ctx: GameContext): void {
  if (!playable(ctx)) return;
  const target = nearby(ctx), v = viewStore.read(ctx);
  if (target === null) return;
  const act = target.act;
  if (act.type === "garage") { begin(ctx); return; }
  if (act.type === "stash" || act.type === "fabricator") {
    ctx.game.audio.play("terminal");
    liveMarrow(ctx);
    viewStore.update(ctx, s => ({ ...s, panel: act.type === "stash" ? "stash" : "fabricator" })); freeze(ctx); return;
  }
  if (act.type === "exit") {
    if (v.dive?.health !== undefined && v.dive.health > 0) finish(ctx, "extracted", "Returned to the receiving rail with air and haul.");
    return;
  }
  const dive = v.dive, at = playerAt(ctx);
  if (dive === null || at === null) return;
  if (act.type === "lift") {
    if (act.crawler) { if (dive.health > 0) finish(ctx, "extracted", "The crawler climbed the shafts home with air and haul."); return; }
    if (act.locked !== null) { ctx.game.notices.push({ text: act.locked, tone: "deny" }); viewStore.update(ctx, s => ({ ...s, hint: act.locked! })); return; }
    ride(ctx, dive, act.to);
    return;
  }
  if (dive.channel !== null) {
    viewStore.update(ctx, s => ({ ...s, dive: { ...dive, channel: null }, hint: "Cancelled." })); return;
  }
  if (act.type === "node" && act.missing !== null) {
    const text = `Print the ${TOOL_NAME[act.missing]} at Marrow's fabricator to work this.`;
    ctx.game.notices.push({ text, tone: "deny" }); viewStore.update(ctx, s => ({ ...s, hint: text })); return;
  }
  if ((act.type === "loot" || act.type === "node") && target.kind !== undefined) {
    const source = act.type === "node" ? harvestSource(dive, act.node) : target.id;
    const level = act.type === "node" ? harvestLevel(dive.stratum) : sourceDepth(ctx, dive, target.id, target.kind);
    const pending = peekLoot(dive, source, target.kind, level);
    const weight = canCache(dive.cache, pending);
    if (!weight.ok) { ctx.game.notices.push({ text: weight.message, tone: "deny" }); viewStore.update(ctx, s => ({ ...s, hint: weight.message, error: "" })); return; }
    if (pack(dive.cache, pending) === null) {
      const text = `The cache grid has no room for ${ITEMS[target.kind].name}. Tab to repack or leave an item behind.`;
      ctx.game.notices.push({ text, tone: "deny" }); viewStore.update(ctx, s => ({ ...s, hint: text, error: "" })); return;
    }
  }
  const kind = act.type === "loot" ? "search" : act.type === "node" ? "harvest" : act.type;
  const seconds = act.type === "node" && act.node.tool === "drill" ? 2.6 : CHANNEL_SECONDS[kind];
  const hint = kind === "search" ? "Searching / stay still. The Fitter can hear you."
    : kind === "harvest" ? "Working the seam / it is loud. Anything down here can hear it."
    : kind === "scan" ? "Scanning / hold still." : kind === "zero" ? "Printer Zero / copying the pattern. Hold still." : "Taking supplies.";
  viewStore.update(ctx, s => ({ ...s, dive: { ...dive, channel: { id: target.id, remaining: seconds, anchor: at, kind, total: seconds } }, hint }));
}
/** A node's next yield is its own source (`wire~cold-cable-wire-0`), so each cut rolls its own instance and is taken once. */
function harvestSource(dive: Dive, node: (typeof NODES)[number]): string { return `${node.yields}~${node.id}-${dive.harvested[node.id] ?? 0}`; }
/** Salvage from deeper floors rolls at a higher item level. */
function harvestLevel(stratum: Stratum): number { return STRATA[stratum].pressure + 1; }
/** Ride a lift: the diver steps off on the next floor, and that floor is charted on the record. */
function ride(ctx: GameContext, dive: Dive, to: Stratum): void {
  const v = viewStore.read(ctx);
  const arrival = arrivalAt(dive.stratum, to);
  const deep = v.deep.charted.includes(to) ? v.deep : { ...v.deep, charted: [...v.deep.charted, to] };
  const next: Dive = { ...dive, stratum: to, channel: null, thrown: [] };
  const crush = crushDamage(to, sealMark(deep));
  const hint = crush > 0 ? `${STRATA[to].name} / the hull is crushing in: ${crush} damage a second. Print a better seal.` : STRATA[to].arrival;
  runtime(ctx).creatures = null;
  viewStore.write(ctx, { ...v, dive: next, deep, hint });
  teleport(ctx, arrival);
  syncPrint(ctx, next);
  ctx.game.audio.play("rail");
  ctx.game.notices.push({ text: `${STRATA[to].numeral} · ${STRATA[to].name} · ${STRATA[to].metres} m`, tone: crush > 0 ? "deny" : "info" });
  void checkpoint(ctx).catch(() => { /* the next checkpoint retries */ });
}
/**
 * Advance the held weapon by `dt` and fold what it fired back into the dive. The shared runtime
 * owns cadence, reload, ammo and the damage call; the game owns the trigger, the world query and
 * what a hit means for the Fitter.
 */
function shoot(ctx: GameContext, dive: Dive, dt: number, hint: string): { dive: Dive; hint: string; trace: View["trace"] } {
  const weapon = arm(ctx, dive);
  const result = weapon.tick(dt);
  if (result.shots.length === 0) return { dive, hint, trace: null };
  ctx.game.audio.play("shot");
  const shot = result.shots[result.shots.length - 1]!;
  const delivery = weapon.definition().delivery;
  const impact = result.impacts[result.impacts.length - 1];
  const landed = impact?.distance ?? (delivery.kind === "hitscan" ? delivery.maxRange : 0);
  const direction = shot.directions[0]!;
  // The tracer ends where the pellet did: on the Fitter, or at the weapon's reach.
  const to: Point = [shot.origin[0] + direction[0] * landed, shot.origin[1] + direction[1] * landed, shot.origin[2] + direction[2] * landed];
  let health = dive.print.health, creatureHit: string | null = null;
  const fauna = { ...dive.fauna };
  for (const hit of result.impacts) {
    const creature = fauna[hit.target];
    if (creature !== undefined) { fauna[hit.target] = { ...creature, health: Math.max(0, creature.health - hit.resolution.damage) }; creatureHit = hit.target; }
    else health = Math.max(0, health - hit.resolution.damage);
  }
  // A shot is the loudest thing a diver does: every creature on the floor hears it, and the one it
  // hit knows exactly where it came from.
  const nowMs = dive.elapsed * 1000, senses = creaturesOf(ctx), at = playerAt(ctx);
  if (at !== null) {
    broadcast(senses, { kind: "sound", sourceId: ctx.player.userId, position: [at[0], 1.2, at[2]], loudness: 2.5, at: nowMs });
    if (creatureHit !== null) senses.of(fauna[creatureHit]!.species).pushStimulus({ kind: "damage", sourceId: ctx.player.userId, position: [at[0], 1.2, at[2]], at: nowMs });
  }
  const next: Dive = { ...dive, fauna, flash: 0.12, channel: null,
    print: { ...dive.print, health, mode: health > 0 ? "calling" as const : "route" as const, drop: health === 0 ? dive.print.at : dive.print.drop } };
  if (creatureHit !== null) {
    const creature = fauna[creatureHit]!, def = SPECIES[creature.species];
    return { dive: next, trace: { from: shot.origin, to, remaining: 0.09 },
      hint: creature.health === 0 ? `${def.name} down.` : `Hit / ${def.name} ${Math.ceil(creature.health)}/${def.health}` };
  }
  return { dive: next, trace: { from: shot.origin, to, remaining: 0.09 },
    hint: health < dive.print.health ? health === 0 ? "Fitter stopped. Its visible service rifle is yours to carry." : `Hit / Fitter integrity ${health}/80` : "Shot missed / every print on this floor heard it." };
}
function fire(ctx: GameContext): void {
  const v = viewStore.read(ctx), dive = v.dive;
  if (!playable(ctx) || v.mode !== "dive" || dive === null || dive.health <= 0) return;
  const weapon = arm(ctx, dive);
  if (weapon.ammo().loaded === 0) { ctx.game.notices.push({ text: "Empty magazine / R to reload.", tone: "deny" }); viewStore.update(ctx, s => ({ ...s, ammo: ammoOf(weapon) })); return; }
  // A press fires on the press frame when the gun is ready; a press still cooling is dropped, as before.
  weapon.setTrigger(true);
  const shot = shoot(ctx, dive, 0, v.hint);
  if (!ctx.input.isDown("deepwardFire")) weapon.setTrigger(false);
  viewStore.write(ctx, { ...v, dive: shot.dive, hint: shot.hint, ammo: ammoOf(weapon), trace: shot.trace ?? v.trace });
  if (shot.dive.print.health === 0 && dive.print.health > 0) spawnLoot(ctx, "fitter", "service-rifle", dive.print.at, dive.id);
  syncPrint(ctx, shot.dive);
  syncPlayer(ctx, shot.dive);
}
function reload(ctx: GameContext): void {
  const v = viewStore.read(ctx);
  if (!playable(ctx) || v.mode !== "dive" || v.dive === null) return;
  const weapon = arm(ctx, v.dive);
  if (weapon.reload()) ctx.game.audio.play("reload");
  viewStore.update(ctx, s => ({ ...s, ammo: ammoOf(weapon) }));
}
function toggleCache(ctx: GameContext): void {
  const v = viewStore.read(ctx);
  if (v.mode !== "dive" || v.paused) return;
  const panel = v.panel === "cache" ? null : "cache";
  // Packing costs real tank time: an open cache blocks locomotion but never pauses the dive.
  viewStore.write(ctx, { ...v, panel, dive: v.dive === null ? null : { ...v.dive, channel: null } });
  if (panel !== null) ungrab();
}
/** F: the headlamp. It shows the dark strata and shows you to anything that hunts by sight. */
function toggleLamp(ctx: GameContext): void {
  const v = viewStore.read(ctx), dive = v.dive;
  if (!playable(ctx) || v.mode !== "dive" || dive === null) return;
  const lamp = !dive.lamp;
  viewStore.write(ctx, { ...v, dive: { ...dive, lamp }, hint: lamp ? "Lamp on / you can see, and you can be seen." : "Lamp off / dark, and harder to find." });
  ctx.game.audio.play("terminal");
}
/** Q: eat a ration or drink a flask from the belt, whichever the body wants more. */
function eat(ctx: GameContext): void {
  const v = viewStore.read(ctx), dive = v.dive;
  if (!playable(ctx) || v.mode !== "dive" || dive === null) return;
  const values = v.deep.body.values;
  const wants = hungriest(values, dive.belt);
  if (wants === null) {
    const text = dive.belt.ration + dive.belt.water === 0 ? "Nothing on the belt. Supplies are on the shelves below." : "Not hungry or thirsty enough to waste it.";
    ctx.game.notices.push({ text, tone: "deny" }); return;
  }
  const meter = wants === "ration" ? "food" : "water";
  viewStore.write(ctx, { ...v, deep: feed(v.deep, meter, MEAL[meter]), dive: { ...dive, belt: { ...dive.belt, [wants]: dive.belt[wants] - 1 } },
    hint: wants === "ration" ? "Ate a ration." : "Drank a flask." });
}
/** G: throw a blood lure. Predators go where it lands until it is eaten or dries. */
function throwLure(ctx: GameContext): void {
  const v = viewStore.read(ctx), dive = v.dive, at = playerAt(ctx);
  if (!playable(ctx) || v.mode !== "dive" || dive === null || at === null) return;
  if (dive.belt.lure <= 0) { ctx.game.notices.push({ text: "No lures on the belt. Print them at Marrow's fabricator.", tone: "deny" }); return; }
  const landed = lureLanding(at, runtime(ctx).aim, dive.stratum);
  const lure = { id: `lure-${dive.id}-${Math.round(dive.elapsed * 10)}`, at: landed, remaining: 25 };
  viewStore.write(ctx, { ...v, dive: { ...dive, belt: { ...dive.belt, lure: dive.belt.lure - 1 }, thrown: [...dive.thrown, lure] }, hint: "Lure thrown / blood in the water. Anything hunting will go to it." });
}
/** Scan a codex entry once; a blueprint needs several fragments, a log or a species one. */
function scanEntry(deep: Deep, entry: string): { deep: Deep; text: string; learned: boolean } {
  const codex = createDeepCodex(deep.codex);
  const known = codex.isDiscovered(entry);
  codex.scan(entry);
  const view = codex.get(entry), def = CODEX_ENTRIES.find(candidate => candidate.id === entry);
  const name = def?.name ?? entry;
  let text: string, learned = false;
  if (view === null || known) text = `${name} / already in the codex.`;
  else if (!view.discovered) text = `${name} / fragment ${view.scanned} of ${view.fragments} scanned.`;
  else if (def?.meta?.kind === "blueprint") { text = `Blueprint learned: ${name}. Print it at Marrow's fabricator.`; learned = true; }
  else { text = `${name} / ${def?.meta?.text ?? ""}`; learned = true; }
  return { deep: { ...deep, codex: codex.snapshot() }, text, learned };
}
/** C: scan the creature in front of you. A hand's blood teaches the lure. */
function scanCreature(ctx: GameContext): void {
  const v = viewStore.read(ctx), dive = v.dive, at = playerAt(ctx);
  if (!playable(ctx) || v.mode !== "dive" || dive === null || at === null) return;
  const creature = creatureInSight(dive, at, runtime(ctx).aim, 10);
  if (creature === null) { ctx.game.notices.push({ text: "Scanner / nothing living in front of you.", tone: "deny" }); return; }
  const key = `species:${creature.species}`;
  if (v.deep.scanned.includes(key)) {
    const reason = `${SPECIES[creature.species].name} / ${creature.mode === "winding" ? "striking" : creature.mode}: ${creature.reason}.`;
    viewStore.write(ctx, { ...v, hint: reason }); return;
  }
  let scan = scanEntry({ ...v.deep, scanned: [...v.deep.scanned, key] }, SPECIES[creature.species].codex);
  let text = scan.text;
  if (creature.species === "hand") { const lure = scanEntry(scan.deep, "lure"); scan = lure; text = `${text} ${lure.text}`; }
  ctx.game.audio.play("terminal");
  ctx.game.notices.push({ text, tone: "success" });
  viewStore.write(ctx, { ...v, deep: scan.deep, hint: text });
}
/** Print a learned blueprint at the fabricator from banked salvage. */
function printGear(ctx: GameContext, gear: Gear): void {
  const v = viewStore.read(ctx);
  if (v.mode !== "home" || v.panel !== "fabricator" || runtime(ctx).save === null) return;
  try {
    if (!knows(v.deep, gear)) throw new Error(`Scan the ${GEAR[gear].name} blueprint in Bellwether first`);
    if (GEAR[gear].permanent && has(v.deep, gear)) throw new Error(`${GEAR[gear].name} is already printed`);
    const home = payFromStash(v.home, GEAR[gear].recipe);
    const deep: Deep = gear === "lure" ? { ...v.deep, lures: v.deep.lures + 1 } : { ...v.deep, gear: [...v.deep.gear, gear] };
    viewStore.write(ctx, { ...v, home, deep, error: "", hint: `${GEAR[gear].name} printed. ${GEAR[gear].effect}.` });
    ctx.game.audio.play("banked");
    void persist(ctx, home, runOf(ctx, { hint: viewStore.read(ctx).hint })).catch((error: unknown) => viewStore.update(ctx, s => ({ ...s, home: v.home, deep: v.deep, error: message(error) })));
  } catch (error) { viewStore.update(ctx, s => ({ ...s, error: message(error) })); }
}
/** Build a module in the first free Marrow bay; the world model builds it over time and runs it after. */
function buildModule(ctx: GameContext, module: Module): void {
  const v = viewStore.read(ctx);
  if (v.mode !== "home" || v.panel !== "fabricator" || runtime(ctx).save === null) return;
  liveMarrow(ctx);
  const world = marrowOf(ctx);
  try {
    const bay = BAYS.find(entry => world.occupant(entry.id) === null);
    if (bay === undefined) throw new Error("Every bay in Marrow is built");
    const refusal = world.canPlace(module, { slot: bay.id }, { free: true });
    if (refusal !== null) throw new Error(refusal.message);
    const home = payFromStash(v.home, MODULES[module].recipe);
    const placed = world.place(module, { slot: bay.id }, { free: true });
    if (!placed.ok) throw new Error(placed.message ?? "Marrow refused the module");
    viewStore.write(ctx, { ...v, home, error: "", hint: `${MODULES[module].name} going up in ${bay.id.replace("bay-", "bay ")}. ${MODULES[module].effect}.` });
    ctx.game.audio.play("banked");
    void persist(ctx, home, runOf(ctx, { hint: viewStore.read(ctx).hint })).catch((error: unknown) => viewStore.update(ctx, s => ({ ...s, home: v.home, error: message(error) })));
  } catch (error) { viewStore.update(ctx, s => ({ ...s, error: message(error) })); }
}
export function registerControls(ctx: GameContext): void {
  ctx.game.commands.define("deepward.depart", { apply: (state) => { void begin(state); return state; } });
  ctx.game.commands.define<{ uid: string | null }>("deepward.prepareRifle", { apply(state, input) {
    const v = viewStore.read(state);
    if (v.mode !== "home" || v.panel !== "stash") return;
    if (input.uid !== null && (!ledgerOf(v.home).canUse(input.uid) || !v.home.stash.some(item => item.id === input.uid && kindOf(item) === "service-rifle"))) {
      viewStore.update(state, s => ({ ...s, error: "That service rifle is no longer banked" })); return;
    }
    viewStore.write(state, { ...v, rifleUid: input.uid, error: "", hint: input.uid === null ? "Salvage shift selected. The rifle stays safe in Marrow; all twelve cache squares are available." : "Armed shift selected. The rifle leaves the stash only when departure is saved. It costs three cache squares and is lost with your Life." });
  } });
  ctx.game.commands.define<{ id: RefitId }>("deepward.refit", { apply(state, input) {
    const v = viewStore.read(state);
    if (v.mode !== "home" || v.panel !== "stash" || runtime(state).save === null) return;
    try {
      const home = installRefit(v.home, input.id);
      viewStore.write(state, { ...v, home, error: "", hint: `${REFITS[input.id].name} installed. ${REFITS[input.id].effect}. Spent salvage is gone from the stash.` });
      void persist(state, home, runOf(state, { hint: viewStore.read(state).hint })).catch((error: unknown) => viewStore.update(state, s => ({ ...s, home: v.home, error: message(error) })));
    } catch (error) { viewStore.update(state, s => ({ ...s, error: message(error) })); }
  } });
  ctx.game.commands.define<{ kind: ItemKind }>("deepward.buy", { apply(state, input) {
    const v = viewStore.read(state);
    if (v.mode !== "home" || v.panel !== "stash" || runtime(state).save === null) return;
    try {
      const home = buySupply(v.home, input.kind);
      viewStore.write(state, { ...v, home, error: "", hint: `${ITEMS[input.kind].name} bought at the counter. It is in the stash and survives your death.` });
      void persist(state, home, runOf(state, { hint: viewStore.read(state).hint })).catch((error: unknown) => viewStore.update(state, s => ({ ...s, home: v.home, error: message(error) })));
    } catch (error) { viewStore.update(state, s => ({ ...s, error: message(error) })); }
  } });
  ctx.game.commands.define<{ id: string }>("deepward.dismantle", { apply(state, input) {
    const v = viewStore.read(state);
    if (v.mode !== "home" || v.panel !== "stash" || runtime(state).save === null) return;
    try {
      const result = dismantle(v.home, input.id);
      const next = { ...v, home: result.home, rifleUid: result.home.stash.some(item => item.id === v.rifleUid) ? v.rifleUid : null, error: "",
        hint: `Broken down for ${result.scrip} scrip. The instance is spent; it cannot be prepared or paid for again.` };
      viewStore.write(state, next);
      void persist(state, result.home, runOf(state, { hint: next.hint, rifleUid: next.rifleUid })).catch((error: unknown) => viewStore.update(state, s => ({ ...s, home: v.home, error: message(error) })));
    } catch (error) { viewStore.update(state, s => ({ ...s, error: message(error) })); }
  } });
  ctx.game.commands.define("deepward.acknowledgeReprint", { apply(state) {
    const v = viewStore.read(state);
    if (v.mode !== "reprinting" || runtime(state).save === null) return;
    try {
      const home = acknowledgeReprint(v.home);
      clearLoot(state); syncPrint(state, null); teleport(state, HOME_SPAWN); syncPlayer(state, null);
      viewStore.write(state, { ...v, home, dive: null, mode: "home", error: "", hint: "Halloway: the printer has you. Banked stash and installed refits survived. Choose the next departure." });
      run(state);
      void persist(state, home, runOf(state, { mode: "home", dive: null, rifleUid: null, pending: null, hint: viewStore.read(state).hint }))
        .catch((error: unknown) => viewStore.update(state, s => ({ ...s, error: message(error) })));
    } catch (error) { viewStore.update(state, s => ({ ...s, error: message(error) })); }
  } });
  // Published shell dispatches each press/repeat to the bound action's command name.
  // UI commands share the apply functions. Only fire also consumes held input,
  // through its existing cooldown; discrete actions stay on the shell's press path.
  // Capture and UI share the stash sheet the world interaction opens.
  ctx.game.commands.define("deepward.enter", { apply(state) { enterFromTitle(state); } });
  // Dev-only: jump to a loaded mid-dive for the capture that would otherwise be played into.
  if (import.meta.env.DEV) {
    ctx.game.commands.define("deepward.stage", { apply(state) { void stageMidDive(state); return state; } });
    ctx.game.commands.define<{ stratum: Stratum }>("deepward.dev.descend", { apply(state, input) { void stageFloor(state, input.stratum); return state; } });
    // Proof staging: travel across a floor without re-walking it, and seed a record as a player
    // would have it a few dives in. Everything after the seed is played through the real verbs.
    // The first-person camera keeps its own heading, so a stand moves the diver and leaves the view.
    ctx.game.commands.define<{ x: number; z: number }>("deepward.dev.stand", { apply(state, input) {
      const v = viewStore.read(state), place = v.mode === "dive" && v.dive !== null ? v.dive.stratum : "home";
      if (!Number.isFinite(input.x) || !Number.isFinite(input.z) || !walkable(input.x, input.z, place)) return;
      state.scene.entity.setPose(state.player.userId, { position: [input.x, 0, input.z], dt: 0 });
    } });
    ctx.game.commands.define<{ stash?: ItemKind[]; known?: string[]; charted?: Stratum[] }>("deepward.dev.seed", { apply(state, input) {
      const v = viewStore.read(state);
      if (v.mode !== "home" || runtime(state).save === null) return;
      const stash = (input.stash ?? []).filter(kind => Object.hasOwn(ITEMS, kind) && kind !== "service-rifle")
        .map((kind, i) => rollItemFor(kind, `purchase-${v.home.revision + 900 + i}:${kind}`));
      const discovered = Object.fromEntries((input.known ?? []).filter(id => CODEX_ENTRIES.some(entry => entry.id === id)).map(id => [id, 1]));
      const charted = (input.charted ?? []).filter(stratum => STRATA[stratum] !== undefined);
      const home = { ...v.home, stash: [...v.home.stash, ...stash], revision: v.home.revision + 1 };
      const deep: Deep = { ...v.deep, codex: { ...v.deep.codex, discovered: { ...v.deep.codex.discovered, ...discovered } }, charted: [...new Set([...v.deep.charted, ...charted])] };
      viewStore.write(state, { ...v, home, deep, hint: "Record seeded for the proof run." });
      void persist(state, home, runOf(state, {})).catch((error: unknown) => viewStore.update(state, s => ({ ...s, error: message(error) })));
    } });
  }
  ctx.game.commands.define("deepward.openStash", { apply(state) {
    const v = viewStore.read(state);
    // The capture harness presses this right after Enter; wait for the record like Enter does.
    if (v.mode === "loading") { void runtime(state).boot.then(() => state.game.commands.run("deepward.openStash", {})); return; }
    if (v.mode !== "home" || v.paused) return;
    viewStore.write(state, { ...v, panel: "stash", paused: true });
  } });
  ctx.game.commands.define("deepwardInteract", { apply: interact });
  ctx.game.commands.define("deepwardFire", { apply: fire });
  ctx.game.commands.define("deepwardReload", { apply: reload });
  ctx.game.commands.define("deepwardCache", { apply: toggleCache });
  ctx.game.commands.define("deepward.interact", { apply: interact });
  ctx.game.commands.define("deepward.fire", { apply: fire });
  ctx.game.commands.define("deepward.reload", { apply: reload });
  ctx.game.commands.define("deepward.cache", { apply: toggleCache });
  ctx.game.commands.define("deepwardLamp", { apply: toggleLamp });
  ctx.game.commands.define("deepwardEat", { apply: eat });
  ctx.game.commands.define("deepwardLure", { apply: throwLure });
  ctx.game.commands.define("deepwardScan", { apply: scanCreature });
  ctx.game.commands.define("deepward.lamp", { apply: toggleLamp });
  ctx.game.commands.define("deepward.eat", { apply: eat });
  ctx.game.commands.define("deepward.lure", { apply: throwLure });
  ctx.game.commands.define("deepward.scan", { apply: scanCreature });
  ctx.game.commands.define<{ gear: Gear }>("deepward.print", { apply(state, input) { if (Object.hasOwn(GEAR, input.gear)) printGear(state, input.gear); } });
  ctx.game.commands.define<{ module: Module }>("deepward.build", { apply(state, input) { if (Object.hasOwn(MODULES, input.module)) buildModule(state, input.module); } });
  ctx.game.commands.define("deepward.openFabricator", { apply(state) {
    const v = viewStore.read(state);
    if (v.mode === "loading") { void runtime(state).boot.then(() => state.game.commands.run("deepward.openFabricator", {})); return; }
    if (v.mode !== "home" || v.paused) return;
    liveMarrow(state);
    viewStore.write(state, { ...v, panel: "fabricator", paused: true });
  } });
  ctx.game.commands.define<{ stratum: Stratum }>("deepward.departTo", { apply(state, input) {
    const v = viewStore.read(state);
    if (v.mode !== "home" || !v.deep.charted.includes(input.stratum) || !has(v.deep, "crawler")) return;
    viewStore.write(state, { ...v, departTo: input.stratum, hint: `The crawler will land you at ${STRATA[input.stratum].name}.` });
  } });
  ctx.game.commands.define("deepward.close", { apply(state) {
    const v = viewStore.read(state);
    viewStore.write(state, { ...v, panel: null, paused: false });
    if (v.mode === "home" || v.mode === "dive") run(state);
  } });
  ctx.game.commands.define<{ paused?: boolean }>("deepward.pause", { apply(state, input) {
    const v = viewStore.read(state);
    if (v.mode !== "home" && v.mode !== "dive") return;
    if (v.panel !== null) { state.game.commands.run("deepward.close", {}); return; }
    const paused = input.paused ?? !v.paused;
    viewStore.write(state, { ...v, paused, dive: v.dive === null ? null : { ...v.dive, channel: null } });
    if (paused) freeze(state); else run(state);
  } });
  ctx.game.commands.define("deepward.retrySave", { apply(state) {
    const v = viewStore.read(state);
    if (v.mode === "saving" && v.pending !== null) finish(state, v.pending.kind, v.pending.reason);
  } });
  ctx.game.commands.define<{ uid: string; x?: number; y?: number; rotate?: boolean }>("deepward.pack", { apply(state, input) {
    const v = viewStore.read(state), dive = v.dive;
    if (v.panel !== "cache" || dive === null || v.mode !== "dive") return;
    const item = dive.cache.find(i => i.id === input.uid);
    if (item === undefined) return;
    const next = { ...item, x: input.x ?? item.x, y: input.y ?? item.y, rotated: input.rotate ? !item.rotated : item.rotated };
    if (!Number.isInteger(next.x) || !Number.isInteger(next.y) || !fits(dive.cache, next)) { state.game.notices.push({ text: "That footprint will not fit there.", tone: "deny" }); return; }
    viewStore.write(state, { ...v, dive: { ...dive, cache: dive.cache.map(i => i.id === next.id ? next : i) } });
  } });
  ctx.game.commands.define<{ uid: string }>("deepward.discard", { apply(state, input) {
    const v = viewStore.read(state), dive = v.dive;
    if (v.panel !== "cache" || dive === null || v.mode !== "dive") return;
    const item = dive.cache.find(i => i.id === input.uid);
    if (item === undefined) return;
    viewStore.write(state, { ...v, dive: { ...dive, cache: dive.cache.filter(i => i.id !== input.uid), hand: kindOf(item) === "service-rifle" ? "sidearm" : dive.hand }, hint: `${ITEMS[kindOf(item)].name} left behind. It cannot be reclaimed this dive.` });
  } });
  ctx.game.commands.define<{ hand: "sidearm" | "service-rifle" }>("deepward.equip", { apply(state, input) {
    const v = viewStore.read(state), dive = v.dive;
    if (v.mode !== "dive" || dive === null || (input.hand !== "sidearm" && input.hand !== "service-rifle")) return;
    const weapon = arm(state, { ...dive, hand: input.hand });
    if (weapon.ammo().reload !== "idle") return;
    if (input.hand === "service-rifle" && !dive.cache.some(i => kindOf(i) === "service-rifle")) return;
    restartCadence(weapon);
    viewStore.write(state, { ...v, dive: { ...dive, hand: input.hand }, ammo: ammoOf(weapon), hint: "One hand / equipped. Both guns share the same ammo pool." });
  } });
}
export function initialize(ctx: GameContext): void {
  registerControls(ctx);
  ctx.game.audio.loop("bed", "bed");
  ctx.game.audio.setLoop("bed", { gain: BED_GAIN });
  const state = runtime(ctx);
  state.boot = boot(ctx);
}

/**
 * Read the shared save document into the live systems. Boot, and the title's Continue, both go
 * through the one record: the persistent Marrow section and the run section (a dive in progress).
 */
async function boot(ctx: GameContext): Promise<void> {
  try {
    if (typeof localStorage === "undefined") throw new Error("Marrow needs browser local storage before a dive can start.");
    const state = runtime(ctx);
    let restored: RunSnapshot | null = null;
    const save = openRecord(localStorage, {
      snapshot: () => snapshotRun(ctx),
      // The record's run is applied once the whole document is in memory, so a half-applied load
      // can never leave the world showing one section and the HUD another.
      restore: next => { restored = next as RunSnapshot | null; },
      // The descent's own section: body, gear, scans, charted strata and Marrow's base world.
      deep: {
        snapshot: () => ({ ...viewStore.read(ctx).deep, marrow: marrowState(ctx) ?? null }),
        restore: next => { viewStore.update(ctx, v => ({ ...v, deep: next, departTo: next.charted.includes(v.departTo) ? v.departTo : "vault" })); restoreMarrow(ctx, next.marrow); },
      },
    });
    await save.load();
    state.save = save;
    state.ready = true;
    holdAtHome(ctx, save, validRun(restored) ? restored : null);
  } catch (error) {
    viewStore.update(ctx, v => ({ ...v, mode: "blocked", error: message(error), dive: null, panel: null }));
    freeze(ctx);
  }
}

/**
 * Put the loaded home on screen and leave a dive in the record for Continue. Boot never resumes a
 * dive by itself: the title shows what the record holds, and only Continue puts the diver back in it.
 */
function holdAtHome(ctx: GameContext, save: RecordSession, record: RunSnapshot | null): void {
  const home = save.home;
  // A departure with no run section is a Life the record lost mid-dive; settle it as before.
  const recovered = record === null || record.dive === null ? recoverInterrupted(home) : home;
  if (recovered !== home) void save.commit(recovered).catch(() => { /* the next departure retries the record */ });
  viewStore.write(ctx, { ...viewStore.read(ctx), home: recovered, mode: recovered.reprintPending ? "reprinting" : "home", dive: null, panel: null, paused: false,
    pending: null, error: "", trace: null, ammo: null, hint: recovered.last?.reason ?? viewStore.read(ctx).hint });
  teleport(ctx, HOME_SPAWN); clearLoot(ctx); syncPrint(ctx, null); syncPlayer(ctx, null);
  // A lost Life is acknowledged before anything else; every other record waits at the title.
  if (recovered.reprintPending) freeze(ctx); else openTitle(ctx);
}

/** Continue: put the record's dive (or its home) back on screen and run it. */
export async function resumeRecord(ctx: GameContext): Promise<void> {
  const save = runtime(ctx).save;
  if (save === null) return;
  const run = save.restoredRun;
  await applyRecord(ctx, save, validRun(run) ? run : null);
  const mode = viewStore.read(ctx).mode;
  if (mode === "home" || mode === "dive") enterFromTitle(ctx);
}

/** Put the loaded record on screen: resume the dive it holds, or stand at Marrow again. */
async function applyRecord(ctx: GameContext, save: RecordSession, record: RunSnapshot | null): Promise<void> {
  const state = runtime(ctx);
  const home = save.home;
  // A departure with no run section is a Life the record lost mid-dive; settle it as before.
  if (record === null || record.dive === null) {
    const recovered = recoverInterrupted(home);
    if (recovered !== home) await save.commit(recovered);
    viewStore.write(ctx, { ...viewStore.read(ctx), home: recovered, mode: recovered.reprintPending ? "reprinting" : "home", dive: null, panel: null, paused: false,
      pending: null, error: "", trace: null, ammo: null, hint: recovered.last?.reason ?? viewStore.read(ctx).hint });
    teleport(ctx, HOME_SPAWN); clearLoot(ctx); syncPrint(ctx, null); syncPlayer(ctx, null);
    openTitle(ctx);
    return;
  }
  const dive = normalizeDive(record.dive);
  clearLoot(ctx);
  const weapon = arm(ctx, dive);
  if (record.weapon !== null) weapon.restore(record.weapon);
  state.armed = weapon.definition().id;
  viewStore.write(ctx, { ...viewStore.read(ctx), home, mode: record.mode, dive, rifleUid: record.rifleUid,
    panel: null, paused: false, error: "", trace: null, pending: record.pending, hint: record.hint, ammo: ammoOf(weapon) });
  teleport(ctx, record.player ?? (dive.stratum === "vault" ? VAULT_SPAWN : STRATUM_SPAWNS[dive.stratum] ?? VAULT_SPAWN));
  for (const loot of SALVAGE) if (!dive.collected.includes(loot.id)) spawnLoot(ctx, loot.id, loot.kind, loot.at, dive.id);
  if (dive.print.drop !== null && !dive.collected.includes("fitter")) spawnLoot(ctx, "fitter", "service-rifle", dive.print.drop, dive.id);
  syncPrint(ctx, dive);
  syncPlayer(ctx, dive);
  if (record.mode === "saving") freeze(ctx); else run(ctx);
}

/** Stand in front of Marrow with the world frozen: nothing runs until a shift is chosen. */
export function openTitle(ctx: GameContext): void {
  ctx.time.pause();
  setGamePhase(ctx, "menu");
  ctx.game.audio.setLoop("bed", { gain: 0 });
  ungrab();
}

/** Leave the title for the loaded record: the rail is live again. */
export function enterFromTitle(ctx: GameContext): void {
  const v = viewStore.read(ctx);
  // A press that lands while the record is still being read waits for it rather than being lost.
  if (v.mode === "loading") { void runtime(ctx).boot.then(() => enterFromTitle(ctx)); return; }
  if (v.mode === "blocked" || v.mode === "reprinting") return;
  run(ctx);
}

/** Re-read the saved record from disk - the title's Continue reads the document, not a flag. */
export function continueSaved(ctx: GameContext): void {
  const state = runtime(ctx);
  state.boot = state.boot.then(() => boot(ctx)).catch((error: unknown) => {
    viewStore.update(ctx, v => ({ ...v, mode: "blocked", error: message(error) }));
    freeze(ctx);
  });
}

/** The record session the menu reads and switches. */
export function recordOf(ctx: GameContext): RecordSession | null {
  return runtime(ctx).save;
}

/** Commit the record as it stands, so a reload resumes exactly this screen. */
export async function persistRecord(ctx: GameContext): Promise<void> {
  const state = runtime(ctx);
  if (state.save === null) throw new Error("Persistent storage unavailable");
  state.writing = true;
  await persist(ctx, viewStore.read(ctx).home, snapshotRun(ctx));
}

/** Open a record by slot: switch the document, then put the run it holds on screen. */
export async function loadRecordSlot(ctx: GameContext, slot: string): Promise<void> {
  const state = runtime(ctx);
  if (state.save === null) return;
  await state.save.switchSlot(slot);
  await resumeRecord(ctx);
}

/**
 * Start a fresh record in a slot. `replace` deletes the record already there first, so a new dive
 * never inherits another Life's stash; an empty slot needs no deletion.
 */
export async function beginRecordSlot(ctx: GameContext, slot: string, replace = false): Promise<void> {
  const state = runtime(ctx);
  if (state.save === null) return;
  if (replace) await state.save.deleteSlot(slot);
  await state.save.switchSlot(slot);
  await applyRecord(ctx, state.save, null);
  enterFromTitle(ctx);
}

/** Save the record and stand back at Marrow's title, the way a shift is left. */
export async function withdrawToTitle(ctx: GameContext): Promise<void> {
  await persistRecord(ctx);
  openTitle(ctx);
}

export function seatPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn("diver", { id: ctx.player.userId, position: HOME_SPAWN, rotationY: Math.PI, role: "player" });
  syncPlayer(ctx, null);
  // The record decides whether this is a fresh title or a resumed dive; until it has been read,
  // hold the world frozen behind the title.
  openTitle(ctx);
  if (runtime(ctx).ready && (viewStore.read(ctx).mode === "blocked" || viewStore.read(ctx).mode === "reprinting")) freeze(ctx);
}
/** Called only by a storage change event, never by a polling loop. */
export function storageChanged(ctx: GameContext): void {
  try {
    if (runtime(ctx).save?.isCurrent() !== false) return;
  } catch { /* inaccessible storage also stops play */ }
  viewStore.update(ctx, s => ({ ...s, mode: "blocked", error: "Marrow changed in another window. Reload to use its saved state." }));
  freeze(ctx);
}
export function tick(ctx: GameContext, dt: number): void {
  const v = viewStore.read(ctx);
  if (v.paused || v.mode === "saving" || v.mode === "blocked" || !(dt > 0)) return;
  // Seconds at the home or in a dive are the record's playtime, written with the next record.
  if (v.mode === "home" || v.mode === "dive") recordProfile.playtime += dt;
  liveMarrow(ctx);
  if (v.mode === "home") { tickHome(ctx, v, dt); return; }
  const at = playerAt(ctx);
  if (v.mode !== "dive" || v.dive === null || at === null || v.paused) return;
  const stratum = v.dive.stratum, place = STRATA[stratum];
  const steamOn = v.dive.elapsed % 8 < 3;
  const steam = steamOn && stratum === "vault" && inside(at[0], at[2], STEAM);
  const hazards = hazardsAt(at, stratum, steamOn);
  // The body: the cold eats food, the ink makes you thirsty, an empty meter bleeds the suit, and a
  // seal rated short of this floor's pressure lets the hull crush in.
  let deep = drain(v.deep, dt, { food: place.drain.food * (hazards.has("frost") ? 3 : 1), water: place.drain.water });
  const empty = (deep.body.values.food! <= 0 ? 1 : 0) + (deep.body.values.water! <= 0 ? 1 : 0);
  const crush = crushDamage(stratum, sealMark(deep));
  let dive = ageDive(v.dive, dt, steam, { damage: crush + empty * STARVE_DAMAGE, airRate: place.drain.air });
  if (hazards.has("ink")) dive = { ...dive, inked: 8 };
  else if (dive.inked > 0) dive = { ...dive, inked: Math.max(0, dive.inked - dt) };
  let hint = steam ? "Hot suppressant / leave the striped floor!"
    : crush > 0 ? `Hull groaning / pressure ${place.pressure} is past your seal. Get up a floor.`
    : hazards.has("frost") ? "Frost / the cold is eating your rations." : hazards.has("ink") ? "Ink / it slows you and the couriers can smell it."
    : empty > 0 ? "Starving / eat or drink from the belt (Q) or get home to the galley." : v.hint;
  // Low-air escalation: one chirp every half second once the tank is under 20 seconds.
  const runState = runtime(ctx);
  if (dive.oxygen > 0 && dive.oxygen < 20) {
    const beat = Math.floor(dive.elapsed * 2);
    if (beat !== runState.airBeat) { runState.airBeat = beat; ctx.game.audio.play("lowAir"); }
  } else runState.airBeat = -1;
  let p = { ...dive.print, cooldown: Math.max(0, dive.print.cooldown - dt) };
  if (p.health > 0 && stratum === "vault") {
    const range = distance(at, p.at), senses = sensesOf(ctx), nowMs = dive.elapsed * 1000;
    // A search is a sound at the station's hearing range; the shared service decides whether the
    // Fitter heard it from where it stands and keeps the memory that makes it investigate.
    if (dive.channel !== null && lineOfSight(at, p.at)) {
      senses.pushStimulus({ kind: "sound", sourceId: ctx.player.userId, position: [at[0], at[1], at[2]], loudness: 1, at: nowMs });
    }
    senses.observe({ id: PRINT_ID, position: [p.at[0], p.at[1], p.at[2]], yaw: runtime(ctx).facing }, [{ id: ctx.player.userId, position: [at[0], at[1], at[2]] }], nowMs);
    const alert = senses.memoryOf(PRINT_ID, ctx.player.userId) !== null;
    const sees = alert && at[2] < RECEIVING_BACK_Z;
    const noisy = alert && dive.channel !== null;
    if (p.mode === "winding") {
      p.attack = Math.max(0, p.attack - dt);
      if (p.attack === 0) {
        if (range < 2.3 && lineOfSight(at, p.at)) {
          dive = { ...dive, health: Math.max(0, dive.health - 22), hurt: 0.4, channel: null };
          hint = "Fitter rifle butt / 22 damage. Back away during its raised-arm windup.";
        }
        p.mode = "calling"; p.cooldown = 1.2;
      }
    } else if (sees || noisy || (p.mode === "calling" && range < 18 && lineOfSight(at, p.at) && at[2] < RECEIVING_BACK_Z)) {
      p.mode = "calling";
      if (range < 1.9 && p.cooldown === 0) { p.mode = "winding"; p.attack = 0.7; hint = "Fitter raises its rifle / step back!"; ctx.game.audio.play("windup"); }
      else if (range >= 1.9) {
        const from = p.at;
        p.at = advanceRoute(runtime(ctx).navigation, p.at, at, Math.min(range - 1.7, dt * 2.5), "vault");
        if (p.at[0] !== from[0] || p.at[2] !== from[2]) runtime(ctx).facing = Math.atan2(p.at[0] - from[0], p.at[2] - from[2]);
      }
    } else {
      p.mode = "route";
      const goal: Point = [PRINT_SPAWN[0] + Math.sin(dive.elapsed * 0.4), PRINT_SPAWN[1], PRINT_SPAWN[2] + Math.sin(dive.elapsed * 0.3) * 2];
      const remaining = distance(p.at, goal);
      if (remaining > 0) {
        const from = p.at;
        p.at = advanceRoute(runtime(ctx).navigation, p.at, goal, dt * 2.5, "vault");
        if (p.at[0] !== from[0] || p.at[2] !== from[2]) runtime(ctx).facing = Math.atan2(p.at[0] - from[0], p.at[2] - from[2]);
      }
    }
  }
  dive = { ...dive, print: p };
  // Everything else that lives on this floor: what it heard, smelled and saw, and what it does next.
  {
    const senses = creaturesOf(ctx), nowMs = dive.elapsed * 1000, here: Point = [at[0], 1.2, at[2]];
    const moving = ctx.input.isDown("moveForward") || ctx.input.isDown("moveBack") || ctx.input.isDown("moveLeft") || ctx.input.isDown("moveRight");
    if (moving && ctx.input.isDown("sprint")) broadcast(senses, { kind: "sound", sourceId: ctx.player.userId, position: here, loudness: 0.7, at: nowMs });
    if (dive.channel !== null) {
      const loud = dive.channel.kind === "harvest" ? ((dive.channel.total ?? 2) > 2.2 ? 1.4 : 1) : dive.channel.kind === "scan" || dive.channel.kind === "supply" ? 0.35 : 0.8;
      broadcast(senses, { kind: "sound", sourceId: ctx.player.userId, position: here, loudness: loud, at: nowMs });
    }
    if (dive.health < 60) broadcast(senses, { kind: "scent", sourceId: ctx.player.userId, position: here, loudness: (60 - dive.health) / 30, at: nowMs });
    if (dive.inked > 0) broadcast(senses, { kind: "scent", sourceId: ctx.player.userId, position: here, loudness: 1, at: nowMs });
    for (const lure of dive.thrown) broadcast(senses, { kind: "scent", sourceId: lure.id, position: [lure.at[0], 0.4, lure.at[2]], loudness: 2, at: nowMs });
    const before = dive.fauna;
    const living = tickCreatures(dive, { id: ctx.player.userId, at, lamp: dive.lamp }, senses, dt, nowMs);
    dive = { ...dive, fauna: living.fauna, thrown: living.thrown };
    if (living.damage > 0) dive = { ...dive, health: Math.max(0, dive.health - living.damage), hurt: 0.4, channel: null };
    if (Object.values(living.fauna).some(creature => creature.mode === "winding" && before[creature.id]?.mode !== "winding")) ctx.game.audio.play("windup");
    if (living.hint !== null) hint = living.hint;
  }
  if (dive.channel !== null) {
    const ch = dive.channel, kind = ch.kind ?? "search";
    const spot = channelSpot(dive, ch.id, kind);
    const jolted = steam || v.dive.health - dive.health > 3 || dive.health <= 0;
    if (spot === null || jolted || distance(at, ch.anchor) > 0.3 || distance(at, spot) > 2.7 || !lineOfSight(at, spot, stratum)) {
      dive = { ...dive, channel: null }; hint = "Interrupted / stay still and clear of danger.";
    } else if (ch.remaining <= dt) {
      const done = completeChannel(ctx, dive, deep, ch.id, kind);
      dive = { ...done.dive, channel: null }; deep = done.deep; hint = done.hint;
    } else dive = { ...dive, channel: { ...ch, remaining: ch.remaining - dt } };
  }
  let trace = v.trace !== null && v.trace.remaining > dt ? { ...v.trace, remaining: v.trace.remaining - dt } : null;
  let ammo = v.ammo;
  const wasAlive = dive.health > 0;
  if (dive.health > 0) {
    const weapon = arm(ctx, dive);
    ammo = ammoOf(weapon);
    if (playable(ctx)) {
      // Held input is the trigger; the shared runtime decides whether this tick fires.
      weapon.setTrigger(ctx.input.isDown("deepwardFire"));
      const shot = shoot(ctx, dive, dt, hint);
      dive = shot.dive; hint = shot.hint; ammo = ammoOf(weapon);
      if (shot.trace !== null) trace = shot.trace;
      if (dive.print.health === 0 && wasAlive && dive.health > 0) spawnLoot(ctx, "fitter", "service-rifle", p.at, dive.id);
    }
  }
  viewStore.write(ctx, { ...v, dive, deep, hint, trace, ammo });
  syncPrint(ctx, dive); syncPlayer(ctx, dive);
  if (dive.health <= 0) {
    const reason = dive.oxygen === 0 ? "Tank exhausted. Bellwether kept the carried haul."
      : crush > 0 ? `The hull gave at ${place.name}. The carried haul was lost.`
      : empty > 0 ? "Starved in Bellwether. The carried haul was lost."
      : "The Life ended in Bellwether. The carried haul was lost.";
    finish(ctx, "lost", reason); return;
  }
  // A reload resumes the dive from its checkpoint: the tank, the Vitals lines, the magazine and
  // where the diver stands are written once a second of dive time, never per frame.
  const beat = Math.floor(dive.elapsed);
  if (beat !== runtime(ctx).checkpoint) {
    runtime(ctx).checkpoint = beat;
    void checkpoint(ctx).catch(() => { /* the next checkpoint retries; play never stops for a save */ });
  }
}
/** Time at Marrow: the body drains slowly, the galley feeds it, and the base's world keeps running. */
function tickHome(ctx: GameContext, v: View, dt: number): void {
  const fed = galley(ctx, drain(v.deep, dt, { food: HOME_DRAIN, water: HOME_DRAIN }));
  viewStore.write(ctx, { ...v, deep: fed.deep, hint: fed.fed ?? v.hint });
}
type ChannelOf = NonNullable<NonNullable<Dive["channel"]>["kind"]>;
/** Where a channel's target stands, or null once it is gone. */
function channelSpot(dive: Dive, id: string, kind: ChannelOf): Point | null {
  if (kind === "search") return id === "fitter" ? dive.print.drop : SALVAGE.find(entry => entry.id === id)?.at ?? null;
  if (kind === "harvest") return NODES.find(node => `node:${node.id}` === id)?.at ?? null;
  if (kind === "supply") return SUPPLIES.find(supply => `supply:${supply.id}` === id)?.at ?? null;
  if (kind === "scan") return FRAGMENTS.find(fragment => `scan:${fragment.id}` === id)?.at ?? null;
  if (kind === "zero") return PRINTER_ZERO;
  return null;
}
/** A held E that ran its full time: the salvage, supply, scan or pattern it was for. */
function completeChannel(ctx: GameContext, dive: Dive, deep: Deep, id: string, kind: ChannelOf): { dive: Dive; deep: Deep; hint: string } {
  const deny = (text: string) => { ctx.game.notices.push({ text, tone: "deny" }); return { dive, deep, hint: text }; };
  if (kind === "search") {
    const target = id === "fitter" ? { kind: "service-rifle" as const } : SALVAGE.find(entry => entry.id === id);
    if (target === undefined) return deny("Nothing left there.");
    const looted = takeLoot(dive, id, target.kind, sourceDepth(ctx, dive, id, target.kind));
    const instanceId = runtime(ctx).worldItems.get(id);
    if (!looted.ok) return deny(looted.message);
    if (instanceId === undefined || ctx.scene.worldItem.consume(instanceId) === null) return deny("The cache grid has no space for that footprint.");
    runtime(ctx).worldItems.delete(id);
    return { dive: looted.dive, deep, hint: `${ITEMS[target.kind].name} in cache. It becomes permanent only after rail return.` };
  }
  if (kind === "harvest") {
    const node = NODES.find(entry => `node:${entry.id}` === id);
    if (node === undefined) return deny("Nothing left there.");
    const count = dive.harvested[node.id] ?? 0;
    const looted = takeLoot(dive, harvestSource(dive, node), node.yields, harvestLevel(node.place));
    if (!looted.ok) return deny(looted.message);
    return { dive: { ...looted.dive, harvested: { ...dive.harvested, [node.id]: count + 1 } }, deep,
      hint: `${ITEMS[node.yields].name} in cache (${count + 1}/${node.amount} from ${node.label}). Bank it by rail.` };
  }
  if (kind === "supply") {
    const supply = SUPPLIES.find(entry => `supply:${entry.id}` === id);
    if (supply === undefined) return deny("Nothing left there.");
    const belt = { ...dive.belt, [supply.gives]: dive.belt[supply.gives] + supply.amount };
    return { dive: { ...dive, belt, collected: [...dive.collected, id] }, deep,
      hint: `+${supply.amount} ${supply.gives === "ration" ? "ration" : "water"} on the belt. Q to use it; what you carry home fills Marrow's galley.` };
  }
  if (kind === "scan") {
    const fragment = FRAGMENTS.find(entry => `scan:${entry.id}` === id);
    if (fragment === undefined) return deny("Nothing to scan.");
    const scan = scanEntry({ ...deep, scanned: [...deep.scanned, fragment.id] }, fragment.entry);
    if (fragment.entry === "log-relay") marrowOf(ctx).set("story.relay", true);
    ctx.game.audio.play("terminal");
    ctx.game.notices.push({ text: scan.text, tone: scan.learned ? "success" : "info" });
    return { dive, deep: scan.deep, hint: scan.text };
  }
  if (kind === "zero") {
    marrowOf(ctx).set("story.zero", true);
    ctx.game.audio.play("banked");
    const scan = scanEntry(deep, "log-zero");
    ctx.game.notices.push({ text: "Pattern 406 copied. Get it home.", tone: "success" });
    return { dive, deep: scan.deep, hint: "Printer Zero / the pattern is yours. Get it home alive." };
  }
  return { dive, deep, hint: "" };
}
/** Read-only metrics for the published driver's standalone capture bridge. */
export function captureProbe(ctx: GameContext): Record<string, number> {
  const v = viewStore.read(ctx), at = playerAt(ctx);
  const load = loadOf(v.dive?.cache ?? []);
  return { x: at?.[0] ?? 0, z: at?.[2] ?? 0, inDive: v.mode === "dive" ? 1 : 0,
    reprinting: v.mode === "reprinting" ? 1 : 0, oxygen: v.dive?.oxygen ?? 0,
    tankSeconds: v.dive?.tankSeconds ?? 0, reserve: v.ammo?.reserve ?? 0,
    carried: v.dive?.cache.length ?? 0, stash: v.home.stash.length,
    cacheMass: load.mass, cacheRoom: load.remaining, banked: v.home.bank.banked,
    salvaged: Object.keys(v.home.ledger).length, prepared: v.rifleUid === null ? 0 : 1,
    stashValue: v.home.stash.reduce((sum, item) => sum + itemValue(item), 0),
    tankRefit: v.home.refits.includes("tank") ? 1 : 0, reserveRefit: v.home.refits.includes("reserve") ? 1 : 0,
    deaths: v.home.deaths, returns: v.home.extractions, ...depthProbe(ctx, v) };
}
/** The descent's numbers for the capture bridge: where, how fed, what is known and built. */
function depthProbe(ctx: GameContext, v: View): Record<string, number> {
  const world = marrowOf(ctx), dive = v.dive, at = playerAt(ctx);
  const alive = dive === null ? [] : Object.values(dive.fauna).filter(creature => creature.place === dive.stratum && creature.health > 0);
  const near = at === null ? Infinity : Math.min(Infinity, ...alive.map(creature => distance(creature.at, at)));
  const flag = (key: string) => world.fact(key) === true ? 1 : 0;
  return {
    stratum: dive === null ? 0 : ["vault", "cold", "wells", "choir"].indexOf(dive.stratum) + 1,
    food: Math.round(v.deep.body.values.food ?? 0), water: Math.round(v.deep.body.values.water ?? 0),
    lamp: dive?.lamp === true ? 1 : 0, beltRation: dive?.belt.ration ?? 0, beltWater: dive?.belt.water ?? 0, beltLure: dive?.belt.lure ?? 0,
    lures: v.deep.lures, gear: v.deep.gear.length, codex: Object.keys(v.deep.codex.discovered).length, scans: v.deep.scanned.length,
    charted: v.deep.charted.length, seal: sealMark(v.deep), crawler: has(v.deep, "crawler") ? 1 : 0,
    power: world.num("marrow.power"), galleyFood: world.num("marrow.food"), galleyWater: world.num("marrow.water"),
    modules: world.instances().length, generators: world.num("marrow.generators"),
    signal: flag("story.signal"), relay: flag("story.relay"), zero: flag("story.zero"), storyHome: flag("story.home"),
    creatures: alive.length, nearestCreature: Number.isFinite(near) ? Math.round(near * 10) / 10 : 99,
    hunting: alive.filter(creature => creature.mode === "attack" || creature.mode === "stalk" || creature.mode === "winding").length,
    luresOut: dive?.thrown.length ?? 0, inked: dive !== null && dive.inked > 0 ? 1 : 0,
  };
}
