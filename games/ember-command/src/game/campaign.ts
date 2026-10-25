import type { GameContext } from "@jgengine/core/runtime/gameContext";
import {
  applyMissionRewards,
  createMissionRuntime,
  type MissionActorFact,
  type MissionDef,
  type MissionEvent,
  type MissionFailCondition,
  type MissionRewards,
  type MissionRuntimeSnapshot,
  type MissionStatus,
  type MissionTickInput,
  type MissionWorldEvent,
} from "@jgengine/core/mission/mission";
import { defendMission, escortMission } from "@jgengine/core/mission/compositions";
import { missionMarkers } from "@jgengine/core/mission/triggers";
import { perContext } from "@jgengine/core/runtime/perContext";
import { createSessionLoop, installSessionProbe } from "@jgengine/core/run/sessionLoop";
import { defineStore } from "@jgengine/core/store/defineStore";

import { editorLayers } from "../editorLayers";
import { combatantDef } from "./catalog";
import { grantHeroXp, HERO_ID, MISSION_XP, OBJECTIVE_XP } from "./hero";
import { heroPickStore } from "./heroPicks";
import { hudStore } from "./hudStore";
import { session } from "./session";
import { GOLD, LUMBER } from "./tuning";

/**
 * The vale campaign: five missions that teach the skirmish in order, run by the engine's mission
 * machine (`@jgengine/core/mission`). This module is adoption, not a runtime —
 *
 * - the objective graphs, fail states and rewards are {@link MissionDef} data;
 * - `createMissionRuntime` walks them, times them and pays them;
 * - `missionMarkers` reads the authored waypoints out of `editor.scene.json`;
 * - `defendMission` / `escortMission` build the copies of hold-and-escort the engine already ships.
 *
 * What Ember owns is the campaign track (which mission is next, and the stores carried between
 * battles), the world reports the machine judges (build completions, unit losses, the Warcamp
 * falling) and the field-desk voice. See `harbor-heat/src/game/jobs/courier.ts` and
 * `scrap-signal/src/game/mast.ts` for the two earlier adopters.
 */

/** The authored waypoints the campaign reads out of the scene document. */
export const MUSTER_MARKER = "campaign_muster";
export const CROSSROADS_MARKER = "campaign_crossroads";
/** The mid-vale seam marker the escort runs to (an authored landmark, not campaign furniture). */
export const ENTREPOT_MARKER = "goldmine_mid";

/** Tracked actors the objectives name. */
const PLAYER_KEEP = "keep_player";

/** Mission ids, in campaign order. */
export const FIRST_MUSTER_ID = "m1_first_muster";
export const LONG_WATCH_ID = "m2_long_watch";
export const MID_VALE_ROAD_ID = "m3_mid_vale_road";
export const THIN_LINE_ID = "m4_thin_line";
export const EMBER_VERDICT_ID = "m5_ember_verdict";

/** The named fail states every mission that can lose the vale shares. */
const BRAM_FELL = { id: "bram_fell", message: "Bram the Bold fell, and the Vanguard broke with him." } as const;
const KEEP_FELL = { id: "keep_fallen", message: "The Ember Keep fell and the vale went dark." } as const;
export const KEEP_FAIL_ID = KEEP_FELL.id;

/** The keep falling ends every mission. */
function keepFails(): readonly MissionFailCondition[] {
  return [{ kind: "actor-died", actor: PLAYER_KEEP, to: KEEP_FELL.id, message: KEEP_FELL.message }];
}

/** Bram and the keep: used where the hero is the point of the objective (a march, a line). */
function valeFails(): readonly MissionFailCondition[] {
  return [
    { kind: "actor-died", actor: HERO_ID, to: BRAM_FELL.id, message: BRAM_FELL.message },
    ...keepFails(),
  ];
}

/** Declare the keep's fail state on a mission the engine composed, so its reason is authored here. */
function withKeepFail(def: MissionDef): MissionDef {
  return { ...def, fail: [...(def.fail ?? []), KEEP_FELL] };
}

/** Replace a composed mission's fail wording with Ember's own voice ("the position was overrun"). */
function withFailMessages(def: MissionDef, messages: Readonly<Record<string, string>>): MissionDef {
  return {
    ...def,
    fail: (def.fail ?? []).map((state) => messages[state.id] === undefined ? state : { ...state, message: messages[state.id] }),
  };
}

