import { findEditorMarker } from "@jgengine/core/editor/index";
import {
  applyMissionRewards,
  createMissionRuntime,
  type MissionDef,
  type MissionEvent,
  type MissionRuntimeSnapshot,
  type MissionStatus,
} from "@jgengine/core/mission/mission";
import { missionMarkers } from "@jgengine/core/mission/triggers";
import type { PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { createSessionLoop, installSessionProbe, type SessionLoop, type SessionLoopState } from "@jgengine/core/run/sessionLoop";
import { defineStore } from "@jgengine/core/store/defineStore";
import { editorLayers } from "../../editorLayers";
import { groundCarId, streetPlayOf } from "../streetPlay";
import { bankContraband, failContraband, loadContraband } from "../items/cargoHaul";
import { grantCred } from "../progression/cred";
import { earn, spend } from "../cash";
import { sessionStore, syncSession } from "../session";

/** Authored site positions; the dispatch booth and parcel towers live in `editor.scene.json`. */
function site(id: string): readonly [number, number] {
  const marker = findEditorMarker(editorLayers, id);
  if (marker === undefined) throw new Error(`harbor-heat scene is missing marker "${id}"`);
  return [marker.position.x, marker.position.z];
}

export const DISPATCH = site("courier_dispatch");
export const DELIVERY_ROUTES = [
  { label: "Boardwalk breakfast", recipient: "Mainsail lifeguards", position: site("courier_drop_0"), seconds: 65, payout: 250, hint: "Follow the shore south. Find the coral parcel tower beside the boardwalk." },
  { label: "Plaza night shift", recipient: "Plaza radio crew", position: site("courier_drop_1"), seconds: 95, payout: 400, hint: "Head north to the cross street, then east to the teal parcel tower." },
  { label: "Sunset spare parts", recipient: "Sunset pit crew", position: site("courier_drop_2"), seconds: 110, payout: 500, hint: "Follow Mainsail south, then take the cross street east to the gold parcel tower." },
] as const;

/** The pursuer and the runner the mission tracks by id, whichever body the player is in. */
const PLAYER_ACTOR = "harbor_player";
export const THIEF = "parcel_thief";
/** HHPD tier at which a live courier run is swept: officers working the block, 2 pips. */
export const COURIER_HEAT_TIER = 2;
/** The world fact the mission machine reads for that sweep; the heat slice owns the number. */
const POLICE_TIER_FACT = "police_tier";

function heatSweep() {
  return [{ kind: "fact" as const, fact: POLICE_TIER_FACT, atLeast: COURIER_HEAT_TIER, to: "heat_sweep", message: "HHPD swept the drop while you were hot — the parcel went back to dispatch." }];
}

export interface CourierState {
  route: number;
  remaining: number;
  distance: number;
  heading: number;
  service?: "standard" | "rush";
  condition?: number;
  lastHealth?: number;
  /** Delivery seconds left when the parcel changed hands: what the on-time bonus pays on. */
  handoff?: number;
  /** What the last contract's boundary settled: the receipt the results card shows. */
  receipt?: CourierReceipt | null;
  /** Published from the session loop, never decided here: `open` while a parcel is carried. */
  phase: "idle" | "running" | "won" | "lost";
  /** Deliveries that paid — the career tally the route rotation and the rush gate read. */
  delivered: number;
}
/** One line of a receipt: what it was for and the cash it moved (negative is a charge). */
export interface ReceiptLine {
  label: string;
  amount: number;
}
/** One contract's settlement, as the mission session's `settle` returned it. */
export interface CourierReceipt {
  won: boolean;
  /** Net cash the contract moved: the payout and every extra, less the damage claim and any lost bond. */
  reward: number;
  reason: string | null;
  /** Each line in the order it landed, so the slip shows why the total is what it is. */
  lines: readonly ReceiptLine[];
}
/** What the mission session's boundary hands its `settle`: the route it ran, how it closed and its itemized lines. */
export interface CourierSettlementInput {
  won: boolean;
  route: (typeof DELIVERY_ROUTES)[number];
  reason?: string | undefined;
  settlement: CourierSettlement;
}
export const RUSH_BOND = 60;
/** How hard each service is on its parcel: rush cargo is fragile, a standard box takes half the knocks. */
const FRAGILITY = { standard: 0.5, rush: 1 } as const;
/** Condition a parcel loses each second the runner has it. */
const RUNNER_WEAR = 1.5;
/** Share of the payout a standard client claims back for a parcel at 0% condition. */
const DAMAGE_CLAIM = 0.5;
export function courierDeadline(seconds: number, rush: boolean): number { return rush ? Math.ceil(seconds * 0.35) : seconds; }
/** Wear on a parcel this step: speed above 35 km/h and every hit the courier takes, scaled by how fragile it is. */
export function cargoCondition(condition: number, dt: number, speedKmh: number, healthLost: number, fragility = 1): number {
  const wear = Math.max(0, speedKmh - 35) * Math.max(0, dt) * 0.12 + Math.max(0, healthLost) * 2;
  return Math.max(0, condition - wear * Math.max(0, fragility));
}

/**
 * What a contract settles to. `lines` is the whole story the receipt shows, the bond paid at the booth
 * included; `carried` is what the boundary still has to pay (the mission pays the contract line itself)
 * and `claim` what it still has to charge.
 */
export interface CourierSettlement {
  lines: ReceiptLine[];
  carried: number;
  claim: number;
}

export function courierSettlement(input: { payout: number; rush: boolean; won: boolean; handoff: number; condition: number }): CourierSettlement {
  const c = Math.max(0, Math.min(100, input.condition)) / 100;
  if (!input.won) return { lines: input.rush ? [{ label: "Bond forfeited", amount: -RUSH_BOND }] : [], carried: 0, claim: 0 };
  const lines: ReceiptLine[] = [{ label: "Contract", amount: input.payout }];
  const onTime = Math.floor(Math.max(0, input.handoff) * 2);
  if (onTime > 0) lines.push({ label: "On time", amount: onTime });
  if (input.rush) {
    const premium = Math.floor(input.payout * 0.8 * c);
    const bondBack = Math.floor(RUSH_BOND * c);
    lines.push({ label: "Fragile premium", amount: premium }, { label: "Bond paid", amount: -RUSH_BOND }, { label: "Bond returned", amount: bondBack });
    return { lines, carried: onTime + premium + bondBack, claim: 0 };
  }
  const claim = Math.floor(input.payout * (1 - c) * DAMAGE_CLAIM);
  if (claim > 0) lines.push({ label: "Cargo damage", amount: -claim });
  return { lines, carried: onTime, claim };
}
export const courierStore = defineStore<CourierState>("harbor.courier", () => ({ phase: "idle", route: 0, remaining: 0, delivered: 0, receipt: null, distance: 0, heading: 0 }));

/**
 * The mission session: a contract opens when a parcel is taken, carries the bonus the run earns on
 * top of the contract's payout, and its boundary banks or loses that bonus. The loop owns which
 * mission is live and how many have closed; the courier store republishes both for the HUD.
 */
const courierSessions = perContext((ctx: GameContext) => {
  const loop: SessionLoop<never, CourierSettlementInput, CourierReceipt> = createSessionLoop<never, CourierSettlementInput, CourierReceipt>({
    kind: "mission",
    settle: ({ carried, input }) => settleCourier(ctx, carried, input),
  });
  installSessionProbe(loop);
  return { loop };
});

export function courierLoop(ctx: GameContext): SessionLoop<never, CourierSettlementInput, CourierReceipt> {
  return courierSessions(ctx).loop;
}

/** The loop's state, for the run save section; `restoreCourierLoop` puts a reload back on the same mission. */
export function courierLoopState(ctx: GameContext): SessionLoopState {
  return courierLoop(ctx).snapshot();
}

export function restoreCourierLoop(ctx: GameContext, state: SessionLoopState): void {
  courierLoop(ctx).restore(state);
}

/**
 * The boundary's rule, and the only place a contract pays: a clean delivery banks what the run
 * carried (the time and cargo extras on top of the mission's own payout) and charges the damage
 * claim; a failed one loses it all and the parcel's contraband with it. The contract payout itself
 * is still the mission machine's reward.
 */
function settleCourier(ctx: GameContext, carried: number, input: CourierSettlementInput): CourierReceipt {
  const { lines, claim } = input.settlement;
  const reward = lines.reduce((sum, line) => sum + line.amount, 0);
  if (!input.won) {
    failContraband(ctx);
    ctx.game.feedback.cue("deny", input.reason ?? "The parcel is gone.");
    return { won: false, reward, reason: input.reason ?? null, lines };
  }
  if (carried > 0) earn(ctx, carried, "courier-bonus", input.route.label);
  const charge = Math.min(claim, ctx.game.economy.balance(ctx.player.userId, "cash"));
  if (charge > 0) spend(ctx, charge, "courier-damage", input.route.label);
  grantCred(ctx, 15);
  bankContraband(ctx);
  ctx.game.feedback.cue("objective", `Delivered to ${input.route.recipient} — $${reward}.`);
  return { won: true, reward, reason: null, lines };
}

/** Republish the loop's own phase into the HUD store; nothing else decides whether a mission is live. */
function publishCourier(ctx: GameContext, current: CourierState): void {
  const phase = courierLoop(ctx).phase() === "open" ? "running" : current.receipt == null ? "idle" : current.receipt.won ? "won" : "lost";
  courierStore.write(ctx, { ...current, phase });
}


/** Plain read-model for the HUD — the objective, its timer and its counter, copied off the runtime view. */
export interface CourierObjective {
  title: string;
  label: string;
  remaining: number | null;
  counted: number;
  count: number;
  step: number;
  steps: number;
  status: MissionStatus;
  outcome: string | null;
  reason: string | null;
}
export const courierObjectiveStore = defineStore<CourierObjective | null>("harbor.courier.objective", null);
export const courierMissionStore = defineStore<MissionRuntimeSnapshot | null>("harbor.courier.mission", null);

export function courierMissionId(routeIndex: number, rush: boolean): string {
  return rush ? `courier_${routeIndex}_rush` : `courier_${routeIndex}`;
}

/**
 * One route's contract as mission data: hand the parcel over before the deadline, then run down the
 * runner who grabs it at the drop. The timer, the escape and the cargo-loss fail are the shared
 * mission machine's; only the parcel, the runner and the payout are Harbor Heat's.
 */
function routeMission(route: (typeof DELIVERY_ROUTES)[number], index: number, rush: boolean): MissionDef {
  const failLate = rush ? "cargo_late_rush" : "cargo_late";
  return {
    id: courierMissionId(index, rush),
    title: rush ? `${route.label} — fragile rush` : route.label,
    description: route.hint,
    start: "deliver",
    objectives: [
      {
        id: "deliver",
        kind: "interact",
        actor: PLAYER_ACTOR,
        marker: `courier_drop_${index}`,
        radius: 8,
        label: `Hand the parcel to ${route.recipient}`,
        timeout: courierDeadline(route.seconds, rush),
        onTimeout: failLate,
        failOn: [
          ...heatSweep(),
          ...(rush
            ? [{ kind: "fact" as const, fact: "cargo_condition", atMost: 0, to: "cargo_lost", message: "Rough driving spoiled the cargo." }]
            : []),
        ],
        next: "recover",
      },
      {
        id: "recover",
        kind: "pursue",
        actor: THIEF,
        pursuer: PLAYER_ACTOR,
        distance: 3.5,
        escapeDistance: 26,
        escapeGrace: 4,
        escapeFail: "cargo_lost",
        label: "Catch the runner who grabbed the parcel — alive",
        timeout: 60,
        onTimeout: "cargo_lost",
        failOn: [
          ...heatSweep(),
          { kind: "actor-died", actor: THIEF, to: "cargo_lost", message: "The runner went down and the parcel burned with them." },
        ],
        next: "done",
      },
    ],
    fail: [
      { id: failLate, message: rush ? "The rush deadline expired and the $60 bond is forfeited." : "The deadline expired and the parcel went back to dispatch." },
      { id: "cargo_lost", message: "The parcel is gone." },
      { id: "heat_sweep", message: "HHPD swept the drop while you were hot. The parcel went back to dispatch." },
    ],
    rewards: { economy: { cash: route.payout } },
  };
}

export const COURIER_JOBS: readonly MissionDef[] = DELIVERY_ROUTES.flatMap((route, index) => [
  routeMission(route, index, false),
  routeMission(route, index, true),
]);

/** Markers are authored at y=0; the machine measures proximity in 3D, so each one is lifted to the live ground it sits on. */
function groundedMarkers(ctx: GameContext): Record<string, { x: number; y: number; z: number }> {
  const out = missionMarkers(editorLayers);
  for (const marker of Object.values(out)) marker.y = ctx.world.groundHeightAt(marker.x, marker.z);
  return out;
}

const runtimes = perContext((ctx: GameContext) =>
  createMissionRuntime({
    missions: COURIER_JOBS,
    markers: groundedMarkers(ctx),
    defaultPursuer: PLAYER_ACTOR,
    devtoolsName: "harbor-heat courier",
  }),
);

export function courierRuntime(ctx: GameContext) {
  return runtimes(ctx);
}

function syncObjective(ctx: GameContext): void {
  const view = courierRuntime(ctx).view();
  courierObjectiveStore.write(
    ctx,
    view === null
      ? null
      : {
          title: view.title,
          label: view.label,
          remaining: view.remaining,
          counted: view.counted,
          count: view.count,
          step: view.step,
          steps: view.steps,
          status: view.status,
          outcome: view.outcome,
          reason: view.reason,
        },
  );
}

function commit(ctx: GameContext): void {
  courierMissionStore.write(ctx, courierRuntime(ctx).snapshot());
  syncObjective(ctx);
}

export function courierPosition(ctx: GameContext): readonly [number, number, number] | null {
  return ctx.scene.entity.get(streetPlayOf(ctx).drivingVehicleId() ?? ctx.player.userId)?.position ?? null;
}

function near(ctx: GameContext, target: readonly [number, number], radius: number): boolean {
  const position = courierPosition(ctx);
  return position !== null && Math.hypot(position[0] - target[0], position[2] - target[1]) < radius && Math.abs(position[1] - ctx.world.groundHeightAt(target[0], target[1])) < 3;
}

function routeOf(state: CourierState) {
  return DELIVERY_ROUTES[state.route % DELIVERY_ROUTES.length]!;
}

export function finishCourier(ctx: GameContext, won: boolean, reason?: string): void {
  const loop = courierLoop(ctx);
  const current = courierStore.read(ctx);
  if (loop.phase() !== "open") return;
  const route = routeOf(current);
  const remaining = Math.max(0, current.remaining);
  // The contract's base payout is mission data; the time, condition and bond extras stay Harbor Heat's,
  // and they are what the session carries to its boundary.
  const settlement = courierSettlement({ payout: route.payout, rush: current.service === "rush", won, handoff: current.handoff ?? 0, condition: current.condition ?? 100 });
  if (settlement.carried > 0) loop.carry(settlement.carried);
  const closed = loop.settle({ won, route, reason, settlement });
  const next: CourierState = { ...current, remaining, delivered: current.delivered + (won ? 1 : 0), receipt: closed.result };
  publishCourier(ctx, next);
  sessionStore.write(ctx, { ...sessionStore.read(ctx), notice: "courier" });
  syncSession(ctx, true);
  void ctx.game.save?.checkpoint();
}

function spawnThief(ctx: GameContext): void {
  if (ctx.scene.entity.get(THIEF) !== null) return;
  const position = courierPosition(ctx);
  if (position === null) return;
  const route = routeOf(courierStore.read(ctx));
  let dx = position[0] - route.position[0];
  let dz = position[2] - route.position[1];
  const length = Math.hypot(dx, dz);
  if (length < 0.1) {
    dx = 1;
    dz = 0;
  } else {
    dx /= length;
    dz /= length;
  }
  const x = position[0] + dx * 8;
  const z = position[2] + dz * 8;
  ctx.scene.entity.spawn("ganger_dock", { id: THIEF, position: [x, ctx.world.groundHeightAt(x, z), z], role: "npc" });
  ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: "PARCEL SNATCHED — CATCH THE RUNNER", kind: "warn" });
}

