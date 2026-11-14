import type { ActionCodesMap } from "@jgengine/core/input/actionBindings";
import { teleportPlayer } from "@jgengine/core/movement/teleport";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { hashUnit } from "@jgengine/core/random/rng";
import { defineStore } from "@jgengine/core/store/defineStore";
import { menuPane, openTitle, showMenuPane, type MenuPane } from "@jgengine/core/game/gameFlow";
import { rebindAction } from "@jgengine/core/game/controlGate";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import type { ActionCodes } from "@jgengine/core/input/actionBindings";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { BURROW, DEPART, eyeLevel, groundDistance, HOME_SPAWN, inCover, inside, NOOK, STASH, WORKBENCH, walkable, ZONE_NAME, type ConnectorKind, type Point, type RoomTemplate, type Zone } from "../world";
import { acknowledgeCaught, age, littlesOf, carry, clockText, depart, familyUp, fits, hasGear, isDawn, ledgerOf, lightsOn, newHome, newRun, pack, peekLoot, recoverInterrupted, roomOf, runSeedOf, settle, twoHanded, type Home, type PackedItem, type Result, type Run } from "./state";
import { defOf, displayName, ITEMS, itemValue, kindOf, rollItem, tradeValue, type Item, type ItemKind } from "./loot";
import { LITTLES, isLittle, type LittleId } from "./littles";
import { CHARTS, goalStep, pay, RECIPES, UPGRADES, type UpgradeId } from "./burrow";
import { canCarry, loadOf } from "./haul";
import { NIGHTS, nightOf, planRoom, type Forward, type PlannedExit, type RoomPlan } from "./runGen";
import { jab, spawnThreat, tickThreats, webDrag, type ThreatEvent, type ThreatState } from "./threats";
import { openRecord, recordProfile, type RecordSession, type RunSnapshot, type StoragePort } from "./save";

export const keybinds: ActionCodesMap = {
  moveForward: ["KeyW", "ArrowUp"], moveBack: ["KeyS", "ArrowDown"],
  moveLeft: ["KeyA", "ArrowLeft"], moveRight: ["KeyD", "ArrowRight"],
  sprint: ["ShiftLeft"],
  crumbInteract: ["KeyE"], crumbPack: ["Tab"], crumbUse: ["KeyF"], crumbFling: ["KeyG"], crumbSneak: ["KeyC", "ControlLeft"],
};
export type Panel = "stash" | "workbench" | "nook" | "pack" | "report";
export interface View {
  home: Home; run: Run | null;
  mode: "loading" | "home" | "run" | "saving" | "blocked" | "caught";
  panel: Panel | null; paused: boolean; hint: string; error: string;
  pending: { kind: Result["kind"]; reason: string; via: string } | null;
  /** How far your sound carried this tick and how close the nearest hunter is to noticing you, for the HUD. */
  noise: number; danger: number;
  sneaking: boolean;
  /** The last extraction, shown once on the way back into the burrow. */
  report: NightReport | null;
}
export interface NightReport { items: { id: string; kind: ItemKind; name: string; rarity: string }[]; caps: number; sets: string[]; depth: number; rooms: number; via: string; clock: string; littles: LittleId[] }
export const viewStore = defineStore<View>("crumbrun.session", () => ({
  home: newHome(), run: null, mode: "loading", panel: null, paused: false,
  hint: "Walk to the crack in the wall. E to slip out into the house.", error: "", pending: null, noise: 0, danger: 0, sneaking: false, report: null,
}));
const runtime = perContext(() => ({
  save: null as RecordSession | null, ready: false, boot: Promise.resolve(),
  writes: Promise.resolve() as Promise<void>, writing: false,
  aim: [0, 0, -1] as Point, last: null as Point | null, pebble: null as Point | null, checkpoint: 0,
  /** Finds the pack turned away (too heavy, no square): the carry limit at work. */
  refusals: 0,
  /** Ground covered since the last footstep, and seconds since the last heartbeat. */
  stride: 0, heart: 0,
}));
const BED_GAIN = 0.4;
const message = (e: unknown): string => e instanceof Error ? e.message : String(e);

export function setAim(ctx: GameContext, direction: Point): void { runtime(ctx).aim = direction; }
function playerAt(ctx: GameContext): Point | null { return ctx.scene.entity.get(ctx.player.userId)?.position ?? null; }
function playable(ctx: GameContext): boolean {
  const v = viewStore.read(ctx);
  return !v.paused && v.panel === null && (v.mode === "home" || v.mode === "run");
}
/** The template the Little stands in: the burrow at home, else the run's current room. */
export function templateOf(view: Pick<View, "mode" | "run">): RoomTemplate {
  return view.run === null || (view.mode !== "run" && view.mode !== "saving" && view.mode !== "caught") ? BURROW : roomOf(view.run).template;
}

// ---------------------------------------------------------------- persistence
function persist(ctx: GameContext, next: Home, run?: RunSnapshot | null, after?: () => void): Promise<void> {
  const state = runtime(ctx), save = state.save;
  if (save === null) { state.writing = false; return Promise.reject(new Error("Persistent storage unavailable")); }
  const write = state.writes.then(async () => {
    try { await save.commit(next, run); after?.(); } finally { state.writing = false; }
  });
  state.writes = write.catch(() => undefined);
  return write;
}
function checkpoint(ctx: GameContext): Promise<void> { return persist(ctx, viewStore.read(ctx).home); }
export function whenWritten(ctx: GameContext): Promise<void> { return runtime(ctx).writes; }
export function whenReady(ctx: GameContext): Promise<void> { return runtime(ctx).boot; }
function facingOf(ctx: GameContext): number { return ctx.scene.entity.get(ctx.player.userId)?.rotationY ?? Math.PI; }
function snapshotRun(ctx: GameContext): RunSnapshot {
  const v = viewStore.read(ctx);
  return { mode: v.mode === "loading" || v.mode === "blocked" ? "home" : v.mode, run: v.run, hint: v.hint, pending: v.pending, player: playerAt(ctx), facing: facingOf(ctx) };
}
const runOf = (ctx: GameContext, patch: Partial<RunSnapshot>): RunSnapshot => ({ ...snapshotRun(ctx), ...patch });
function validRun(next: unknown): next is RunSnapshot {
  if (typeof next !== "object" || next === null) return false;
  const snap = next as RunSnapshot;
  if (snap.mode !== "home" && snap.mode !== "run" && snap.mode !== "saving" && snap.mode !== "caught") return false;
  if (snap.run === null) return true;
  const r = snap.run;
  return Number.isFinite(r.id) && typeof r.seed === "string" && isLittle(r.little) && Number.isFinite(r.elapsed) && Number.isFinite(r.health)
    && Array.isArray(r.pack) && Array.isArray(r.taken) && typeof r.room === "string" && Array.isArray(r.threats);
}

function ungrab(): void { if (typeof document !== "undefined") document.exitPointerLock?.(); }
function freeze(ctx: GameContext): void { ctx.time.pause(); setGamePhase(ctx, "paused"); ctx.game.audio.setLoop("bed", { gain: 0 }); ungrab(); }
function resume(ctx: GameContext): void { setGamePhase(ctx, "playing"); ctx.game.audio.setLoop("bed", { gain: BED_GAIN }); ctx.time.play(); }
function teleport(ctx: GameContext, at: Point, facing?: number): void {
  // The engine's teleport also drops queued movement and turns the camera, so the view faces `facing`.
  teleportPlayer(ctx, ctx.player.userId, { x: at[0], y: 0, z: at[2], yaw: facing ?? Math.PI });
  runtime(ctx).last = [at[0], 0, at[2]];
}
const faceToward = (from: Point, to: { x: number; z: number }) => Math.atan2(to.x - from[0], to.z - from[2]);
function syncPlayer(ctx: GameContext, run: Run | null): void {
  ctx.scene.entity.stats.set(ctx.player.userId, "health", { current: run?.health ?? 100, max: run?.maxHealth ?? 100 });
}
/** The threats a room starts with when you walk in: everything the plan put there that you have not already beaten. */
function threatsFor(run: Run, plan: RoomPlan): ThreatState[] {
  return plan.threats.filter(t => t.kind !== "lights" && !run.dead.includes(t.key)).map(t => {
    const s = spawnThreat(t);
    return run.sprung.includes(t.key) ? { ...s, mode: "sprung" as const } : s;
  });
}
/** Where you arrive: the entry slot coming forward, the door you left by coming back. */
function arrivalOf(plan: RoomPlan, from: string | null): { at: Point; facing: number } {
  const forward = from === null ? undefined : plan.forwards.find(f => f.to === from);
  const slot = forward?.slot ?? plan.entry.slot;
  // Arrive looking across the room toward where you would go next: the way on coming in, the way
  // back coming home. Room centres are often filled with something enormous.
  const look = forward !== undefined ? plan.entry.slot.at : plan.forwards[0]?.slot.at ?? [plan.template.area.x, 0, plan.template.area.z];
  const center = { x: (look[0] + plan.template.area.x) / 2, z: (look[2] + plan.template.area.z) / 2 };
  // Step a few paces in from the door, so you arrive looking into the room, not into the doorframe.
  const dx = center.x - slot.at[0], dz = center.z - slot.at[2], len = Math.hypot(dx, dz) || 1;
  let at: Point = [slot.at[0], 0, slot.at[2]];
  for (const pace of [3, 2, 1]) {
    const x = slot.at[0] + dx / len * pace, z = slot.at[2] + dz / len * pace;
    if (walkable(plan.template, x, z)) { at = [x, 0, z]; break; }
  }
  return { at, facing: faceToward(at, center) };
}