/** Authored labels replace the composition's derived placeholders ("Escort hero to goldmine_mid"). */
function relabel(def: MissionDef, labels: Readonly<Record<string, string>>): MissionDef {
  return { ...def, objectives: def.objectives.map((objective) => labels[objective.id] === undefined ? objective : { ...objective, label: labels[objective.id] }) };
}

const MUSTER_REWARD: MissionRewards = { economy: { [GOLD]: 120, [LUMBER]: 40 } };
const WATCH_REWARD: MissionRewards = { economy: { [GOLD]: 160, [LUMBER]: 60 } };
const ROAD_REWARD: MissionRewards = { economy: { [GOLD]: 200, [LUMBER]: 80 } };
const LINE_REWARD: MissionRewards = { economy: { [GOLD]: 240, [LUMBER]: 100 } };
const VERDICT_REWARD: MissionRewards = { economy: { [GOLD]: 400, [LUMBER]: 150 } };

/**
 * Mission I — the build order. Report a finished Barracks and four trained Footmen as `collect`
 * world events, then walk Bram to the muster ground so the mission cannot be won on a counter.
 */
export const FIRST_MUSTER: MissionDef = {
  id: FIRST_MUSTER_ID,
  title: "First Muster",
  description: "The vale has one keep, and it is yours. Raise a Barracks, put four Footmen in the line, then take Bram to the muster ground.",
  start: "raise_barracks",
  objectives: [
    {
      id: "raise_barracks",
      kind: "collect",
      count: 1,
      counter: "barracks",
      match: { kind: "collect", target: "barracks" },
      label: "Raise a Barracks on the vale floor",
      timeout: 420,
      onTimeout: "muster_stalled",
      // While the muster is at home, losing Bram costs you the hero, not the mission: the march is
      // where he is the point of the order.
      failOn: keepFails(),
      next: "muster_footmen",
    },
    {
      id: "muster_footmen",
      kind: "collect",
      count: 4,
      counter: "footman",
      match: { kind: "collect", target: "footman" },
      label: "Muster four Footmen at the Barracks",
      timeout: 420,
      onTimeout: "muster_stalled",
      failOn: keepFails(),
      next: "march_muster",
    },
    {
      id: "march_muster",
      kind: "reach",
      actor: HERO_ID,
      marker: MUSTER_MARKER,
      radius: 8,
      label: "March Bram to the muster ground",
      timeout: 180,
      onTimeout: "muster_stalled",
      failOn: valeFails(),
      next: "done",
    },
  ],
  fail: [
    BRAM_FELL,
    KEEP_FELL,
    { id: "muster_stalled", message: "The muster stalled: the vale grew tired of waiting for its line." },
  ],
  rewards: MUSTER_REWARD,
};

/**
 * Mission II — the defence, composed by the engine's `defendMission`: one `survive` objective, its
 * `minSurvivors` gate as the fail condition, and the duration ticking down in the HUD.
 */
export const LONG_WATCH: MissionDef = withFailMessages(withKeepFail(defendMission({
  id: LONG_WATCH_ID,
  title: "The Long Watch",
  description: "The drums are on the war-road. Hold the keep for two minutes and let the Marauders break on your wall.",
  seconds: 120,
  minSurvivors: 1,
  failState: "watch_overrun",
  label: "Hold the keep through the Marauder drums",
  rewards: WATCH_REWARD,
})), {
  watch_overrun: "The last Vanguard soldier at the keep went down, and the drums rolled through the gate.",
});

/**
 * Mission III — the escort, composed by the engine's `escortMission`: Bram has to reach the mid-vale
 * seam alive, with a deadline and a named fail state for being waylaid.
 */
export const MID_VALE_ROAD: MissionDef = relabel(
  withFailMessages(withKeepFail(escortMission({
    id: MID_VALE_ROAD_ID,
    title: "Road to Mid Vale",
    description: "The mid-vale seam is unworked and the road is not ours. Walk Bram up it before the Marauders close the way.",
    escortee: HERO_ID,
    destination: ENTREPOT_MARKER,
    radius: 8,
    timeoutSeconds: 240,
    failState: "bram_waylaid",
    rewards: ROAD_REWARD,
  })), {
    bram_waylaid: "Bram was cut down on the war-road, and the mid-vale seam stayed unworked.",
  }),
  { escort_deliver: "Escort Bram up the war-road to the mid-vale seam" },
);