/** The runner flees from the player on foot; the pursuit itself is the mission's `pursue` objective. */
function moveThief(ctx: GameContext, dt: number): void {
  if (courierRuntime(ctx).view()?.objectiveId !== "recover") return;
  const thief = ctx.scene.entity.get(THIEF);
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (thief === null || player === null) return;
  const dx = thief.position[0] - player.position[0];
  const dz = thief.position[2] - player.position[2];
  const length = Math.hypot(dx, dz);
  if (length < 0.1) return;
  const away: readonly [number, number, number] = [thief.position[0] + (dx / length) * 10, thief.position[1], thief.position[2] + (dz / length) * 10];
  ctx.scene.entity.moveToward(THIEF, away, { speed: 5.4, dt });
}

function handleMissionEvents(ctx: GameContext, events: readonly MissionEvent[]): void {
  for (const event of events) {
    if (event.kind === "objective") {
      if (event.objectiveId === "recover") {
        // The delivery clock stops at the handover; the runner's own timer is not time saved.
        const current = courierStore.read(ctx);
        courierStore.write(ctx, { ...current, handoff: Math.max(0, current.remaining) });
        spawnThief(ctx);
        ctx.game.feedback.cue("objective", "Parcel handed over — catch the runner.");
      }
    } else if (event.kind === "reward") {
      applyMissionRewards(event.rewards, {
        grantEconomy: (currencyId, amount) => {
      if (currencyId === "cash") earn(ctx, amount, "courier-payout");
      else ctx.game.economy.grant(ctx.player.userId, currencyId, amount);
    },
      });
    } else if (event.kind === "completed") {
      ctx.scene.entity.despawn(THIEF);
      finishCourier(ctx, true);
    } else if (event.kind === "failed") {
      ctx.scene.entity.despawn(THIEF);
      finishCourier(ctx, false, event.reason);
    }
  }
}