// ---------------------------------------------------------------- what E does
export type Act =
  | { type: "depart" } | { type: "stash" } | { type: "workbench" } | { type: "nook" }
  | { type: "exit"; exit: PlannedExit; blocked: string | null }
  | { type: "forward"; forward: Forward }
  | { type: "back"; to: string; kind: ConnectorKind }
  | { type: "loot"; key: string }
  | { type: "toybox"; key: string }
  | { type: "disarm"; key: string }
  | { type: "pickup"; id: string };
export interface Target { label: string; id: string; at: Point; act: Act; reach: number }
const VERB: Record<ConnectorKind, [forward: string, back: string]> = {
  crack: ["Squeeze through", "Squeeze back through"], climb: ["Climb", "Climb down"], drop: ["Parachute off", "Climb back up"],
  cable: ["Zipline down", "Haul yourself up"], train: ["Ride the train from", "Ride the train back from"], vent: ["Crawl through", "Crawl back through"],
};
const KIND_WORD: Record<ConnectorKind, string> = { crack: "a gap", climb: "a climb", drop: "a drop", cable: "a cable", train: "the toy train", vent: "a vent" };
/** Seconds a crossing takes, which way and with what gear. */
export function crossSeconds(kind: ConnectorKind, forward: boolean, run: Pick<Run, "pack">): number {
  const grapple = hasGear(run, "grapple");
  switch (kind) {
    case "crack": return 0.8;
    case "climb": return forward ? (grapple ? 0.6 : 2.4) : 1.2;
    case "drop": return forward ? 0.6 : grapple ? 0.8 : 4;
    case "cable": return forward ? 1.1 : 3.4;
    case "train": return 1.2;
    case "vent": return 1.6;
  }
}
/** The toy train only stops for a few seconds in every eighteen. */
export const trainIn = (run: Pick<Run, "elapsed">) => run.elapsed % 18 < 7;
/** The heating runs half the time; the vent is only usable when it is off. */
export const ventOpen = (run: Pick<Run, "elapsed">) => run.elapsed % 40 < 22;
/** Why an exit will not take you right now, or null when it will. */
export function exitBlocked(exit: PlannedExit, run: Run): string | null {
  const little = LITTLES[run.little];
  if (exit.kind === "mail") {
    const load = loadOf(run.pack, run.capacity, little);
    if (twoHanded(run) || run.pack.some(item => defOf(item).bulky === true)) return "too narrow for anything two-handed";
    if (load.mass > run.capacity * 0.6) return `too narrow at ${load.mass} weight (squeeze through under ${Math.round(run.capacity * 6) / 10})`;
    return null;
  }
  if (exit.kind === "vent") return ventOpen(run) ? null : "the heating is roaring through it, wait";
  if (exit.kind === "dogdoor") return hasGear(run, "grapple") || little.bulkyFree ? null : "the flap is too heavy (a grapple, or Tuck, could lift it)";
  return null;
}
const EXIT_NAME: Record<PlannedExit["kind"], string> = { crack: "Slip home through the crack", mail: "Out through the mail slot", vent: "Into the heating vent", dogdoor: "Out through the flap" };
function preview(view: View, forward: Forward): string {
  const run = view.run;
  const sees = run !== null && (LITTLES[run.little].scout || view.home.upgrades.mapRoom > 0);
  if (!sees) return `${KIND_WORD[forward.kind]} into the unknown`;
  const threats = forward.threats.filter(t => t !== "lights");
  return `${forward.template.name}${threats.length > 0 ? ` · ${[...new Set(threats)].join(", ")}` : " · quiet"}`;
}

export function nearby(ctx: GameContext): Target | null {
  const v = viewStore.read(ctx), at = playerAt(ctx);
  if (at === null) return null;
  const pick = (spots: Target[]) => spots.filter(s => groundDistance(at, s.at) <= s.reach).sort((a, b) => groundDistance(at, a.at) - groundDistance(at, b.at))[0] ?? null;
  if (v.mode === "home") {
    const little = LITTLES[v.home.little];
    return pick([
      { label: `Slip out into the house as ${little.name}`, id: "depart", at: DEPART.at, act: { type: "depart" }, reach: DEPART.reach },
      { label: "Open the stash", id: "stash", at: STASH.at, act: { type: "stash" }, reach: STASH.reach },
      { label: "Workbench: build and craft", id: "workbench", at: WORKBENCH.at, act: { type: "workbench" }, reach: WORKBENCH.reach },
      { label: "The Littles' nook: choose who goes", id: "nook", at: NOOK.at, act: { type: "nook" }, reach: NOOK.reach },
    ]);
  }
  const run = v.run;
  if (v.mode !== "run" || run === null) return null;
  const plan = roomOf(run), little = LITTLES[run.little];
  const choices: Target[] = [];
  for (const exit of plan.exits) {
    const blocked = exitBlocked(exit, run);
    choices.push({ label: blocked === null ? `${EXIT_NAME[exit.kind]} · bank your pack` : `${exit.label}: ${blocked}`, id: exit.key, at: exit.at, act: { type: "exit", exit, blocked }, reach: 3.2 });
  }
  for (const forward of plan.forwards) {
    const train = forward.kind === "train" && !trainIn(run) ? " (wait for the train)" : "";
    const chute = forward.kind === "drop" && !hasGear(run, "parachute") ? " without a parachute (it will hurt)" : "";
    choices.push({ label: `${VERB[forward.kind][0]} ${forward.slot.label}${chute}${train} → ${preview(v, forward)}`, id: forward.to, at: forward.slot.at, act: { type: "forward", forward }, reach: 3 });
  }
  const parent = run.room.includes("-") ? run.room.slice(0, run.room.lastIndexOf("-")) : null;
  if (parent !== null) {
    const back = planRoom(runSeedOf(run), parent);
    choices.push({ label: `${VERB[plan.entry.kind][1]} ${plan.entry.slot.label} → back to ${back.template.name}`, id: `back:${parent}`, at: plan.entry.slot.at, act: { type: "back", to: parent, kind: plan.entry.kind }, reach: 3 });
  }
  for (const loot of plan.loot) {
    if (run.taken.includes(loot.key)) continue;
    if (loot.kind === "toybox") {
      if (v.home.kidsBox.length > 0) choices.push({ label: `Open the kid's treasure box (${v.home.kidsBox.length} of your things)`, id: loot.key, at: loot.spot.at, act: { type: "toybox", key: loot.key }, reach: 3 });
      continue;
    }
    const def = ITEMS[loot.kind];
    const known = loot.spot.tier === "open" || (little.foodSense && def.category === "food") || (little.shinySense && def.category === "curio");
    choices.push({ label: known ? `Take the ${def.name.toLowerCase()}${def.bulky === true ? " (two arms)" : ""}` : `Rummage ${loot.spot.label}`, id: loot.key, at: loot.spot.at, act: { type: "loot", key: loot.key }, reach: 2.6 });
  }
  for (const t of run.threats) if (t.kind === "trap" && t.mode === "armed") choices.push({ label: little.trapSense ? "Disarm the mousetrap (1 s) for its spring" : "Disarm the mousetrap (3 s, noisy)", id: t.key, at: t.at, act: { type: "disarm", key: t.key }, reach: 2.4 });
  for (const drop of run.dropped) if (drop.room === run.room) choices.push({ label: `Pick up the ${defOf(drop.item).name.toLowerCase()}`, id: drop.id, at: drop.at, act: { type: "pickup", id: drop.id }, reach: 2.4 });
  return pick(choices);
}