/**
 * Mission IV — the line that must not break. Reach the crossroads, then hold it: a single Vanguard
 * soldier falling fails the mission, reported to the machine as a `kill` event tagged `vanguard`.
 */
export const THIN_LINE: MissionDef = {
  id: THIN_LINE_ID,
  title: "The Thin Line",
  description: "Six soldiers and a hero. Take the crossroads and hold it without losing one of them.",
  start: "reach_crossroads",
  objectives: [
    {
      id: "reach_crossroads",
      kind: "reach",
      actor: HERO_ID,
      marker: CROSSROADS_MARKER,
      radius: 10,
      label: "March the line to the crossroads",
      timeout: 150,
      onTimeout: "line_broken",
      failOn: valeFails(),
      next: "hold_line",
    },
    {
      id: "hold_line",
      kind: "survive",
      duration: 45,
      label: "Hold the crossroads for 45s without losing a soldier",
      failOn: [
        ...valeFails(),
        { kind: "event", match: { kind: "kill", tags: ["vanguard"] }, to: "line_broken", message: "A Vanguard soldier fell, and the line broke where they stood." },
        { kind: "left-area", actor: HERO_ID, marker: CROSSROADS_MARKER, radius: 18, to: "line_broken", message: "Bram left the crossroads and the line lost its centre." },
      ],
      next: "done",
    },
  ],
  fail: [
    BRAM_FELL,
    KEEP_FELL,
    { id: "line_broken", message: "The thin line broke: the vale cannot spare another soldier." },
  ],
  rewards: LINE_REWARD,
};

/**
 * Mission V — the finale, two chained objectives: weather the last push, then raze the Warcamp. The
 * mission machine chains them with `next`; the Warcamp's death is reported as a `kill` world event.
 */
export const EMBER_VERDICT: MissionDef = {
  id: EMBER_VERDICT_ID,
  title: "The Ember Verdict",
  description: "This is the last push the Marauders have. Weather it, then take the war to their Warcamp and end it.",
  start: "weather_the_push",
  objectives: [
    {
      id: "weather_the_push",
      kind: "survive",
      duration: 60,
      minSurvivors: 1,
      minSurvivorsFail: "verdict_lost",
      label: "Weather the last Marauder push",
      failOn: keepFails(),
      next: "raze_warcamp",
    },
    {
      id: "raze_warcamp",
      kind: "kill",
      count: 1,
      counter: "warcamp",
      match: { kind: "kill", target: "keep_enemy" },
      label: "Raze the Marauder Warcamp",
      failOn: keepFails(),
      next: "done",
    },
  ],
  fail: [
    BRAM_FELL,
    KEEP_FELL,
    { id: "verdict_lost", message: "The Vanguard had nothing left to hold the vale with." },
  ],
  rewards: VERDICT_REWARD,
};

/** One campaign step: the mission plus the field-desk brief and the world it is fought in. */
export interface CampaignStep {
  mission: MissionDef;
  /** The field desk's brief, in Ember's voice, shown before the mission. */
  brief: string;
  /** Authored hostile markers standing when the mission opens; the rest are stood down. */
  hostiles: readonly string[];
  /** Whether the Marauder wave director musters during this mission. */
  waves: boolean;
}

/** The opening assault group authored in the scene (stance: assault). */
const STANDING_RAID = ["grunt_raid_1", "grunt_raid_2", "reaver_raid_1"] as const;
/** The Warcamp's guard detail authored in the scene (stance: guard). */
const WARCAMP_GUARD = ["grunt_guard_1", "grunt_guard_2", "grunt_guard_3", "reaver_guard_1"] as const;