/** Why a parcel cannot be taken right now, or null when it can. Refusals are the command's own answer. */
function acceptRefusal(state: GameContext, input: { service?: string } | undefined) {
  const current = courierStore.read(state);
  if (courierLoop(state).phase() === "open" || courierRuntime(state).state()?.status === "active") {
    return { reason: "already-running", message: "Finish the parcel you are already carrying." };
  }
  if (!near(state, DISPATCH, 9)) return { reason: "not-at-dispatch", message: "Take a parcel from the dispatch booth." };
  if (input?.service !== "rush") return null;
  if (current.delivered < 1) return { reason: "rush-locked", message: "Complete a standard delivery first." };
  if (groundCarId(state) === null) return { reason: "no-car", message: "Express needs a ground car. Standard parcels go on foot." };
  if (state.game.economy.balance(state.player.userId, "cash") < RUSH_BOND) {
    return { reason: "no-bond", message: `Fragile rush needs a $${RUSH_BOND} bond.` };
  }
  return null;
}

function acceptParcel(state: GameContext, input: { service?: string } | undefined): void {
  const current = courierStore.read(state);
  const rush = input?.service === "rush";
  if (rush) spend(state, RUSH_BOND, "courier-bond");
  // Route rotation and the rush gate read the delivery tally; the session number is the loop's.
  const routeIndex = current.delivered % DELIVERY_ROUTES.length;
  const route = DELIVERY_ROUTES[routeIndex]!;
  const position = courierPosition(state)!;
  courierRuntime(state).start(courierMissionId(routeIndex, rush));
  courierLoop(state).start();
  const contract: CourierState = { ...current, route: routeIndex, remaining: courierDeadline(route.seconds, rush), receipt: null, service: rush ? "rush" : "standard", condition: 100, handoff: 0, lastHealth: state.scene.entity.stats.get(state.player.userId, "health")?.current ?? 100,
    distance: Math.round(Math.hypot(position[0] - route.position[0], position[2] - route.position[1])) };
  publishCourier(state, contract);
  syncObjective(state);
  commit(state);
  loadContraband(state);
  state.game.feedback.cue("pickup", `Parcel taken — ${route.label}, $${route.payout}.`);
  void state.game.save?.checkpoint();
}