// ---------------------------------------------------------------- leaving and coming home
function begin(ctx: GameContext): Promise<void> | void {
  const v = viewStore.read(ctx), at = playerAt(ctx), state = runtime(ctx);
  if (!playable(ctx) || v.mode !== "home" || at === null || groundDistance(at, DEPART.at) > DEPART.reach + 0.5 || state.save === null || state.writing) return;
  let home: Home;
  try { home = depart(v.home); } catch (error) { viewStore.update(ctx, s => ({ ...s, error: message(error) })); return; }
  const run0 = newRun(home.activeRun!, home, v.home);
  const plan = roomOf(run0);
  const run: Run = { ...run0, threats: threatsFor(run0, plan) };
  const arrival = arrivalOf(plan, null);
  const fed = run.maxHealth > 100 ? ` Well fed: ${run.maxHealth} health.` : "";
  const night = NIGHTS[nightOf(run.seed)];
  const hint = `${clockText(run)}. ${night.name}: ${night.line}${fed}`;
  ctx.game.notices.push({ text: `Tonight: ${night.name}`, tone: "info" });
  state.writing = true;
  return persist(ctx, home, runOf(ctx, { mode: "run", run, hint, pending: null, player: arrival.at, facing: arrival.facing }), () => {
    viewStore.write(ctx, { ...viewStore.read(ctx), home, run, mode: "run", panel: null, pending: null, error: "", hint });
    teleport(ctx, arrival.at, arrival.facing);
    syncPlayer(ctx, run);
    ctx.game.audio.play("squeeze");
    runtime(ctx).checkpoint = 0;
  }).catch((error: unknown) => {
    runtime(ctx).writing = false;
    viewStore.update(ctx, s => ({ ...s, error: message(error), hint: "The run did not start: the burrow's record is unchanged." }));
  });
}
function finish(ctx: GameContext, kind: Result["kind"], reason: string, via = ""): void {
  const v = viewStore.read(ctx);
  if (v.run === null || (v.mode !== "run" && v.mode !== "saving")) return;
  const state = runtime(ctx);
  if (state.writing) return;
  viewStore.write(ctx, { ...v, mode: "saving", pending: { kind, reason, via }, panel: null, paused: false });
  freeze(ctx);
  let home: Home;
  try {
    if (state.save === null) throw new Error("Persistent storage unavailable");
    home = settle(v.home, v.run, kind, reason, via);
  } catch (error) {
    viewStore.update(ctx, s => ({ ...s, error: message(error), hint: "The return has not been saved. Retry or reload." }));
    return;
  }
  const last = home.last!;
  const setLine = (last.sets ?? []).length > 0 ? ` Set complete: ${(last.sets ?? []).length} (+caps).` : "";
  const hint = kind === "extracted" ? `Home with ${last.count} things and ${last.caps ?? 0} caps.${setLine} The stash is on the left.` : "Caught. Your stash is safe; the run's haul is gone.";
  state.writing = true;
  void persist(ctx, home, runOf(ctx, { mode: kind === "lost" ? "caught" : "home", run: null, hint, pending: null, player: HOME_SPAWN, facing: Math.PI }), () => {
    if (kind === "lost") {
      viewStore.write(ctx, { ...viewStore.read(ctx), home, mode: "caught", pending: null, paused: false, panel: null, error: "", hint });
      ctx.game.audio.play("caught");
      return;
    }
    teleport(ctx, HOME_SPAWN, Math.PI);
    syncPlayer(ctx, null);
    // The night's report: what came home, what it was worth, and who it moved in.
    const report: NightReport = { items: v.run!.pack.map(i => ({ id: i.id, kind: kindOf(i), name: displayName(i), rarity: i.rarity })), caps: last.caps ?? 0, sets: last.sets ?? [], depth: last.depth ?? 0, rooms: v.run!.visited.length, via: last.via ?? "crack", clock: clockText(v.run!), littles: littlesOf(home).filter(id => !littlesOf(v.home).includes(id)) };
    viewStore.write(ctx, { ...viewStore.read(ctx), home, run: null, mode: "home", pending: null, paused: false, panel: "report", report, error: "", hint });
    freeze(ctx);
    ctx.game.audio.play("banked");
  }).catch((error: unknown) => {
    runtime(ctx).writing = false;
    viewStore.update(ctx, s => ({ ...s, error: message(error), hint: "The return has not been saved. Retry or reload." }));
  });
}
/** Walk through a door: the next room is planned from the seed, its hunters wake, the run checkpoints. */
function enterRoom(ctx: GameContext, run: Run, to: string, from: string | null, cost = 0, text = ""): void {
  const v = viewStore.read(ctx);
  const plan = planRoom(runSeedOf(run), to);
  const arrival = arrivalOf(plan, from);
  const depth = plan.depth;
  const next: Run = { ...run, room: to, visited: run.visited.includes(to) ? run.visited : [...run.visited, to], deepest: Math.max(run.deepest, depth),
    threats: threatsFor(run, plan), shield: true, channel: null, health: Math.max(0, run.health - cost), hurt: cost > 0 ? 0.4 : run.hurt };
  const hint = `${text}${plan.template.name}${depth > 0 ? ` · ${depth} room${depth === 1 ? "" : "s"} from the crack` : " · the crack home is here"}. ${plan.template.flavor}`;
  viewStore.write(ctx, { ...v, run: next, hint });
  teleport(ctx, arrival.at, arrival.facing);
  syncPlayer(ctx, next);
  ctx.game.audio.play(plan.depth > run.deepest ? "deeper" : "squeeze");
  ctx.game.notices.push({ text: `${plan.template.name}${plan.threats.some(t => t.kind !== "lights") ? "" : " · it's quiet here"}`, tone: "info" });
  void checkpoint(ctx).catch(() => { /* the next checkpoint retries */ });
}

function interact(ctx: GameContext): void {
  if (!playable(ctx)) return;
  const target = nearby(ctx), v = viewStore.read(ctx), at = playerAt(ctx);
  if (target === null || at === null) return;
  const act = target.act;
  if (act.type === "depart") { begin(ctx); return; }
  if (act.type === "stash" || act.type === "workbench" || act.type === "nook") {
    ctx.game.audio.play("rustle");
    viewStore.update(ctx, s => ({ ...s, panel: act.type })); freeze(ctx); return;
  }
  const run = v.run;
  if (run === null) return;
  if (run.channel !== null) { viewStore.update(ctx, s => ({ ...s, run: s.run === null ? null : { ...s.run, channel: null }, hint: "Stopped." })); return; }
  const deny = (text: string) => { runtime(ctx).refusals += 1; ctx.game.notices.push({ text, tone: "deny" }); viewStore.update(ctx, s => ({ ...s, hint: text })); };
  const channel = (kind: NonNullable<Run["channel"]>["kind"], id: string, seconds: number, hint: string) =>
    viewStore.update(ctx, s => ({ ...s, run: s.run === null ? null : { ...s.run, channel: { kind, id, remaining: seconds, total: seconds, anchor: at } }, hint }));
  switch (act.type) {
    case "exit":
      if (act.blocked !== null) { deny(`The ${act.exit.label}: ${act.blocked}.`); return; }
      channel("exit", act.exit.key, 1.4, `${EXIT_NAME[act.exit.kind]}… hold still.`); return;
    case "forward":
      if (act.forward.kind === "train" && !trainIn(run)) { deny("The toy train is away round the track. Wait for it to stop."); return; }
      channel("cross", act.forward.to, crossSeconds(act.forward.kind, true, run), `${VERB[act.forward.kind][0]} ${act.forward.slot.label}…`); return;
    case "back":
      if (act.kind === "train" && !trainIn(run)) { deny("The toy train is away round the track. Wait for it to stop."); return; }
      channel("cross", `back:${act.to}`, crossSeconds(act.kind, false, run), `${VERB[act.kind][1]}…`); return;
    case "loot": {
      const planned = roomOf(run).loot.find(l => l.key === act.key);
      if (planned === undefined || planned.kind === "toybox") return;
      const item = peekLoot(run, planned);
      const weight = canCarry(run.pack, item, run.capacity, LITTLES[run.little]);
      if (!weight.ok) { deny(weight.message); return; }
      if (pack(run, item) === null) { deny(`No room in your pack for the ${defOf(item).name.toLowerCase()}. Tab to repack.`); return; }
      const seconds = planned.spot.tier === "open" ? 0.7 : planned.spot.tier === "tucked" ? 1.3 : 2;
      channel("search", act.key, seconds, planned.spot.tier === "open" ? "Picking it up…" : "Rummaging… it's noisy."); return;
    }
    case "toybox": channel("toybox", act.key, 2.2, "Prising the toy box open…"); return;
    case "disarm": channel("disarm", act.key, LITTLES[run.little].trapSense ? 1 : 3, LITTLES[run.little].trapSense ? "Bolt pins the bar…" : "Easing the spring back… careful."); return;
    case "pickup": {
      const drop = run.dropped.find(d => d.id === act.id);
      if (drop === undefined) return;
      const result = carry(run, drop.item, `pickup:${drop.id}:${run.elapsed}`);
      if (!result.ok) { deny(result.message); return; }
      viewStore.update(ctx, s => ({ ...s, run: { ...result.run, taken: run.taken, dropped: run.dropped.filter(d => d.id !== act.id) }, hint: `Picked the ${defOf(drop.item).name.toLowerCase()} back up.` }));
      return;
    }
  }
}