export const CAMPAIGN: readonly CampaignStep[] = [
  {
    mission: FIRST_MUSTER,
    brief: "The vale remembers the first bell. Raise a Barracks, put four Footmen in the line, and stand Bram on the muster ground before the drums find you.",
    hostiles: [...STANDING_RAID, ...WARCAMP_GUARD],
    waves: false,
  },
  {
    mission: LONG_WATCH,
    brief: "The Marauders have found the road and they will not stop for a wall. Two minutes, commander. Hold the keep and let them break on it.",
    hostiles: [...STANDING_RAID],
    waves: true,
  },
  {
    mission: MID_VALE_ROAD,
    brief: "The mid-vale seam is unworked, and the road to it belongs to nobody yet. Walk Bram up it while the Vanguard clears the way.",
    hostiles: [...STANDING_RAID, ...WARCAMP_GUARD],
    waves: false,
  },
  {
    mission: THIN_LINE,
    brief: "Six soldiers and a hero on the crossroads. Hold it for forty-five seconds and bring every one of them home.",
    hostiles: [...STANDING_RAID, ...WARCAMP_GUARD],
    waves: false,
  },
  {
    mission: EMBER_VERDICT,
    brief: "This is everything they have left. Weather the push, then take the war to the Warcamp and burn the drums for good.",
    hostiles: [...STANDING_RAID, ...WARCAMP_GUARD],
    waves: true,
  },
];

export const CAMPAIGN_MISSIONS: readonly MissionDef[] = CAMPAIGN.map((step) => step.mission);

/* -------------------------------------------------------------------------------------------- */
/* Campaign track — what is won, what is offered next, and the stores carried between battles.  */
/* -------------------------------------------------------------------------------------------- */

export type CampaignMode = "campaign" | "skirmish";

export interface CampaignProgress {
  /** Mission ids won, in the order they were won. */
  won: readonly string[];
  /** What the field desk runs: the campaign, or a free skirmish on the same vale. */
  mode: CampaignMode;
  /** The vale's stores: mission pay banked by the campaign and spent opening the next battle. */
  stores: { gold: number; lumber: number };
}

export const campaignStore = defineStore<CampaignProgress>("ember.campaign", () => ({ won: [], mode: "campaign", stores: { gold: 0, lumber: 0 } }));
/** The mission machine's serializable position, written with the rest of the world on a checkpoint. */
export const campaignMissionStore = defineStore<MissionRuntimeSnapshot | null>("ember.campaign.mission", null);

/** Gold and lumber the won missions carry into the next battle. */
export function campaignStores(progress: CampaignProgress): { gold: number; lumber: number } {
  return progress.stores;
}

/** The next mission in campaign order: the first one not yet won, or null once the vale is held. */
export function nextCampaignStep(progress: CampaignProgress): CampaignStep | null {
  if (progress.mode !== "campaign") return null;
  return CAMPAIGN.find((step) => !progress.won.includes(step.mission.id)) ?? null;
}

export function campaignFinished(progress: CampaignProgress): boolean {
  return progress.won.length >= CAMPAIGN.length;
}

/** The field desk's readout: the live objective and its clock, or what is offered next. */
export type CampaignPhase = "ready" | "live" | "cleared" | "failed" | "finished";

export interface CampaignReadout {
  phase: CampaignPhase;
  missionId: string;
  title: string;
  brief: string;
  /** 1-based campaign position and the campaign's length. */
  index: number;
  total: number;
  objective: string;
  /** Seconds left on the active objective's timer, or null when it has none. */
  remaining: number | null;
  /** The active objective's whole clock in seconds, so the card can draw a shrinking bar. */
  duration: number | null;
  counted: number;
  count: number;
  step: number;
  steps: number;
  status: MissionStatus;
  outcome: string | null;
  reason: string | null;
  stores: { gold: number; lumber: number };
}

/* -------------------------------------------------------------------------------------------- */
/* Runtime wiring                                                                                */
/* -------------------------------------------------------------------------------------------- */

/** Markers are authored at y = 0; positional objectives use the machine's default 8 m tolerance. */
function authoredMarkers(): Record<string, { x: number; y: number; z: number }> {
  return missionMarkers(editorLayers);
}

const runtimes = perContext((ctx: GameContext) =>
  createMissionRuntime({
    missions: CAMPAIGN_MISSIONS,
    markers: authoredMarkers(),
    // Ember's ground rises under the authored flat waypoints; the machine's horizontal test is why
    // the 8 m default tolerance is enough and no marker has to be lifted by hand.
    markerProximity: { plane: "horizontal" },
    devtoolsName: "ember-command campaign",
    rng: ctx.rng,
  }),
);

export function campaignRuntime(ctx: GameContext) {
  return runtimes(ctx);
}