function dismissReceipt(state: GameContext): void {
  const current = courierStore.read(state);
  if (courierLoop(state).phase() === "open") return;
  courierRuntime(state).abandon();
  publishCourier(state, { ...current, receipt: null });
  commit(state);
  sessionStore.write(state, { ...sessionStore.read(state), notice: "" });
  syncSession(state, true);
}

export function registerCourier(ctx: GameContext): void {
  ctx.game.commands.define<{ service?: string }>("courier.accept", { validate: acceptRefusal, apply: acceptParcel });
  ctx.game.commands.define("courier.deliver", {
    validate(state) {
      const current = courierStore.read(state);
      if (courierLoop(state).phase() !== "open") return { reason: "no-parcel", message: "You are not carrying a parcel." };
      const mission = courierRuntime(state).state();
      if (mission === null || mission.objective !== "deliver") return { reason: "no-handoff", message: "Nothing to hand over yet." };
      if (!near(state, routeOf(current).position, 8)) return { reason: "not-at-drop", message: "Take the parcel to the drop." };
      if (streetPlayOf(state).carSpeedKmh() > 8) return { reason: "moving", message: "Slow down to deliver." };
      return null;
    },
    apply(state) {
      const mission = courierRuntime(state).state()!;
      handleMissionEvents(state, courierRuntime(state).signal(mission.missionId, "deliver"));
      commit(state);
      void state.game.save?.checkpoint();
    },
  });
  ctx.game.commands.define("courier.dismiss", { apply: dismissReceipt });
  // The receipt's "Try again" / "Next parcel": back at the booth with the parcel in hand, no walk back.
  ctx.game.commands.define<{ service?: string }>("courier.retry", { apply(state, input) {
    dismissReceipt(state);
    const x = DISPATCH[0] + 3;
    const at: [number, number, number] = [x, state.world.groundHeightAt(x, DISPATCH[1]), DISPATCH[1]];
    // An express retry keeps its car, since express needs one; anything else walks up to the booth.
    const car = input?.service === "rush" ? groundCarId(state) : null;
    if (car !== null) streetPlayOf(state).placeVehicle(state, car, at, 0);
    else {
      streetPlayOf(state).exitVehicle(state, true);
      state.scene.entity.setPose(state.player.userId, { position: at });
    }
    const service = acceptRefusal(state, input) === null ? input : undefined;
    if (acceptRefusal(state, service) === null) acceptParcel(state, service);
  } });
}