/** A finished channel: what holding still bought you. */
function completeChannel(ctx: GameContext, run: Run): Run {
  const ch = run.channel!;
  const plan = roomOf(run);
  const done = { ...run, channel: null };
  if (ch.kind === "search") {
    const planned = plan.loot.find(l => l.key === ch.id);
    if (planned === undefined || planned.kind === "toybox") return done;
    const item = peekLoot(run, planned);
    const result = carry(done, item, planned.key);
    if (!result.ok) { ctx.game.notices.push({ text: result.message, tone: "deny" }); return done; }
    const def = defOf(item);
    ctx.game.audio.play(def.category === "curio" || item.rarity !== "common" ? "shiny" : "pickup");
    ctx.game.notices.push({ text: `${displayName(item)} · ${def.flavor}`, tone: "info" });
    viewStore.update(ctx, s => ({ ...s, hint: `${displayName(item)} in the pack.${def.bulky === true && !LITTLES[run.little].bulkyFree ? " Two arms: you're slower now." : ""}${def.gear !== undefined ? " Gear works while it's in your pack." : ""}` }));
    return result.run;
  }
  if (ch.kind === "toybox") {
    const home = viewStore.read(ctx).home;
    let next = { ...done, taken: [...done.taken, ch.id] }, got = 0;
    for (const item of home.kidsBox) { const slot = pack(next, item); if (slot !== null && canCarry(next.pack, item, next.capacity, LITTLES[run.little]).ok) { next = { ...next, pack: [...next.pack, slot] }; got += 1; } }
    // What you take back leaves the toy box at the next save; the rest waits for another night.
    const taken = new Set(next.pack.map(item => item.id));
    viewStore.update(ctx, s => ({ ...s, home: { ...s.home, kidsBox: s.home.kidsBox.filter(item => !taken.has(item.id)) }, hint: got > 0 ? `You took back ${got} of your things from the kid's treasure box.` : "Your pack is too full to take anything back." }));
    ctx.game.audio.play("shiny");
    return next;
  }
  if (ch.kind === "disarm") {
    const spring = rollItem("spring", plan.depth + 1, `crumb:${run.seed}:${ch.id}:spring`, `${run.id}:spring~${ch.id.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`);
    let next: Run = { ...done, sprung: [...done.sprung, ch.id], threats: done.threats.map(t => t.key === ch.id ? { ...t, mode: "sprung" as const } : t) };
    const result = carry(next, spring, `${ch.id}:spring`);
    if (result.ok) next = result.run;
    ctx.game.audio.play("click");
    viewStore.update(ctx, s => ({ ...s, hint: result.ok ? "Disarmed. The spring is yours." : "Disarmed, but there's no room for the spring." }));
    return next;
  }
  if (ch.kind === "cross") {
    const back = ch.id.startsWith("back:");
    const to = back ? ch.id.slice(5) : ch.id;
    const forward = plan.forwards.find(f => f.to === to);
    let cost = 0, text = "";
    if (!back && forward?.kind === "drop" && !hasGear(run, "parachute")) {
      cost = hasGear(run, "helmet") ? 15 : 30;
      text = "You jumped. The landing knocked the wind out of you. ";
      if (run.health - cost <= 0) { finishLater(ctx, "lost", "You jumped without a parachute and didn't get up."); return { ...done, health: 0 }; }
    } else if (!back && forward?.kind === "drop") text = "The napkin catches the air and you float down. ";
    enterRoom(ctx, done, to, back ? run.room : null, cost, text);
    return viewStore.read(ctx).run ?? done;
  }
  if (ch.kind === "exit") {
    const exit = plan.exits.find(e => e.key === ch.id);
    finishLater(ctx, "extracted", `${EXIT_NAME[exit?.kind ?? "crack"]}, ${clockText(run)}, ${plan.depth} rooms deep.`, exit?.kind ?? "crack");
  }
  return done;
}
const pendingFinish = new WeakMap<GameContext, { kind: Result["kind"]; reason: string; via: string }>();
function finishLater(ctx: GameContext, kind: Result["kind"], reason: string, via = ""): void { pendingFinish.set(ctx, { kind, reason, via }); }

// ---------------------------------------------------------------- run verbs
function togglePack(ctx: GameContext): void {
  const v = viewStore.read(ctx);
  if (v.mode !== "run" || v.paused) return;
  const panel = v.panel === "pack" ? null : "pack";
  // Packing costs night: the pack blocks walking but never pauses the house.
  viewStore.write(ctx, { ...v, panel, run: v.run === null ? null : { ...v.run, channel: null } });
  if (panel !== null) ungrab();
}
function use(ctx: GameContext): void {
  const v = viewStore.read(ctx), run = v.run, at = playerAt(ctx);
  if (!playable(ctx) || v.mode !== "run" || run === null || at === null) return;
  if (!hasGear(run, "spear")) { ctx.game.notices.push({ text: "Nothing to jab with. A sewing needle would do.", tone: "deny" }); return; }
  const aim = runtime(ctx).aim, reachAt: Point = [at[0] + aim[0] * 1.5, 0, at[2] + aim[2] * 1.5];
  const result = jab(run.threats, reachAt);
  ctx.game.audio.play("jab");
  if (result.text === null) { viewStore.update(ctx, s => ({ ...s, hint: "You jab at nothing." })); return; }
  let next: Run = { ...run, threats: result.states, flash: 0.2 };
  if (result.silk !== null) {
    const key = result.states.find(s => s.mode === "dead" && !run.dead.includes(s.key))?.key ?? `${run.room}:silk`;
    next = { ...next, dead: [...next.dead, key] };
    const silk = rollItem("spider-silk", roomOf(run).depth + 2, `crumb:${run.seed}:${key}:silk`, `${run.id}:spider-silk~${key.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`);
    const carried = carry(next, silk, `${key}:silk`);
    if (carried.ok) next = carried.run;
    else next = { ...next, dropped: [...next.dropped, { id: `${key}:silk`, item: silk, at: result.silk, room: run.room }] };
  }
  viewStore.write(ctx, { ...v, run: next, hint: result.text });
}
function fling(ctx: GameContext): void {
  const v = viewStore.read(ctx), run = v.run, at = playerAt(ctx);
  if (!playable(ctx) || v.mode !== "run" || run === null || at === null) return;
  if (!hasGear(run, "slingshot")) { ctx.game.notices.push({ text: "No slingshot. A rubber band and a paperclip make one.", tone: "deny" }); return; }
  if (run.sling > 0) { ctx.game.notices.push({ text: "Still fitting the next pebble.", tone: "deny" }); return; }
  const aim = runtime(ctx).aim, len = Math.hypot(aim[0], aim[2]) || 1, area = roomOf(run).template.area;
  const land: Point = [Math.max(area.x - area.w / 2 + 1, Math.min(area.x + area.w / 2 - 1, at[0] + aim[0] / len * 18)), 0, Math.max(area.z - area.d / 2 + 1, Math.min(area.z + area.d / 2 - 1, at[2] + aim[2] / len * 18))];
  runtime(ctx).pebble = land;
  ctx.game.audio.play("pebble");
  viewStore.write(ctx, { ...v, run: { ...run, sling: 6 }, hint: "Ping! The pebble clatters away across the room." });
}