/** What the mission session's boundary hands its `settle`. */
export interface CampaignSettlementInput {
  won: boolean;
  missionId: string;
  rewards: MissionRewards | null;
}

/**
 * A campaign mission is a session on the shared loop: it opens when the field desk starts it, carries
 * the pay the vale's stores will receive, and its boundary banks that pay or loses it with the order.
 */
const sessions = perContext((ctx: GameContext) => {
  const loop = createSessionLoop<never, CampaignSettlementInput, { banked: boolean }>({
    kind: "mission",
    settle: ({ input }) => {
      if (!input.won || input.rewards === null) return { banked: false };
      bankMissionRewards(ctx, input.missionId, input.rewards);
      return { banked: true };
    },
  });
  installSessionProbe(loop);
  return loop;
});

export function campaignSession(ctx: GameContext) {
  return sessions(ctx);
}

/** World events reported by the game this frame, handed to the machine on the next tick. */
const pendingEvents = perContext(() => [] as MissionWorldEvent[]);

/**
 * A loaded record already carries the stores its next battle opens with; the next `match.start`
 * must not pay them a second time. Kept on the context so two sessions never share the flag.
 */
const storesRestoredStore = defineStore<boolean>("ember.campaign.storesRestored", false);

export function markStoresRestored(ctx: GameContext): void {
  storesRestoredStore.write(ctx, true);
}

/**
 * Report a death the mission machine may judge: a Vanguard soldier falling (the `vanguard` tag the
 * thin-line fail reads) and anything the Vanguard kills, including the Warcamp. Tagged so `match`
 * filters can tell whose blood it is.
 */
export function noteCampaignDeath(ctx: GameContext, catalogId: string): void {
  const def = combatantDef(catalogId);
  if (def === null) return;
  if (def.faction === "player") {
    if (def.kind === "unit" && def.worker !== true) pendingEvents(ctx).push({ kind: "kill", target: catalogId, tags: ["vanguard"] });
    return;
  }
  pendingEvents(ctx).push({ kind: "kill", target: catalogId, tags: ["marauder"] });
}

/** A finished building, counted by the build-order objective. */
export function noteCampaignBuild(ctx: GameContext, building: string): void {
  pendingEvents(ctx).push({ kind: "collect", target: building, by: "vanguard", tags: ["built"] });
}

/** A trained recruit, counted by the muster objective. */
export function noteCampaignTrain(ctx: GameContext, unit: string): void {
  pendingEvents(ctx).push({ kind: "collect", target: unit, by: "vanguard", tags: ["trained"] });
}

function actorFact(ctx: GameContext, id: string): MissionActorFact {
  const entity = ctx.scene.entity.get(id);
  if (entity === null) return { alive: false };
  return { alive: true, position: { x: entity.position[0], y: entity.position[1], z: entity.position[2] } };
}

/** Everything the active objective can read: the keeps, the hero and every living Vanguard body. */
function tickInput(ctx: GameContext, events: readonly MissionWorldEvent[]): MissionTickInput {
  const actors: Record<string, MissionActorFact> = {
    [HERO_ID]: actorFact(ctx, HERO_ID),
    [PLAYER_KEEP]: actorFact(ctx, PLAYER_KEEP),
  };
  let survivors = 0;
  for (const unit of session.units.values()) {
    if (unit.faction !== "player") continue;
    if (actors[unit.id] === undefined) actors[unit.id] = actorFact(ctx, unit.id);
    const def = combatantDef(unit.catalogId);
    if (def?.kind === "unit" && def.worker !== true && actors[unit.id]?.alive !== false) survivors += 1;
  }
  return { actors, survivors, events };
}

/** The campaign step whose mission is running, or null for a free skirmish / an ended mission. */
export function activeCampaignStep(ctx: GameContext): CampaignStep | null {
  const state = campaignRuntime(ctx).state();
  if (state === null || state.status !== "active") return null;
  return CAMPAIGN.find((step) => step.mission.id === state.missionId) ?? null;
}

/** Whether the Marauder wave director runs now. A campaign step says so; a free skirmish always does. */
export function campaignWavesRunning(ctx: GameContext): boolean {
  const step = activeCampaignStep(ctx);
  return step === null ? true : step.waves;
}