export function tickCourier(ctx: GameContext, dt: number): void {
  const runtime = courierRuntime(ctx);
  const mission = runtime.state();
  if (mission === null || mission.status !== "active") return;
  const current = courierStore.read(ctx);
  const route = routeOf(current);
  const position = courierPosition(ctx);
  const health = ctx.scene.entity.stats.get(ctx.player.userId, "health")?.current ?? 100;
  const held = current.condition ?? 100;
  // Every parcel wears with the driving; once the runner has it, it wears in their hands until caught.
  const condition = runtime.view()?.objectiveId === "recover"
    ? Math.max(0, held - RUNNER_WEAR * Math.max(0, dt))
    : cargoCondition(held, dt, streetPlayOf(ctx).carSpeedKmh(), (current.lastHealth ?? health) - health, FRAGILITY[current.service ?? "standard"]);
  const dx = route.position[0] - (position?.[0] ?? DISPATCH[0]);
  const dz = route.position[1] - (position?.[2] ?? DISPATCH[1]);
  moveThief(ctx, dt);
  const thief = ctx.scene.entity.get(THIEF);
  const thiefFact = thief !== null
    ? { position: { x: thief.position[0], y: thief.position[1], z: thief.position[2] } }
    : runtime.view()?.objectiveId === "recover" ? { alive: false } : {};
  const events = runtime.tick(dt, {
    actors: {
      [PLAYER_ACTOR]: position === null ? {} : { position: { x: position[0], y: position[1], z: position[2] } },
      [THIEF]: thiefFact,
    },
    facts: { cargo_condition: condition, [POLICE_TIER_FACT]: streetPlayOf(ctx).wanted().stars },
  });
  courierStore.write(ctx, {
    ...current,
    condition,
    lastHealth: health,
    distance: Math.round(Math.hypot(dx, dz)),
    heading: Math.atan2(dx, dz),
    remaining: runtime.view()?.remaining ?? Math.max(0, current.remaining - dt),
  });
  handleMissionEvents(ctx, events);
  commit(ctx);
}