// ---------------------------------------------------------------- burrow verbs
function updateHome(ctx: GameContext, change: (home: Home) => Home, hint: string): void {
  const v = viewStore.read(ctx), state = runtime(ctx);
  if (v.mode !== "home" || state.writing) return;
  let next: Home;
  try { next = change(v.home); } catch (error) { viewStore.update(ctx, s => ({ ...s, error: message(error) })); return; }
  next = { ...next, revision: v.home.revision + 1 };
  state.writing = true;
  void persist(ctx, next, runOf(ctx, { mode: "home", run: null }), () => {
    viewStore.update(ctx, s => ({ ...s, home: next, hint, error: "" }));
    ctx.game.audio.play("build");
  }).catch((error: unknown) => viewStore.update(ctx, s => ({ ...s, error: message(error) })));
}
function registerBurrow(ctx: GameContext): void {
  ctx.game.commands.define<{ id: LittleId }>("deepward.chooseLittle", { apply(state, input) {
    if (!isLittle(input.id)) return;
    updateHome(state, home => {
      if (!littlesOf(home).includes(input.id)) throw new Error(`${LITTLES[input.id].name} has not moved in yet. ${LITTLES[input.id].unlock}`);
      return { ...home, little: input.id };
    }, `${LITTLES[input.id].name} ${LITTLES[input.id].title} will go next.`);
  } });
  ctx.game.commands.define<{ uid: string; on: boolean }>("deepward.bring", { apply(state, input) {
    updateHome(state, home => {
      const item = home.stash.find(i => i.id === input.uid);
      if (item === undefined || defOf(item).gear === undefined) throw new Error("Only gear can go on a run.");
      return { ...home, bring: input.on ? [...new Set([...home.bring, input.uid])] : home.bring.filter(id => id !== input.uid) };
    }, input.on ? "Packed for the run. Lose the run and it's gone." : "Back on the shelf.");
  } });
  ctx.game.commands.define<{ id: string }>("deepward.trade", { apply(state, input) {
    updateHome(state, home => {
      const item = home.stash.find(i => i.id === input.id);
      if (item === undefined) throw new Error("That is no longer in the stash.");
      const ledger = ledgerOf(home);
      if (!ledger.canUse(item.id)) throw new Error("Already traded.");
      ledger.spend(item.id, "sold");
      return { ...home, stash: home.stash.filter(i => i.id !== item.id), bring: home.bring.filter(id => id !== item.id), caps: home.caps + tradeValue(item), ledger: ledger.snapshot() };
    }, "Traded at the swap-meet behind the skirting.");
  } });
  ctx.game.commands.define<{ id: UpgradeId }>("deepward.upgrade", { apply(state, input) {
    const def = UPGRADES[input.id];
    if (def === undefined) return;
    updateHome(state, home => {
      const level = home.upgrades[input.id], next = def.levels[level];
      if (next === undefined) throw new Error(`${def.name} is as good as it gets.`);
      const paid = pay(home.stash, home.caps, next.cost);
      const upgrades = { ...home.upgrades, [input.id]: level + 1 };
      return { ...home, ...paid, bring: home.bring.filter(id => paid.stash.some(i => i.id === id)), upgrades, milestones: { ...home.milestones, mapRoom: upgrades.mapRoom } };
    }, `${def.name} built.`);
  } });
  ctx.game.commands.define<{ kind: ItemKind }>("deepward.craft", { apply(state, input) {
    const recipe = RECIPES.find(r => r.makes === input.kind);
    if (recipe === undefined) return;
    updateHome(state, home => {
      if (home.upgrades.workbench < recipe.bench) throw new Error("The workbench needs its vise for that.");
      const paid = pay(home.stash, home.caps, { items: recipe.needs, caps: recipe.caps });
      const made = rollItem(recipe.makes, 2, `crumb:craft:${home.revision}:${recipe.makes}`, `craft-${home.revision + 1}:${recipe.makes}`);
      return { ...home, ...paid, bring: home.bring.filter(id => paid.stash.some(i => i.id === id)), stash: [...paid.stash, made] };
    }, `Made a ${ITEMS[input.kind].name.toLowerCase()}.`);
  } });
  ctx.game.commands.define<{ zone: Zone }>("deepward.chart", { apply(state, input) {
    const chart = (CHARTS as Record<string, { cost: { items: Partial<Record<ItemKind, number>>; caps: number } }>)[input.zone];
    if (chart === undefined) return;
    updateHome(state, home => {
      if (home.upgrades.mapRoom < 1) throw new Error("Build the map room first.");
      if (home.zones.includes(input.zone)) throw new Error("Already charted.");
      return { ...home, ...pay(home.stash, home.caps, chart.cost), zones: [...home.zones, input.zone] };
    }, `${ZONE_NAME[input.zone]} charted. Doors will open onto it now.`);
  } });
  ctx.game.commands.define("deepward.acknowledgeCaught", { apply(state) {
    const v = viewStore.read(state), runState = runtime(state);
    if (v.mode !== "caught" || runState.save === null || runState.writing) return;
    let home: Home;
    try { home = acknowledgeCaught(v.home); } catch (error) { viewStore.update(state, s => ({ ...s, error: message(error) })); return; }
    const hint = "Back in the burrow. Choose who goes next at the nook, or try again.";
    runState.writing = true;
    void persist(state, home, runOf(state, { mode: "home", run: null, hint, pending: null, player: HOME_SPAWN, facing: Math.PI }), () => {
      teleport(state, HOME_SPAWN, Math.PI); syncPlayer(state, null);
      viewStore.write(state, { ...viewStore.read(state), home, run: null, mode: "home", panel: null, paused: false, error: "", hint });
      resume(state);
    }).catch((error: unknown) => viewStore.update(state, s => ({ ...s, error: message(error) })));
  } });
}

export function registerControls(ctx: GameContext): void {
  registerBurrow(ctx);
  ctx.game.commands.define("deepward.depart", { apply: (state) => { void begin(state); return state; } });
  ctx.game.commands.define("deepward.enter", { apply(state) { enterFromTitle(state); } });
  // The shared menu verbs, so a pad, a test or a proof runs what the menus run.
  ctx.game.commands.define("start", { apply(state) { showMenuPane(state, null); enterFromTitle(state); return state; } });
  ctx.game.commands.define<{ pane: MenuPane | null }>("menu.pane", { apply(state, input) { showMenuPane(state, input.pane); return state; } });
  ctx.game.commands.define<{ action: string; codes: ActionCodes | null }>("settings.rebind", { apply(state, input) { rebindAction(state, input.action, input.codes); return state; } });
  // The pause menu's "Save" and the title's "Continue", as commands a test or a pad can reach.
  ctx.game.commands.define("deepward.saveRecord", { apply(state) { void persistRecord(state).catch(() => { /* the menu shows the error */ }); return state; } });
  ctx.game.commands.define("deepward.continue", { apply(state) { void resumeRecord(state); return state; } });
  if (import.meta.env?.DEV) {
    ctx.game.commands.define("deepward.stage", { apply(state) { void stageMidRun(state); return state; } });
    ctx.game.commands.define("deepward.dev.out", { apply(state) { void stageMidRun(state, 0); return state; } });
    // Dev-only: the room's Cat, a few lengths ahead and crouching, for a capture of its tell.
    ctx.game.commands.define("deepward.dev.cat", { apply(state) {
      void (async () => {
        await stageMidRun(state, 0);
        const v = viewStore.read(state), run = v.run, at = playerAt(state);
        if (run === null || at === null) return;
        const yaw = facingOf(state), spot: Point = [at[0] + Math.sin(yaw + 0.3) * 34, 0, at[2] + Math.cos(yaw + 0.3) * 34];
        const cat = { ...spawnThreat({ key: `${run.room}:dev-cat`, kind: "cat", slot: { id: "dev-cat", kind: "cat", at: spot, minDepth: 0, label: "the cat" } }), mode: "crouch" as const, timer: 60, target: at, facing: yaw + Math.PI };
        viewStore.write(state, { ...v, run: { ...run, threats: [...run.threats, cat] }, danger: 0.9 });
      })();
      return state;
    } });
    ctx.game.commands.define("deepward.dev.extract", { apply(state) { void stageExtraction(state); return state; } });
    ctx.game.commands.define<{ x: number; z: number }>("deepward.dev.stand", { apply(state, input) { teleport(state, [input.x, 0, input.z]); } });
    ctx.game.commands.define<{ template: string }>("deepward.dev.room", { apply(state, input) { void stageRoom(state, input.template); return state; } });
    ctx.game.commands.define<{ stash?: ItemKind[]; caps?: number }>("deepward.dev.seed", { apply(state, input) {
      const v = viewStore.read(state);
      if (v.mode !== "home") return;
      const stash = [...v.home.stash, ...(input.stash ?? []).filter(k => Object.hasOwn(ITEMS, k)).map((kind, i) => rollItem(kind, 1, `seed:${kind}:${i}`, `craft-${v.home.revision + i + 1}:${kind}`))];
      viewStore.write(state, { ...v, home: { ...v.home, stash, caps: v.home.caps + (input.caps ?? 0) } });
    } });
  }
  for (const [name, id] of [["open", "stash"], ["openStash", "stash"], ["openWorkbench", "workbench"], ["openNook", "nook"]] as const) ctx.game.commands.define(`deepward.${name}`, { apply(state) {
    const v = viewStore.read(state);
    if (v.mode === "loading") { void runtime(state).boot.then(() => state.game.commands.run(`deepward.${name}`, {})); return; }
    if (v.mode !== "home") return;
    viewStore.write(state, { ...v, panel: id }); freeze(state);
  } });
  ctx.game.commands.define("crumbInteract", { apply: interact });
  ctx.game.commands.define("crumbPack", { apply: togglePack });
  ctx.game.commands.define("crumbUse", { apply: use });
  ctx.game.commands.define("crumbFling", { apply: fling });
  ctx.game.commands.define("deepward.interact", { apply: interact });
  ctx.game.commands.define("deepward.pack", { apply: togglePack });
  ctx.game.commands.define("deepward.use", { apply: use });
  ctx.game.commands.define("deepward.fling", { apply: fling });
  ctx.game.commands.define("deepward.close", { apply(state) {
    const v = viewStore.read(state);
    viewStore.write(state, { ...v, panel: null, paused: false });
    if (v.mode === "home" || v.mode === "run") resume(state);
  } });
  ctx.game.commands.define<{ paused?: boolean }>("deepward.pause", { apply(state, input) {
    const v = viewStore.read(state);
    if (v.mode !== "home" && v.mode !== "run") return;
    if (v.panel !== null) { state.game.commands.run("deepward.close", {}); return; }
    const paused = input.paused ?? !v.paused;
    viewStore.write(state, { ...v, paused, run: v.run === null ? null : { ...v.run, channel: null } });
    if (paused) freeze(state); else resume(state);
  } });
  ctx.game.commands.define("deepward.retrySave", { apply(state) {
    const v = viewStore.read(state);
    if (v.mode === "saving" && v.pending !== null) finish(state, v.pending.kind, v.pending.reason, v.pending.via);
  } });
  ctx.game.commands.define<{ uid: string; x?: number; y?: number; rotate?: boolean }>("deepward.packMove", { apply(state, input) {
    const v = viewStore.read(state), run = v.run;
    if (v.panel !== "pack" || run === null || v.mode !== "run") return;
    const item = run.pack.find(i => i.id === input.uid);
    if (item === undefined) return;
    const next: PackedItem = { ...item, x: input.x ?? item.x, y: input.y ?? item.y, rotated: input.rotate === true ? !item.rotated : item.rotated };
    if (!Number.isInteger(next.x) || !Number.isInteger(next.y) || !fits(run.pack, next, run.packW, run.packH)) { state.game.notices.push({ text: "It won't fit that way.", tone: "deny" }); return; }
    viewStore.write(state, { ...v, run: { ...run, pack: run.pack.map(i => i.id === next.id ? next : i) } });
  } });
  ctx.game.commands.define<{ uid: string }>("deepward.drop", { apply(state, input) {
    const v = viewStore.read(state), run = v.run, at = playerAt(state);
    if (run === null || v.mode !== "run" || at === null) return;
    const item = run.pack.find(i => i.id === input.uid);
    if (item === undefined) return;
    const { x: _x, y: _y, rotated: _r, ...plain } = item;
    const def = defOf(item);
    viewStore.write(state, { ...v, run: { ...run, pack: run.pack.filter(i => i.id !== input.uid), dropped: [...run.dropped, { id: `drop:${item.id}`, item: plain, at: [at[0], 0, at[2]], room: run.room }] },
      hint: `${def.name} set down. It stays in this room${def.bulky === true ? "; the thump was loud" : ""}. Watch for the Roomba.` });
    if (def.bulky === true) runtime(state).pebble = [at[0], 0, at[2]];
  } });
}