/**
 * Stand the authored hostiles the mission does not use back down, so each battlefield reads as its
 * own scenario out of the same vale. Placement stays authored; this only picks who is on duty.
 */
function stageHostiles(ctx: GameContext, hostiles: readonly string[]): void {
  const standing = new Set(hostiles);
  for (const unit of [...session.units.values()]) {
    // Only bodies stand down: the Marauder Warcamp and any forward camp are always in the fight.
    if (unit.faction !== "enemy" || unit.kind !== "unit" || standing.has(unit.id)) continue;
    ctx.scene.entity.despawn(unit.id);
    session.units.delete(unit.id);
  }
}

/** Pay the stores the won missions carry, on top of the opening purse. */
function grantCarriedStores(ctx: GameContext): void {
  const stores = campaignStores(campaignStore.read(ctx));
  if (stores.gold > 0) ctx.game.economy.grant(ctx.player.userId, GOLD, stores.gold);
  if (stores.lumber > 0) ctx.game.economy.grant(ctx.player.userId, LUMBER, stores.lumber);
}

const ROMAN = ["I", "II", "III", "IV", "V"] as const;

export function campaignOrdinal(index: number): string {
  return ROMAN[index] ?? String(index + 1);
}

/** Build the field desk's readout from the live machine plus the campaign track. */
export function campaignReadout(ctx: GameContext): CampaignReadout | null {
  const progress = campaignStore.read(ctx);
  if (progress.mode !== "campaign") return null;
  const stores = campaignStores(progress);
  const finished = campaignFinished(progress);
  const view = campaignRuntime(ctx).view();
  const live = view !== null && view.status === "active";
  const offered = nextCampaignStep(progress);
  const step = live ? CAMPAIGN.find((entry) => entry.mission.id === view!.missionId) ?? offered : offered;
  const shown = step ?? CAMPAIGN[CAMPAIGN.length - 1]!;
  const index = Math.max(0, CAMPAIGN.indexOf(shown));
  const ended = view !== null && !live && view.missionId === shown.mission.id;
  // A win advances the track, so the finished mission is no longer the offered one: read it as
  // "cleared" rather than "ready" so the field desk can say the vale holds.
  const cleared = view !== null && !live && view.status === "completed" && view.missionId !== shown.mission.id;
  // The loop owns whether a mission is open; the machine still owns how far its objectives got.
  const loop = campaignSession(ctx);
  const phase: CampaignPhase = loop.phase() === "open"
    ? "live"
    : finished
      ? "finished"
      : ended
        ? (view!.status === "failed" ? "failed" : "cleared")
        : cleared
          ? "cleared"
          : "ready";
  const objective = live
    ? view!.label
    : (shown.mission.objectives[0]?.label ?? shown.mission.title);
  const activeObjective = live ? shown.mission.objectives.find((entry) => entry.id === view!.objectiveId) : undefined;
  const duration = activeObjective === undefined
    ? null
    : activeObjective.timeout ?? (activeObjective.kind === "survive" ? activeObjective.duration ?? null : null);
  return {
    phase,
    missionId: shown.mission.id,
    title: finished && offered === null ? "The vale is yours" : shown.mission.title,
    brief: shown.brief,
    index: index + 1,
    total: CAMPAIGN.length,
    objective,
    remaining: live ? view!.remaining : null,
    duration,
    counted: live ? view!.counted : 0,
    count: live ? view!.count : 0,
    step: live ? view!.step : 0,
    steps: live ? view!.steps : shown.mission.objectives.length,
    status: live ? "active" : (view?.status ?? "active"),
    outcome: live ? null : (view?.outcome ?? null),
    // Authored wording for the named fail state, not the machine's generated reason.
    reason: live ? null : (shown.mission.fail?.find((entry) => entry.id === view?.outcome)?.message ?? view?.reason ?? null),
    stores,
  };
}

/** Mirror the campaign readout into the HUD store (the objective card and the field desk read it). */
export function syncCampaignHud(ctx: GameContext): void {
  hudStore.set({ campaign: campaignReadout(ctx) });
}

