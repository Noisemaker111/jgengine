import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityDiedEvent } from "@jgengine/core/game/events";
import { defineStore } from "@jgengine/core/store/defineStore";
import { gamePhase, setGamePhase } from "@jgengine/core/game/gamePhase";
import { perContext } from "@jgengine/core/runtime/perContext";
import { createSessionLoop, installSessionProbe, type SessionLoop, type SessionLoopState } from "@jgengine/core/run/sessionLoop";
import { rememberHome } from "./entities/enemies/ai";
import { reservePhase } from "./handroll";
import { activeCharacter } from "./characters";
import { earn } from "./cash";

/** Fixed authored location; independent of capture-time spawn overrides. */
export const RELAY = { x: -505, z: 581, radius: 22, seconds: 150, uploadSeconds: 6 };
const WAVES = [["ripper_pup", "ripper_pup"], ["bruiser_brat", "bruiser_brat"], ["husk", "ripper_pup", "bruiser_brat"]] as const;
export interface RelayState {
  phase: "idle" | "defend" | "upload" | "won" | "lost";
  /** Published from the session loop: the wave the contract is on. */
  wave: number;
  enemies: readonly string[];
  remaining: number;
  /** Published from the session loop: the signal this wave has banked. */
  upload: number;
  rewarded: boolean;
  reason: string;
  /** Optional so pre-uplink saves restore the clear-first strategy. */
  overclock?: boolean;
  /** The contract's result once its last wave closed, cleared when the player dismisses the report. */
  outcome?: "won" | "lost";
  /** The loop's own state, so a reload resumes the same wave with the signal it had banked. */
  session?: SessionLoopState;
}
export const relayStore = defineStore<RelayState>("scrap.deadAir", () => ({ phase: "idle", wave: 0, enemies: [], remaining: RELAY.seconds, upload: 0, rewarded: false, reason: "" }));

/**
 * The contract as a session loop: each ambush is a session, it carries the signal it banks, and its
 * boundary settles that signal. The loop owns which wave is live, how many have closed and what the
 * wave carries; the relay store republishes all three for the HUD and the save.
 */
const relaySessions = perContext((ctx: GameContext) => {
  const loop: SessionLoop<never, void, { signal: number }> = createSessionLoop<never, void, { signal: number }>({
    kind: "wave",
    settle: ({ carried }) => ({ signal: carried }),
  });
  installSessionProbe(loop);
  return { loop };
});

export function relayLoop(ctx: GameContext): SessionLoop<never, void, { signal: number }> {
  const slot = relaySessions(ctx);
  // The world snapshot is the relay's storage. A save that names a live wave is adopted so the
  // contract resumes; a dismissed contract reads "idle" and is left alone, so a replay starts its
  // own first wave instead of inheriting the last one's session number.
  const stored = relayStore.peek(ctx);
  if (slot.loop.phase() === "idle" && stored?.session != null && stored.phase !== "idle") slot.loop.restore(stored.session);
  return slot.loop;
}

/** Write the loop's phase, wave and carried signal into the store; nothing else decides them. */
function publishRelay(ctx: GameContext, current: RelayState): void {
  const loop = relayLoop(ctx);
  const open = loop.phase() === "open";
  const phase: RelayState["phase"] = open
    ? current.enemies.length === 0 ? "upload" : "defend"
    : current.outcome ?? "idle";
  relayStore.write(ctx, { ...current, phase, wave: loop.snapshot().session, upload: loop.carried(), session: loop.snapshot() });
}

export function relayDistance(ctx: GameContext): number {
  const p = ctx.scene.entity.get(ctx.player.userId)?.position;
  return p === undefined ? Infinity : Math.hypot(p[0] - RELAY.x, p[2] - RELAY.z);
}

/**
 * Dev-only: stand at the copper ring and open the contract's first ambush for a capture or a flow.
 * `mode: "upload"` clears the ambush it just spawned, so the wave's own upload boundary is reachable
 * without a firefight the script cannot aim.
 */
export function stageRelay(ctx: GameContext, mode: "ambush" | "upload" = "ambush"): void {
  relayLoop(ctx).restore({ session: 0, closed: 0, carried: 0, optionId: null });
  spawnWave(ctx, relayStore.read(ctx), 1);
  if (mode === "upload") {
    const state = relayStore.read(ctx);
    for (const id of state.enemies) ctx.scene.entity.despawn(id);
    publishRelay(ctx, { ...state, enemies: [] });
  }
  // The player may not be spawned yet when a capture state runs, so the pose is best-effort.
  if (ctx.scene.entity.get(ctx.player.userId) !== null) {
    ctx.scene.entity.setPose(ctx.player.userId, { position: [RELAY.x, ctx.world.groundHeightAt(RELAY.x, RELAY.z), RELAY.z] });
  }
}

function spawnWave(ctx: GameContext, state: RelayState, wave: number): void {
  const enemies = WAVES[wave - 1]!.map((catalogId, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 0.7;
    const x = RELAY.x + Math.cos(angle) * 11;
    const z = RELAY.z + Math.sin(angle) * 11;
    const position: [number, number, number] = [x, ctx.world.groundHeightAt(x, z), z];
    const id = `dead_air_${wave}_${index}`;
    ctx.scene.entity.spawn(catalogId, { id, position });
    rememberHome(ctx, id, position);
    return id;
  });
  relayLoop(ctx).start();
  publishRelay(ctx, { ...state, enemies, outcome: undefined, reason: "" });
  ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: `DEAD AIR — AMBUSH ${wave}/3`, kind: "warn" });
}