// ---------------------------------------------------------------- boot, title and records
export function initialize(ctx: GameContext): void {
  registerControls(ctx);
  ctx.game.audio.loop("bed", "bed");
  ctx.game.audio.setLoop("bed", { gain: BED_GAIN });
  runtime(ctx).boot = boot(ctx);
}
/**
 * The browser's storage; or, where there is none (a headless run), one in-memory store per host save
 * backend, so a restarted session on the same host saves finds the burrow it left and a new host
 * starts empty.
 */
const memoryStores = new WeakMap<object, Map<string, string>>();
const loose = new Map<string, string>();
function storageOf(ctx: GameContext): StoragePort {
  if (typeof localStorage !== "undefined") return localStorage;
  const host = ctx.game.save?.backend;
  let store = host === undefined ? loose : memoryStores.get(host);
  if (store === undefined && host !== undefined) { store = new Map(); memoryStores.set(host, store); }
  const map = store ?? loose;
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value); }, removeItem: key => { map.delete(key); } };
}
async function boot(ctx: GameContext): Promise<void> {
  try {
    const state = runtime(ctx);
    let restored: RunSnapshot | null = null;
    const save = openRecord(storageOf(ctx), { snapshot: () => snapshotRun(ctx), restore: next => { restored = next as RunSnapshot | null; } });
    await save.load();
    state.save = save;
    state.ready = true;
    holdAtHome(ctx, save, validRun(restored) ? restored : null);
  } catch (error) {
    viewStore.update(ctx, v => ({ ...v, mode: "blocked", error: message(error), run: null, panel: null }));
    freeze(ctx);
  }
}
/** Put the loaded burrow on screen and leave a run in the record for Continue. */
function holdAtHome(ctx: GameContext, save: RecordSession, record: RunSnapshot | null): void {
  const home = save.home;
  const recovered = record === null || record.run === null ? recoverInterrupted(home) : home;
  if (recovered !== home) void save.commit(recovered).catch(() => { /* the next departure retries */ });
  viewStore.write(ctx, { ...viewStore.read(ctx), home: recovered, mode: recovered.caughtPending ? "caught" : "home", run: null, panel: null, paused: false, pending: null, error: "", hint: recovered.last?.reason ?? viewStore.read(ctx).hint });
  teleport(ctx, HOME_SPAWN, Math.PI); syncPlayer(ctx, null);
  if (recovered.caughtPending) freeze(ctx); else openBurrowTitle(ctx);
}
export async function resumeRecord(ctx: GameContext): Promise<void> {
  const save = runtime(ctx).save;
  if (save === null) return;
  const snap = save.restoredRun;
  await applyRecord(ctx, save, validRun(snap) ? snap : null);
  const mode = viewStore.read(ctx).mode;
  if (mode === "home" || mode === "run") enterFromTitle(ctx);
}
async function applyRecord(ctx: GameContext, save: RecordSession, record: RunSnapshot | null): Promise<void> {
  const home = save.home;
  if (record === null || record.run === null) {
    const recovered = recoverInterrupted(home);
    if (recovered !== home) await save.commit(recovered);
    viewStore.write(ctx, { ...viewStore.read(ctx), home: recovered, mode: recovered.caughtPending ? "caught" : "home", run: null, panel: null, paused: false, pending: null, error: "", hint: recovered.last?.reason ?? viewStore.read(ctx).hint });
    teleport(ctx, HOME_SPAWN, Math.PI); syncPlayer(ctx, null);
    openBurrowTitle(ctx);
    return;
  }
  const run = record.run;
  viewStore.write(ctx, { ...viewStore.read(ctx), home, mode: record.mode, run, panel: null, paused: false, error: "", pending: record.pending, hint: record.hint });
  const plan = roomOf(run);
  teleport(ctx, record.player ?? arrivalOf(plan, null).at, record.facing);
  syncPlayer(ctx, run);
  if (record.mode === "saving") freeze(ctx); else resume(ctx);
}
export function openBurrowTitle(ctx: GameContext): void {
  openTitle(ctx);
  ctx.game.audio.setLoop("bed", { gain: 0 });
  ungrab();
}
export function enterFromTitle(ctx: GameContext): void {
  const v = viewStore.read(ctx);
  if (v.mode === "loading") { void runtime(ctx).boot.then(() => enterFromTitle(ctx)); return; }
  if (v.mode === "blocked" || v.mode === "caught") return;
  resume(ctx);
}
export function recordOf(ctx: GameContext): RecordSession | null { return runtime(ctx).save; }
export async function persistRecord(ctx: GameContext): Promise<void> {
  const state = runtime(ctx);
  if (state.save === null) throw new Error("Persistent storage unavailable");
  state.writing = true;
  await persist(ctx, viewStore.read(ctx).home, snapshotRun(ctx));
}
export async function loadRecordSlot(ctx: GameContext, slot: string): Promise<void> {
  const state = runtime(ctx);
  if (state.save === null) return;
  await state.save.switchSlot(slot);
  await resumeRecord(ctx);
}
export async function beginRecordSlot(ctx: GameContext, slot: string, replace = false): Promise<void> {
  const state = runtime(ctx);
  if (state.save === null) return;
  if (replace) await state.save.deleteSlot(slot);
  await state.save.switchSlot(slot);
  await applyRecord(ctx, state.save, null);
  enterFromTitle(ctx);
}
export async function withdrawToTitle(ctx: GameContext): Promise<void> {
  await persistRecord(ctx);
  openBurrowTitle(ctx);
}
export function seatPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn("little", { id: ctx.player.userId, position: HOME_SPAWN, rotationY: Math.PI, role: "player" });
  syncPlayer(ctx, null);
  openBurrowTitle(ctx);
  if (runtime(ctx).ready && (viewStore.read(ctx).mode === "blocked" || viewStore.read(ctx).mode === "caught")) freeze(ctx);
}
export function storageChanged(ctx: GameContext): void {
  try { if (runtime(ctx).save?.isCurrent() !== false) return; } catch { /* inaccessible storage also stops play */ }
  viewStore.update(ctx, s => ({ ...s, mode: "blocked", error: "The burrow changed in another window. Reload to use its saved state." }));
  freeze(ctx);
}