/** Start the offered mission on the field the caller has just restaged. */
export function startCampaignMission(ctx: GameContext): boolean {
  const progress = campaignStore.read(ctx);
  if (progress.mode !== "campaign") return false;
  const step = nextCampaignStep(progress);
  if (step === null) {
    syncCampaignHud(ctx);
    return false;
  }
  stageHostiles(ctx, step.hostiles);
  // A resumed record already opened with the stores it banked; only a fresh order pays them again.
  if (!storesRestoredStore.read(ctx)) grantCarriedStores(ctx);
  storesRestoredStore.write(ctx, false);
  campaignRuntime(ctx).start(step.mission.id);
  // The mission opens a session that carries the pay its completion will bank.
  const loop = campaignSession(ctx);
  loop.start();
  loop.carry(missionPayTotal(step.mission.rewards));
  ctx.game.audio.play("muster");
  ctx.game.notices.push({
    text: `Mission ${campaignOrdinal(CAMPAIGN.indexOf(step))} — ${step.mission.title}. ${step.mission.objectives[0]?.label ?? ""}`,
    ttlMs: 8000,
  });
  syncCampaignHud(ctx);
  checkpointCampaign(ctx);
  return true;
}

/** Write the whole world (campaign track + mission machine) to the session save. */
export function checkpointCampaign(ctx: GameContext): void {
  campaignMissionStore.write(ctx, campaignRuntime(ctx).snapshot());
  void ctx.game.save?.checkpoint();
}

/**
 * Bank a mission's pay into the vale's stores through the engine's reward appliers. The field is
 * restaged after a win, so gold left in the battle economy would be discarded; the campaign purse is
 * what the next battle opens with, and a mission only pays once.
 */
/** What a mission's authored reward table pays in the vale's two currencies. */
function missionPayTotal(rewards: MissionRewards | null | undefined): number {
  if (rewards === null || rewards === undefined) return 0;
  let total = 0;
  applyMissionRewards(rewards, { grantEconomy: (currencyId, amount) => { if (currencyId === GOLD || currencyId === LUMBER) total += amount; } });
  return total;
}

function bankMissionRewards(ctx: GameContext, missionId: string, rewards: MissionRewards): void {
  if (campaignStore.read(ctx).won.includes(missionId)) return;
  applyMissionRewards(rewards, {
    grantEconomy: (currencyId, amount) => {
      if (currencyId !== GOLD && currencyId !== LUMBER) return;
      const progress = campaignStore.read(ctx);
      const stores = { ...progress.stores, [currencyId]: progress.stores[currencyId] + amount };
      campaignStore.write(ctx, { ...progress, stores });
    },
  });
}

function finishCampaignStep(ctx: GameContext, restage?: () => void): void {
  const state = campaignRuntime(ctx).state();
  if (state === null) return;
  const progress = campaignStore.read(ctx);
  const won = progress.won.includes(state.missionId) ? progress.won : [...progress.won, state.missionId];
  campaignStore.write(ctx, { ...progress, won });
  // The mission itself pays Bram: a cleared order is the hero's work as much as a kill is.
  grantHeroXp(ctx, MISSION_XP);
  const step = CAMPAIGN.find((entry) => entry.mission.id === state.missionId);
  ctx.game.audio.play("victory");
  ctx.game.notices.push({
    text: step === undefined ? "Mission complete." : `${step.mission.title} is won. The vale's stores go with you.`,
    tone: "success",
    ttlMs: 8000,
  });
  checkpointCampaign(ctx);
  syncCampaignHud(ctx);
  restage?.();
}

function failCampaignStep(ctx: GameContext, state: string, reason: string, restage?: () => void): void {
  // Prefer the authored copy for the named fail state over the machine's generated reason
  // ("survivors below 1"), so the field desk always speaks in Ember's voice.
  const mission = campaignRuntime(ctx).state()?.missionId;
  const authored = mission === undefined ? undefined : campaignRuntime(ctx).mission(mission)?.fail?.find((entry) => entry.id === state)?.message;
  ctx.game.audio.play("defeat");
  ctx.game.notices.push({ text: authored ?? reason, tone: "deny", ttlMs: 9000 });
  checkpointCampaign(ctx);
  syncCampaignHud(ctx);
  restage?.();
}