export function courierPrompts(ctx: GameContext): PositionedPrompt[] {
  const mission = courierRuntime(ctx).state();
  const delivering = mission?.status === "active" && mission.objective === "deliver";
  if (mission?.status === "active" && !delivering) return [];
  const current = courierStore.read(ctx);
  const target = delivering ? routeOf(current).position : DISPATCH;
  return [{ id: delivering ? "courier:deliver" : "courier:accept", priority: 3, position: { x: target[0], z: target[1] }, prompt: {
    radius: delivering ? 8 : 9,
    display: { kind: "keybind", actionId: "interact" },
    invoke: { name: delivering ? "courier.deliver" : "courier.accept", input: undefined },
  } }];
}

/** Restore the mission machine over a loaded save, then mirror its state into the courier stores. */
export function restoreCourier(ctx: GameContext): void {
  const snapshot = courierMissionStore.read(ctx);
  if (snapshot !== null) courierRuntime(ctx).restore(snapshot);
  syncObjective(ctx);
  const mission = courierRuntime(ctx).state();
  const current = courierStore.read(ctx);
  const loop = courierLoop(ctx);
  // A world-snapshot-only reload still carries the parcel's contract: the mission machine's active
  // contract reopens the session it belongs to, so the loop follows the authority it wraps.
  if (loop.phase() !== "open" && current.phase === "running" && mission?.status === "active") loop.start();
  // A save written at the boundary leaves the loop open with nothing to run; close that session as the
  // lost parcel it is instead of leaving an unreachable mission blocking the dispatch booth.
  if (loop.phase() === "open" && (mission === null || mission.status !== "active")) {
    const route = routeOf(current);
    const settlement = courierSettlement({ payout: route.payout, rush: current.service === "rush", won: false, handoff: 0, condition: 0 });
    loop.settle({ won: false, route, reason: "The parcel's contract was gone after the reload.", settlement });
  }
  publishCourier(ctx, courierStore.read(ctx));
}

/** Old saves gain the authored landmarks once; newer saves keep their placements. */
export function setupCourierLandmarks(ctx: GameContext): void {
  const points = [DISPATCH, ...DELIVERY_ROUTES.map((route) => route.position)];
  points.forEach(([x, z], i) => {
    const catalog = i === 0 ? "obj_dispatch" : `obj_delivery_${i}`;
    // Object placement persists in the whole-world snapshot.
    if (ctx.scene.object.list().some((object) => object.catalogId === catalog)) return;
    ctx.scene.object.place(catalog, i === 0 ? x - 3 : x, ctx.world.groundHeightAt(x, z), z);
  });
}