// ---------------------------------------------------------------- dev staging
/** Dev-only: a real departure, then three real searches through the same channel a player holds, so a capture lands mid-run with a loaded pack. */
export async function stageMidRun(ctx: GameContext, finds = 3): Promise<void> {
  await runtime(ctx).boot;
  if (viewStore.read(ctx).mode !== "run") {
    if (viewStore.read(ctx).mode !== "home" || runtime(ctx).save === null) return;
    teleport(ctx, DEPART.at); resume(ctx);
    await begin(ctx);
    if (viewStore.read(ctx).mode !== "run") return;
  }
  for (let n = 0; n < finds; n++) {
    const run = viewStore.read(ctx).run;
    if (run === null) return;
    const next = roomOf(run).loot.find(l => l.kind !== "toybox" && !run.taken.includes(l.key) && canCarry(run.pack, peekLoot(run, l), run.capacity, LITTLES[run.little]).ok && pack(run, peekLoot(run, l)) !== null);
    if (next === undefined) break;
    teleport(ctx, [next.spot.at[0] + 0.6, 0, next.spot.at[2] + 0.6]);
    interact(ctx);
    for (let t = 0; t < 2.4; t += 0.1) tickControls(ctx, 0.1);
  }
  standForCapture(ctx);
}
/** Dev-only: back at the room's entry, looking into it, with play running (a capture's framing). */
function standForCapture(ctx: GameContext): void {
  const run = viewStore.read(ctx).run;
  if (run === null) return;
  const arrival = arrivalOf(roomOf(run), null);
  teleport(ctx, arrival.at, arrival.facing);
  resume(ctx);
}
/** Dev-only: a look capture's vantage, the walkable spot furthest from the room's centre, looking across it. */
function standForOverview(ctx: GameContext): void {
  const run = viewStore.read(ctx).run;
  if (run === null) return;
  const t = roomOf(run).template, a = t.area;
  // Frame the room, not the nearest giant prop: stand in the open and look along the spot and
  // heading whose fan of sight lines runs furthest before it meets a solid.
  const sight = [...eyeLevel(t), ...t.models.filter(m => m.at[1] < 3).map(m => ({ x: m.at[0], z: m.at[2], w: m.size * 0.7, d: m.size * 0.7 }))], hunters = run.threats.filter(s => s.kind === "cat" || s.kind === "dog" || s.kind === "kid").map(s => ({ at: s.at, room: s.kind === "dog" ? 40 : s.kind === "cat" ? 28 : 20 }));
  const clear = (x: number, z: number) => walkable(t, x, z, 0.4) && !sight.some(r => inside(x, z, r, 0.4)) && hunters.every(h => Math.hypot(h.at[0] - x, h.at[2] - z) > h.room / 3);
  const open = (x: number, z: number, yaw: number) => {
    let n = 0;
    while (n < 80 && clear(x + Math.sin(yaw) * n, z + Math.cos(yaw) * n)) n += 1;
    return n;
  };
  let best: Point = [a.x, 0, a.z], bestYaw = 0, bestScore = -Infinity;
  for (let i = 0; i <= 16; i++) for (let j = 0; j <= 16; j++) {
    const x = a.x - a.w / 2 + 2 + (a.w - 4) * i / 16, z = a.z - a.d / 2 + 2 + (a.d - 4) * j / 16;
    if (!walkable(t, x, z, 2.5) || !clear(x, z)) continue;
    const crowd = hunters.reduce((sum, h) => sum + Math.max(0, h.room - Math.hypot(h.at[0] - x, h.at[2] - z)) * 6, 0);
    const centre = Math.atan2(a.x - x, a.z - z);
    // Look across the room, within a turn of its middle, along the clearest vista.
    for (const swing of [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]) {
      const yaw = centre + swing;
      let least = Infinity, sum = 0;
      for (const fan of [-1, -0.66, -0.33, 0, 0.33, 0.66, 1]) { const n = Math.min(50, open(x, z, yaw + fan)); least = Math.min(least, n); sum += n; }
      const score = least * 3 + sum / 7 - Math.abs(swing) * 4 - crowd;
      if (score > bestScore) { bestScore = score; best = [x, 0, z]; bestYaw = yaw; }
    }
  }
  teleport(ctx, best, bestYaw);
  resume(ctx);
}
/** Dev-only: the mid-run stage, then home through the crack, so a capture lands on the night report. */
export async function stageExtraction(ctx: GameContext): Promise<void> {
  await stageMidRun(ctx);
  const run = viewStore.read(ctx).run;
  if (run === null) return;
  const crack = roomOf(run).exits.find(e => e.kind === "crack");
  if (crack === undefined) return;
  teleport(ctx, crack.at);
  interact(ctx);
  for (let t = 0; t < 2; t += 0.1) tickControls(ctx, 0.1);
  await whenWritten(ctx);
}
/** Dev-only: depart, then stand in a run room built from `template`, for look captures. */
export async function stageRoom(ctx: GameContext, template: string): Promise<void> {
  await runtime(ctx).boot;
  const v = viewStore.read(ctx);
  if (v.mode === "home") {
    viewStore.write(ctx, { ...v, home: { ...v.home, zones: ["kitchen", "living", "kidroom", "garage", "attic"] } });
    teleport(ctx, DEPART.at); resume(ctx);
    await begin(ctx);
  }
  const run = viewStore.read(ctx).run;
  if (run === null) return;
  // Walk the house breadth-first until a door leads to the asked-for template.
  const queue = [run.room];
  for (let i = 0; i < 400 && queue.length > 0; i++) {
    const path = queue.shift()!;
    const plan = planRoom(runSeedOf(run), path);
    if (plan.template.id === template) {
      enterRoom(ctx, viewStore.read(ctx).run!, path, null);
      // A look capture shows the room's hunters at rest: the Cat grooming, the rest holding off.
      const v2 = viewStore.read(ctx);
      if (v2.run !== null) viewStore.write(ctx, { ...v2, run: { ...v2.run, threats: v2.run.threats.map(s => s.kind === "cat" ? { ...s, mode: "groom" as const, timer: 30, cooldown: 30 } : { ...s, cooldown: 30 }) } });
      standForOverview(ctx);
      return;
    }
    queue.push(...plan.forwards.map(f => f.to));
  }
}

// ---------------------------------------------------------------- the tick
export function tickControls(ctx: GameContext, dt: number): void {
  const v = viewStore.read(ctx);
  if (v.paused || v.mode === "saving" || v.mode === "blocked" || !(dt > 0)) return;
  if (v.mode === "home" || v.mode === "run") recordProfile.playtime += dt;
  if (v.mode !== "run" || v.run === null) return;
  const at = playerAt(ctx), state = runtime(ctx);
  if (at === null) return;
  const plan = roomOf(v.run), template = plan.template, little = LITTLES[v.run.little];
  const moved = state.last === null ? 0 : groundDistance(at, state.last);
  state.last = at;
  const speed = moved / dt;
  const sneaking = ctx.input.isDown("crumbSneak");
  // Footsteps: a patter you can hear yourself make, softer and slower when sneaking.
  state.stride += moved;
  if (state.stride > (sneaking ? 3.2 : 2.1)) { state.stride = 0; ctx.game.audio.play(sneaking ? "stepSoft" : twoHanded(v.run) ? "stepHeavy" : "step"); }
  // A heartbeat when a hunter is close to noticing you.
  state.heart += dt;
  if (v.danger > 0.6 && state.heart > 1.6 - v.danger) { state.heart = 0; ctx.game.audio.play("heart"); }
  // Sound: footsteps by pace, rummaging, a two-handed load thumping along.
  let noise = speed < 0.3 ? 0 : speed > 5.6 ? 18 : sneaking ? 3 : 9;
  if (noise > 0 && twoHanded(v.run)) noise *= 1.3;
  // A cat's bell in the pack jingles with every step.
  if (noise > 0) for (const item of v.run.pack) noise *= defOf(item).noisy ?? 1;
  if (v.run.channel !== null) noise = Math.max(noise, v.run.channel.kind === "disarm" && !little.trapSense ? 12 : v.run.channel.kind === "search" || v.run.channel.kind === "toybox" ? 6 : 2);
  noise *= little.noise * NIGHTS[nightOf(v.run.seed)].noise;
  const lit = lightsOn(v.run, plan), torch = hasGear(v.run, "torch");
  const visibility = (lit ? 1.8 : template.dark ? (torch ? 1.1 : 0.6) : 1) * NIGHTS[nightOf(v.run.seed)].light * (torch ? 1.5 : 1) * (sneaking ? 0.6 : 1) * (isDawn(v.run) ? 1.3 : 1) / little.stillness;
  const covered = inCover(template, at);
  // A restless kid sits up and looks around now and then; at dawn every kid is awake.
  const restless = isDawn(v.run) || hashUnit(`${v.run.seed}|${v.run.room}|restless`) < 0.45 + plan.depth * 0.08;
  const pebble = state.pebble; state.pebble = null;
  const ticked = tickThreats(template, v.run.threats, { at, noise, visibility, covered, torch, clock: v.run.elapsed, restless, pebble }, dt);
  let run: Run = age({ ...v.run, threats: ticked.states }, dt);
  let hint = v.hint;
  run = applyEvents(ctx, run, ticked.events, at, (text) => { hint = text; });
  // The channel holds while you hold still; a hit or a step breaks it.
  if (run.channel !== null) {
    const hurt = run.health < v.run.health;
    if (hurt || groundDistance(at, run.channel.anchor) > 0.8) { run = { ...run, channel: null }; hint = hurt ? "Knocked out of it!" : "Stopped."; }
    else {
      const remaining = run.channel.remaining - dt;
      if (remaining > 0) run = { ...run, channel: { ...run.channel, remaining } };
      else {
        viewStore.write(ctx, { ...viewStore.read(ctx), run, hint });
        run = completeChannel(ctx, run);
        hint = viewStore.read(ctx).hint;
      }
    }
  }
  // Dawn warnings, then the family.
  if (!isDawn(v.run) && isDawn(run)) { ctx.game.notices.push({ text: "Dawn. The family is stirring: every light comes on. Get out.", tone: "deny" }); ctx.game.audio.play("dawn"); }
  const nearest = Math.min(99, ...run.threats.filter(t => t.mode !== "dead" && t.mode !== "sprung" && t.mode !== "asleep" && t.mode !== "dock" && t.kind !== "trap").map(t => groundDistance(t.at, at)));
  const hunting = run.threats.some(t => t.mode === "stalk" || t.mode === "crouch" || t.mode === "awake" || t.mode === "looking" || t.mode === "bite");
  viewStore.write(ctx, { ...viewStore.read(ctx), run, hint, noise, sneaking, danger: hunting ? Math.max(0.35, 1 - nearest / 30) : Math.max(0, 0.6 - nearest / 50) });
  syncPlayer(ctx, run);
  const pending = pendingFinish.get(ctx);
  if (pending !== undefined) { pendingFinish.delete(ctx); finish(ctx, pending.kind, pending.reason, pending.via); return; }
  if (run.health <= 0) { finish(ctx, "lost", run.cause || "Something in the house got you."); return; }
  if (familyUp(run)) { finish(ctx, "lost", "Morning. The family found you in the open, and you ran for it with nothing."); return; }
  state.checkpoint += dt;
  if (state.checkpoint > 8) { state.checkpoint = 0; void checkpoint(ctx).catch(() => { /* retried */ }); }
}