function handleCampaignEvents(ctx: GameContext, events: readonly MissionEvent[], restage?: () => void): void {
  for (const event of events) {
    if (event.kind === "objective") {
      ctx.game.audio.play("wave");
      // An objective reached pays XP, so the campaign's orders level Bram, not only its kills.
      grantHeroXp(ctx, OBJECTIVE_XP);
      ctx.game.notices.push({ text: event.label, ttlMs: 7000 });
    } else if (event.kind === "reward") {
      // A mid-mission reward pays straight through; the completion's pay is what the session settles.
      bankMissionRewards(ctx, event.missionId, event.rewards);
    } else if (event.kind === "completed") {
      // The mission's own reward rides the `completed` event, not a `reward` one; the session's
      // boundary is what banks it, once, for the mission that closed.
      campaignSession(ctx).settle({ won: true, missionId: event.missionId, rewards: event.rewards });
      finishCampaignStep(ctx, restage);
    } else if (event.kind === "failed") {
      campaignSession(ctx).settle({ won: false, missionId: event.missionId, rewards: null });
      failCampaignStep(ctx, event.state, event.reason, restage);
    }
  }
}

/**
 * Advance the active campaign mission one frame. `restage` is the caller's world reset (the scene
 * owner passes it) so this module never reaches back into scene setup.
 */
export function tickCampaign(ctx: GameContext, dt: number, restage?: () => void): void {
  const runtime = campaignRuntime(ctx);
  const state = runtime.state();
  if (state === null) {
    pendingEvents(ctx).length = 0;
    return;
  }
  const events = pendingEvents(ctx).splice(0);
  if (state.status !== "active") {
    syncCampaignHud(ctx);
    return;
  }
  const fired = runtime.tick(dt, tickInput(ctx, events));
  handleCampaignEvents(ctx, fired, restage);
  syncCampaignHud(ctx);
}

/**
 * The Warcamp falling is reported in the death handler, which pauses the match in the same call, so
 * the finale's last objective is flushed with a zero-length tick before the clock stops.
 */
export function flushCampaign(ctx: GameContext, restage?: () => void): void {
  tickCampaign(ctx, 0, restage);
}

/** A lost keep ends the match; land the mission in its named state before the screen changes. */
export function failCampaignOnKeepLost(ctx: GameContext): void {
  const runtime = campaignRuntime(ctx);
  const state = runtime.state();
  if (state === null || state.status !== "active") return;
  const fired = runtime.fail(state.missionId, KEEP_FAIL_ID);
  handleCampaignEvents(ctx, fired);
  checkpointCampaign(ctx);
  syncCampaignHud(ctx);
}

/** Restore the campaign track over a loaded save (the world itself is restaged fresh). */
export function restoreCampaign(ctx: GameContext): void {
  const snapshot = campaignMissionStore.read(ctx);
  if (snapshot !== null) campaignRuntime(ctx).restore(snapshot);
  // The battlefield is restaged fresh, so a half-played mission is re-offered rather than resumed:
  // what carries across a save is the campaign track and the stores, not a mid-battle board.
  if (campaignRuntime(ctx).state()?.status === "active") campaignRuntime(ctx).abandon();
  syncCampaignHud(ctx);
}

/** Switch to a free skirmish (same vale, no mission track) or back to the campaign. */
export function setCampaignMode(ctx: GameContext, mode: CampaignMode): void {
  campaignStore.write(ctx, { ...campaignStore.read(ctx), mode });
  campaignRuntime(ctx).abandon();
  syncCampaignHud(ctx);
}

/** Wipe the track and offer mission I again. A new campaign starts with a hero who has picked nothing. */
export function resetCampaignProgress(ctx: GameContext): void {
  campaignStore.write(ctx, { won: [], mode: "campaign", stores: { gold: 0, lumber: 0 } });
  campaignRuntime(ctx).abandon();
  campaignMissionStore.clear(ctx);
  heroPickStore.clear(ctx);
  storesRestoredStore.write(ctx, false);
  syncCampaignHud(ctx);
}

/** Exposed for the mission catalog test: the campaign's authored marker ids. */
export function campaignMarkerIds(): readonly string[] {
  const ids = new Set<string>();
  for (const step of CAMPAIGN) {
    for (const objective of step.mission.objectives) {
      if (objective.marker !== undefined) ids.add(objective.marker);
      for (const fail of objective.failOn ?? []) {
        if (fail.marker !== undefined) ids.add(fail.marker);
      }
    }
  }
  return [...ids];
}