export function relayEnemyDied(ctx: GameContext, event: EntityDiedEvent): void {
  const state = relayStore.read(ctx);
  if (state.phase !== "defend" || !state.enemies.includes(event.instanceId)) return;
  publishRelay(ctx, { ...state, enemies: state.enemies.filter((id) => id !== event.instanceId) });
}

function finish(ctx: GameContext, state: RelayState, won: boolean, reason: string): void {
  for (const id of state.enemies) ctx.scene.entity.despawn(id);
  // A contract that fails mid-wave closes that wave at its boundary; a won one already closed on upload.
  const loop = relayLoop(ctx);
  if (loop.phase() === "open") loop.settle();
  if (won && !state.rewarded) {
    earn(ctx, "cash", 120, "relay-reward", "dead-air");
    earn(ctx, "cores", 3, "relay-reward", "dead-air");
  }
  publishRelay(ctx, { ...state, enemies: [], rewarded: state.rewarded || won, reason, outcome: won ? "won" : "lost" });
  setGamePhase(ctx, "ended");
  ctx.time.pause();
  if (typeof document !== "undefined") document.exitPointerLock?.();
  // Results are real saved state; reloading cannot award the same contract twice.
  void ctx.game.save?.checkpoint();
}

export function tickRelay(ctx: GameContext, dt: number): void {
  if (dt <= 0 || gamePhase(ctx) !== "playing") return;
  const state = relayStore.read(ctx);
  if (state.phase !== "defend" && state.phase !== "upload") return;
  if (reservePhase(ctx) !== "alive") { finish(ctx, state, false, "Your chassis went down before the relay could lock."); return; }
  const loop = relayLoop(ctx);
  const remaining = Math.max(0, state.remaining - dt);
  if (remaining === 0) { finish(ctx, state, false, "The carrier window closed. Clear the ambushes and stay inside the copper ring to upload."); return; }
  const inside = relayDistance(ctx) <= RELAY.radius;
  const shield = ctx.scene.entity.stats.get(ctx.player.userId, "shield")?.current ?? 0;
  const banked = loop.carried();
  const room = Math.max(0, RELAY.uploadSeconds - banked);
  // Fighting remains mandatory. Overclock buys the later upload time with the
  // same protective resource enemies damage; retreating stops transmission.
  const channelSeconds = state.phase === "defend" && state.overclock && inside
    ? Math.min(dt, Math.max(0, (shield - 10) / 6), room) : 0;
  if (channelSeconds > 0) ctx.scene.entity.stats.delta(ctx.player.userId, "shield", -channelSeconds * 6);
  const gained = channelSeconds + (state.phase === "upload" && inside ? Math.min(dt, room) : 0);
  if (gained > 0) loop.carry(gained);
  const upload = loop.carried();
  const next = { ...state, remaining };
  if (state.phase === "upload" && inside && upload >= RELAY.uploadSeconds) {
    // The wave's boundary: its banked signal settles, then the next ambush opens or the contract pays.
    loop.settle();
    if (loop.snapshot().session === WAVES.length) finish(ctx, next, true, "Coretown hears you. The salvage carrier is back on the air.");
    else spawnWave(ctx, next, state.wave + 1);
  } else publishRelay(ctx, next);
}

export function registerRelay(ctx: GameContext, reconstruct: (ctx: GameContext) => void): void {
  // Built at boot so the session probe is on the window before the first contract.
  relayLoop(ctx);
  ctx.game.commands.define("relay.overclock", { apply(state: GameContext) {
    const current = relayStore.read(state);
    if (gamePhase(state) !== "playing" || !["defend", "upload"].includes(current.phase)) return;
    publishRelay(state, { ...current, overclock: !current.overclock });
    state.scene.entity.floatText({ instanceId: state.player.userId, text: current.overclock ? "SHIELD RESERVED — CLEAR FIRST" : "OVERCLOCK — SHIELD POWERS UPLINK", kind: "warn" });
  } });
  ctx.game.commands.define("relay.start", { apply(state: GameContext) {
    const current = relayStore.read(state);
    if (gamePhase(state) !== "playing" || activeCharacter() === null || reservePhase(state) !== "alive" || relayDistance(state) > 3.8 || ["defend", "upload"].includes(current.phase)) return;
    // Salvage cartridges supplied by the contract keep a failed attempt recoverable.
    const ammo = state.scene.entity.stats.get(state.player.userId, "ammo_pistol");
    if (ammo !== null && ammo.current < 60) state.scene.entity.stats.delta(state.player.userId, "ammo_pistol", 60 - ammo.current);
    // A contract is three ambushes from its first one: the loop's session is the wave within this
    // contract, so a replay starts counting again instead of numbering across contracts.
    relayLoop(state).restore({ session: 0, closed: 0, carried: 0, optionId: null });
    spawnWave(state, { ...current, remaining: RELAY.seconds, reason: "" }, 1);
    void state.game.save?.checkpoint();
  } });
  ctx.game.commands.define("relay.continue", { apply(state: GameContext) {
    const current = relayStore.read(state);
    if (current.phase !== "won" && current.phase !== "lost") return;
    if (reservePhase(state) !== "alive" || (state.scene.entity.stats.get(state.player.userId, "health")?.current ?? 1) <= 1) reconstruct(state);
    publishRelay(state, { ...current, outcome: undefined, reason: "" });
    setGamePhase(state, "playing");
    state.time.play();
    void state.game.save?.checkpoint();
  } });
}