function applyEvents(ctx: GameContext, run: Run, events: readonly ThreatEvent[], at: Point, say: (text: string) => void): Run {
  let next = run;
  for (const event of events) {
    if (event.type === "hurt") {
      let damage = event.damage;
      if (next.shield && hasGear(next, "shield") && (event.by === "cat" || event.by === "spider" || event.by === "dog")) {
        next = { ...next, shield: false }; say("Your button shield rang like a bell and took the blow."); ctx.game.audio.play("clang"); continue;
      }
      if (hasGear(next, "helmet")) damage = Math.round(damage / 2);
      next = { ...next, health: Math.max(0, next.health - damage), hurt: 0.45, channel: null, cause: event.text };
      say(`${event.text} (−${damage})`);
      ctx.game.audio.play("hurt");
      if (event.by === "roomba" && next.pack.length > 0) {
        const lost = next.pack[Math.floor((next.elapsed * 7.31) % next.pack.length)]!;
        next = { ...next, pack: next.pack.filter(i => i.id !== lost.id) };
        ctx.game.notices.push({ text: `The Roomba swallowed your ${defOf(lost).name.toLowerCase()}.`, tone: "deny" });
      }
    } else if (event.type === "vacuum") {
      const before = next.dropped.length;
      next = { ...next, dropped: next.dropped.filter(d => d.room !== next.room || groundDistance(d.at, event.at) > 8) };
      if (next.dropped.length < before) ctx.game.notices.push({ text: "The Roomba hoovered up what you left on the floor.", tone: "deny" });
    } else if (event.type === "grab") {
      const took: Item[] = next.pack.map(({ x: _x, y: _y, rotated: _r, ...item }) => item);
      const entry = roomOf(next).entry.slot;
      next = { ...next, pack: [], kidTook: [...next.kidTook, ...took], channel: null };
      teleport(ctx, entry.at, faceToward(entry.at, { x: roomOf(next).template.area.x, z: roomOf(next).template.area.z }));
      say(took.length > 0 ? `The kid scooped you up, giggled, and kept your pack (${took.length} things) for the treasure box. You were set down by the door.` : "The kid scooped you up, found nothing in your pack, and set you down by the door.");
      ctx.game.notices.push({ text: "Caught by the kid! Your pack went in the toy box.", tone: "deny" });
      ctx.game.audio.play("giggle");
    } else if (event.type === "bark") {
      next = { ...next, elapsed: next.elapsed + 3 };
      say("WOOF! The dog is barking. Every cat in the room heard, and the family stirs (the night runs faster).");
    } else if (event.type === "cue") ctx.game.audio.play(event.sound);
  }
  void at;
  return next;
}

/** Read-only numbers for the capture bridge and the suite probes. */
export function captureProbe(ctx: GameContext) {
  const v = viewStore.read(ctx), at = playerAt(ctx), run = v.run;
  const load = run === null ? { mass: 0, remaining: 0, capacity: 0 } : loadOf(run.pack, run.capacity, LITTLES[run.little]);
  const plan = run === null ? null : roomOf(run);
  return {
    x: at?.[0] ?? 0, z: at?.[2] ?? 0,
    inRun: v.mode === "run" ? 1 : 0, caught: v.mode === "caught" ? 1 : 0, home: v.mode === "home" ? 1 : 0,
    /** A return being written: the run is over, the burrow not yet updated. */
    returning: v.mode === "saving" ? 1 : 0,
    health: run?.health ?? 100, elapsed: run?.elapsed ?? 0, dawn: run !== null && isDawn(run) ? 1 : 0,
    depth: plan?.depth ?? 0, rooms: run?.visited.length ?? 0, deepest: run?.deepest ?? 0,
    carried: run?.pack.length ?? 0, packMass: load.mass, packRoom: load.remaining,
    stash: v.home.stash.length, caps: v.home.caps, stashValue: v.home.stash.reduce((sum, item) => sum + itemValue(item), 0),
    extractions: v.home.extractions, caughtCount: v.home.caught, sets: v.home.sets.length, kidsBox: v.home.kidsBox.length,
    littles: littlesOf(v.home).length, zones: v.home.zones.length,
    upgrades: Object.values(v.home.upgrades).reduce((a, b) => a + b, 0),
    threats: run?.threats.filter(t => t.mode !== "dead" && t.mode !== "sprung").length ?? 0,
    hunting: run?.threats.filter(t => t.mode === "stalk" || t.mode === "crouch" || t.mode === "pounce" || t.mode === "awake").length ?? 0,
    panel: v.panel === null ? 0 : ["stash", "workbench", "nook", "pack"].indexOf(v.panel) + 1,
    noise: Math.round(v.noise), refusals: runtime(ctx).refusals,
    seedHash: run === null ? 0 : hashUnit(run.seed) * 1e6 | 0, roomHash: run === null ? 0 : hashUnit(run.room) * 1e6 | 0,
    goal: goalStep(v.home),
    phase: ["menu", "playing", "paused", "ended"].indexOf(gamePhase(ctx)),
    menuPane: ["controls", "settings", "credits"].indexOf(menuPane(ctx) ?? "") + 1,
    ...guideOf(ctx, v, at),
    larder: v.home.upgrades.larder, little: ["pip", "bolt", "wren", "tuck", "dot", "fennel"].indexOf(v.home.little),
    prompt: (() => { const t = nearby(ctx); return t === null ? 0 : ["depart", "stash", "workbench", "nook", "exit", "forward", "back", "loot", "toybox", "disarm", "pickup"].indexOf(t.act.type) + 1; })(),
  };
}
/**
 * Where the game's own guidance points right now: the burrow's goal card names a station, and out in
 * the house the prompts lead to the next find, then a door on, then the way home. A first-run
 * Little following it meets every core verb once.
 */
export function guideOf(ctx: GameContext, v: View, at: Point | null): { guideX: number; guideZ: number; guideDist: number } {
  const none = { guideX: 0, guideZ: 0, guideDist: -1 };
  if (at === null) return none;
  let target: Point | null = null;
  if (v.mode === "home") {
    const step = goalStep(v.home);
    target = step === 0 ? DEPART.at : step === 1 && v.home.upgrades.larder === 0 ? WORKBENCH.at : step <= 2 ? NOOK.at : DEPART.at;
  } else if (v.mode === "run" && v.run !== null) {
    const run = v.run, plan = roomOf(run);
    // Until the larder is built, the guidance favours food: that is what the burrow's next goal costs.
    const wantsFood = v.home.upgrades.larder === 0;
    const score = (l: (typeof plan.loot)[number]) => groundDistance(at, l.spot.at) + (wantsFood && l.kind !== "toybox" && ITEMS[l.kind].category !== "food" ? 100 : 0);
    const find = plan.loot.filter(l => l.kind !== "toybox" && !run.taken.includes(l.key)).sort((a, b) => score(a) - score(b))[0];
    const free = loadOf(run.pack, run.capacity, LITTLES[run.little]).remaining > 1.5;
    if (find !== undefined && free && run.pack.length < 3) target = find.spot.at;
    else if (run.deepest === 0 && plan.forwards[0] !== undefined) target = plan.forwards[0].slot.at;
    else if (plan.exits[0] !== undefined) target = plan.exits[0].at;
    else target = plan.entry.slot.at;
  }
  if (target === null) return none;
  return { guideX: target[0], guideZ: target[2], guideDist: Math.round(groundDistance(at, target) * 100) / 100 };
}
/** The movement rule for the current room: walkable floor, slowed by load, web and sneaking. */
export function moveRule(ctx: GameContext, current: Point, next: Point): Point {
  const v = viewStore.read(ctx);
  if (v.paused || v.panel !== null || (v.mode !== "home" && v.mode !== "run")) return current;
  const template = templateOf(v);
  let drag = 1;
  if (v.run !== null && v.mode === "run") {
    const little = LITTLES[v.run.little];
    drag *= little.speed;
    if (twoHanded(v.run)) drag *= 0.62;
    const load = loadOf(v.run.pack, v.run.capacity, little);
    if (load.mass > load.capacity * 0.8) drag *= 0.8;
    drag *= webDrag(v.run.threats, current);
    if (ctx.input.isDown("crumbSneak")) drag *= 0.5;
  }
  const steps = Math.max(1, Math.ceil(groundDistance(current, next) / 0.15));
  let x = current[0], z = current[2];
  const dx = (next[0] - x) / steps * drag, dz = (next[2] - z) / steps * drag;
  for (let n = 0; n < steps; n++) {
    if (walkable(template, x + dx, z + dz)) { x += dx; z += dz; }
    else if (walkable(template, x + dx, z)) x += dx;
    else if (walkable(template, x, z + dz)) z += dz;
  }
  return [x, 0, z];
}
export const canSprint = (ctx: GameContext): boolean => { const v = viewStore.read(ctx); return v.run === null || !twoHanded(v.run); };
