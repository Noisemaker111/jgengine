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
import { SUGAR, LEAF } from "./tuning";
import { NO_HAZARDS, type HazardToggles } from "./hazards";

/**
 * The yard campaign: five missions that teach the skirmish in order, run by the engine's mission
 * machine (`@jgengine/core/mission`). This module is adoption, not a runtime —
 *
 * - the objective graphs, fail states and rewards are {@link MissionDef} data;
 * - `createMissionRuntime` walks them, times them and pays them;
 * - `missionMarkers` reads the authored waypoints out of `editor.scene.json`;
 * - `defendMission` / `escortMission` build the copies of hold-and-escort the engine already ships.
 *
 * What LAWN ORDER owns is the campaign track (which mission is next, and the stores carried between
 * battles), the world reports the machine judges (chambers dug, ants lost, the black nest dug
 * out) and the field-journal voice. See `harbor-heat/src/game/jobs/courier.ts` and
 * `scrap-signal/src/game/mast.ts` for the two earlier adopters.
 */

/** The authored waypoints the campaign reads out of the scene document. */
export const MUSTER_MARKER = "campaign_popsicle";
export const CROSSROADS_MARKER = "campaign_brood_raid";
/** The far bank of the garden hose, where the crossing escort runs to. */
export const ENTREPOT_MARKER = "campaign_far_bank";

/** Tracked actors the objectives name. */
const PLAYER_KEEP = "keep_player";

/** Mission ids, in campaign order. */
export const POPSICLE_CLAIM_ID = "m1_popsicle_claim";
export const HOSE_CROSSING_ID = "m2_crossing_the_hose";
export const MOWER_DAY_ID = "m3_mower_day";
export const BLACK_QUEEN_RAID_ID = "m4_raid_the_black_queen";
export const MAGNIFYING_GLASS_ID = "m5_magnifying_glass";

/** The named fail states every mission that can lose the yard shares. */
const MANDIBLE_FELL = { id: "mandible_fell", message: "Marshal Mandible fell, and the column scattered into the grass." } as const;
const KEEP_FELL = { id: "keep_fallen", message: "The red nest was dug out, and the queen fled into the dark." } as const;
export const KEEP_FAIL_ID = KEEP_FELL.id;

/** The nest falling ends every mission. */
function keepFails(): readonly MissionFailCondition[] {
  return [{ kind: "actor-died", actor: PLAYER_KEEP, to: KEEP_FELL.id, message: KEEP_FELL.message }];
}

/** The Marshal and the nest: used where the hero is the point of the objective (a march, a raid). */
function yardFails(): readonly MissionFailCondition[] {
  return [
    { kind: "actor-died", actor: HERO_ID, to: MANDIBLE_FELL.id, message: MANDIBLE_FELL.message },
    ...keepFails(),
  ];
}

/** Declare the nest's fail state on a mission the engine composed, so its reason is authored here. */
function withKeepFail(def: MissionDef): MissionDef {
  return { ...def, fail: [...(def.fail ?? []), KEEP_FELL] };
}

/** Replace a composed mission's fail wording with the colony's own voice. */
function withFailMessages(def: MissionDef, messages: Readonly<Record<string, string>>): MissionDef {
  return {
    ...def,
    fail: (def.fail ?? []).map((state) => {
      const message = messages[state.id];
      return message === undefined ? state : { ...state, message };
    }),
  };
}

/** Authored labels replace the composition's derived placeholders ("Escort hero to campaign_far_bank"). */
function relabel(def: MissionDef, labels: Readonly<Record<string, string>>): MissionDef {
  return { ...def, objectives: def.objectives.map((objective) => labels[objective.id] === undefined ? objective : { ...objective, label: labels[objective.id] }) };
}

const MUSTER_REWARD: MissionRewards = { economy: { [SUGAR]: 120, [LEAF]: 40 } };
const WATCH_REWARD: MissionRewards = { economy: { [SUGAR]: 160, [LEAF]: 60 } };
const ROAD_REWARD: MissionRewards = { economy: { [SUGAR]: 200, [LEAF]: 80 } };
const LINE_REWARD: MissionRewards = { economy: { [SUGAR]: 240, [LEAF]: 100 } };
const VERDICT_REWARD: MissionRewards = { economy: { [SUGAR]: 400, [LEAF]: 150 } };

/**
 * Mission I — the build order. Report a dug Barracks Chamber and four hatched Soldiers as `collect`
 * world events, then march the Marshal to the dropped popsicle so it cannot be won on a counter.
 */
export const POPSICLE_CLAIM: MissionDef = {
  id: POPSICLE_CLAIM_ID,
  title: "The Popsicle Claim",
  description: "Somebody dropped a strawberry popsicle on the lawn. Dig a Barracks Chamber, hatch four Soldiers, and plant the Marshal on the sugar before the black ants smell it.",
  start: "raise_barracks",
  objectives: [
    {
      id: "raise_barracks",
      kind: "collect",
      count: 1,
      counter: "barracks",
      match: { kind: "collect", target: "barracks" },
      label: "Dig a Barracks Chamber",
      timeout: 420,
      onTimeout: "muster_stalled",
      // While the colony is at home, losing the Marshal costs you the hero, not the mission: the march
      // is where he is the point of the order.
      failOn: keepFails(),
      next: "muster_soldiers",
    },
    {
      id: "muster_soldiers",
      kind: "collect",
      count: 4,
      counter: "soldier",
      match: { kind: "collect", target: "soldier" },
      label: "Hatch four Soldier Ants",
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
      radius: 9,
      label: "March Marshal Mandible onto the popsicle",
      timeout: 180,
      onTimeout: "muster_stalled",
      failOn: yardFails(),
      next: "done",
    },
  ],
  fail: [
    MANDIBLE_FELL,
    KEEP_FELL,
    { id: "muster_stalled", message: "The popsicle melted into the soil while the colony dithered." },
  ],
  rewards: MUSTER_REWARD,
};

/**
 * Mission III — the defence, composed by the engine's `defendMission`: hold the nest for two and a half
 * minutes while black-ant waves come and the lawnmower makes its pass down the lane.
 */
export const MOWER_DAY: MissionDef = withFailMessages(withKeepFail(defendMission({
  id: MOWER_DAY_ID,
  title: "Mower Day",
  description: "It is Saturday. The black ants are marching, the mower is fuelled, and the sky is grey. Hold the nest for two and a half minutes and stay out of the lane.",
  seconds: 150,
  minSurvivors: 1,
  failState: "watch_overrun",
  label: "Hold the nest through the raids, and clear the mower lane",
  rewards: WATCH_REWARD,
})), {
  watch_overrun: "The last soldier at the nest went down, and the black ants poured into the tunnels.",
});

/**
 * Mission II — the escort, composed by the engine's `escortMission`: the Marshal must reach the far
 * bank of the garden hose alive. Climbing the rubber is a crawl; the two crossings are not.
 */
export const HOSE_CROSSING: MissionDef = relabel(
  withFailMessages(withKeepFail(escortMission({
    id: HOSE_CROSSING_ID,
    title: "Crossing the Hose",
    description: "The garden hose cuts the lawn like a green river. Get the Marshal over it to the far bank: use a crossing, mind the sprinkler, lay a trail if you have to.",
    escortee: HERO_ID,
    destination: ENTREPOT_MARKER,
    radius: 8,
    timeoutSeconds: 240,
    failState: "mandible_waylaid",
    rewards: ROAD_REWARD,
  })), {
    mandible_waylaid: "The Marshal never made the far bank of the hose.",
  }),
  { escort_deliver: "Escort Marshal Mandible over the hose to the far bank" },
);

/**
 * Mission IV — the raid. March on the black colony's brood mound under cover of night, then dig it
 * out: the black queen lays her eggs there, and without it the black waves thin.
 */
export const BLACK_QUEEN_RAID: MissionDef = {
  id: BLACK_QUEEN_RAID_ID,
  title: "Raid the Black Queen",
  description: "The black queen lays her eggs in the brood mound past the patio. Night is coming. March the Marshal there and dig it out.",
  start: "reach_crossroads",
  objectives: [
    {
      id: "reach_crossroads",
      kind: "reach",
      actor: HERO_ID,
      marker: CROSSROADS_MARKER,
      radius: 12,
      label: "March the Marshal to the black colony's brood mound",
      timeout: 200,
      onTimeout: "raid_stalled",
      failOn: yardFails(),
      next: "raze_brood",
    },
    {
      id: "raze_brood",
      kind: "kill",
      count: 1,
      counter: "brood_mound",
      match: { kind: "kill", target: "brood_mound" },
      label: "Dig out the Brood Mound",
      timeout: 240,
      onTimeout: "raid_stalled",
      failOn: yardFails(),
      next: "done",
    },
  ],
  fail: [
    MANDIBLE_FELL,
    KEEP_FELL,
    { id: "raid_stalled", message: "Dawn came and the raid was still knocking at the brood mound." },
  ],
  rewards: LINE_REWARD,
};

/**
 * Mission V — the boss. The Kid with the Magnifying Glass has found the lawn. Outlast the first minute
 * under the beam (shade is safety), then dig out the Black Ant Nest while the spot hunts the colony.
 */
export const MAGNIFYING_GLASS: MissionDef = {
  id: MAGNIFYING_GLASS_ID,
  title: "The Kid with the Magnifying Glass",
  description: "A shadow falls over the lawn, then a terrible point of light. Hide in the shade, outlast the beam, and finish the black ants while the kid hunts you both.",
  start: "weather_the_push",
  objectives: [
    {
      id: "weather_the_push",
      kind: "survive",
      duration: 60,
      minSurvivors: 1,
      minSurvivorsFail: "verdict_lost",
      label: "Outlast the beam: keep the colony in the shade",
      failOn: keepFails(),
      next: "raze_warcamp",
    },
    {
      id: "raze_warcamp",
      kind: "kill",
      count: 1,
      counter: "keep_enemy",
      match: { kind: "kill", target: "keep_enemy" },
      label: "Dig out the Black Ant Nest under the beam",
      failOn: keepFails(),
      next: "done",
    },
  ],
  fail: [
    MANDIBLE_FELL,
    KEEP_FELL,
    { id: "verdict_lost", message: "The beam found the last of the colony in the open." },
  ],
  rewards: VERDICT_REWARD,
};

/** One campaign step: the mission plus the field-journal brief and the yard it is fought in. */
export interface CampaignStep {
  mission: MissionDef;
  /** The field journal's brief, in the colony's voice, shown before the mission. */
  brief: string;
  /** Authored hostile markers standing when the mission opens; the rest are stood down. */
  hostiles: readonly string[];
  /** Whether the black-ant wave director musters during this mission. */
  waves: boolean;
  /** Whether the paper wasp nest sends sorties during this mission. */
  wasps: boolean;
  /** Which of the yard's clocks run during this mission. */
  hazards: HazardToggles;
}

/** The opening raiding party authored in the scene (stance: assault). */
const STANDING_RAID = ["raider_raid_1", "raider_raid_2", "major_raid_1"] as const;
/** The black nest's guard detail authored in the scene (stance: guard). */
const BROOD_GUARD = ["raider_guard_1", "raider_guard_2", "raider_guard_3", "major_guard_1"] as const;
/** Black ants holding the two hose crossings (the escort has to break through one). */
const CROSSING_GUARD = ["raider_bridge_west_1", "raider_bridge_west_2", "raider_bridge_east_1", "major_bridge_east_1"] as const;
/** The black queen's own guard around the brood mound. */
const QUEEN_GUARD = ["major_brood_1", "raider_brood_1", "raider_brood_2"] as const;

export const CAMPAIGN: readonly CampaignStep[] = [
  {
    mission: POPSICLE_CLAIM,
    brief: "A popsicle fell from the sky and the whole lawn can smell it. Dig a Barracks Chamber, hatch four Soldiers, and stand the Marshal on the sugar. Watch the sprinkler.",
    hostiles: [...STANDING_RAID, ...BROOD_GUARD, ...CROSSING_GUARD, ...QUEEN_GUARD],
    waves: false,
    wasps: false,
    hazards: { ...NO_HAZARDS, sprinkler: true },
  },
  {
    mission: HOSE_CROSSING,
    brief: "The garden hose runs across the lawn like a river of green rubber. Climbing it is a crawl; the two crossings are not, and the black ants hold both. Break one, or climb where they are not looking.",
    hostiles: [...CROSSING_GUARD, ...BROOD_GUARD],
    waves: false,
    wasps: false,
    hazards: { ...NO_HAZARDS, sprinkler: true },
  },
  {
    mission: MOWER_DAY,
    brief: "Saturday morning. The black ants are coming, the clouds are low, and somewhere a mower coughs into life. Hold the nest for two and a half minutes, and nobody stands in the lane.",
    hostiles: [...STANDING_RAID],
    waves: true,
    wasps: false,
    hazards: { ...NO_HAZARDS, mower: true, rain: true },
  },
  {
    mission: BLACK_QUEEN_RAID,
    brief: "The black queen's eggs lie in the brood mound past the patio, and her majors guard it. Night is falling and the antennae grow short. March the Marshal there and dig it out.",
    hostiles: [...STANDING_RAID, ...BROOD_GUARD, ...QUEEN_GUARD],
    waves: false,
    wasps: true,
    hazards: { ...NO_HAZARDS, night: true, sprinkler: true },
  },
  {
    mission: MAGNIFYING_GLASS,
    brief: "A giant has come to the lawn with a lens. The spot of light hunts whatever moves in the open. Keep to the shade of the clover and the flowerpot, outlast it, then finish the black ants.",
    hostiles: [...BROOD_GUARD],
    waves: true,
    wasps: true,
    hazards: { ...NO_HAZARDS, beam: true },
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
  /** What the field desk runs: the campaign, or a free skirmish on the same yard. */
  mode: CampaignMode;
  /** The yard's stores: mission pay banked by the campaign and spent opening the next battle. */
  stores: { sugar: number; leaf: number };
}

export const campaignStore = defineStore<CampaignProgress>("ember.campaign", () => ({ won: [], mode: "campaign", stores: { sugar: 0, leaf: 0 } }));
/** The mission machine's serializable position, written with the rest of the world on a checkpoint. */
export const campaignMissionStore = defineStore<MissionRuntimeSnapshot | null>("ember.campaign.mission", null);

/** Sugar and leaf the won missions carry into the next battle. */
export function campaignStores(progress: CampaignProgress): { sugar: number; leaf: number } {
  return progress.stores;
}

/** The next mission in campaign order: the first one not yet won, or null once the yard is held. */
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
  /** Whole seconds left (rounded up) on the active objective's timer, or null when it has none. */
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
  stores: { sugar: number; leaf: number };
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
    // The lawn rises under the authored flat waypoints; the machine's horizontal test is why
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
 * the pay the yard's stores will receive, and its boundary banks that pay or loses it with the order.
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
 * Report a death the mission machine may judge: a Red soldier falling (the `colony` tag the
 * thin-line fail reads) and anything the colony kills, including the black nest. Tagged so `match`
 * filters can tell whose blood it is.
 */
export function noteCampaignDeath(ctx: GameContext, catalogId: string): void {
  const def = combatantDef(catalogId);
  if (def === null) return;
  if (def.faction === "player") {
    if (def.kind === "unit" && def.worker !== true) pendingEvents(ctx).push({ kind: "kill", target: catalogId, tags: ["colony"] });
    return;
  }
  pendingEvents(ctx).push({ kind: "kill", target: catalogId, tags: ["rival"] });
}

/** A finished building, counted by the build-order objective. */
export function noteCampaignBuild(ctx: GameContext, building: string): void {
  pendingEvents(ctx).push({ kind: "collect", target: building, by: "colony", tags: ["built"] });
}

/** A trained recruit, counted by the muster objective. */
export function noteCampaignTrain(ctx: GameContext, unit: string): void {
  pendingEvents(ctx).push({ kind: "collect", target: unit, by: "colony", tags: ["trained"] });
}

function actorFact(ctx: GameContext, id: string): MissionActorFact {
  const entity = ctx.scene.entity.get(id);
  if (entity === null) return { alive: false };
  return { alive: true, position: { x: entity.position[0], y: entity.position[1], z: entity.position[2] } };
}

/** Everything the active objective can read: the keeps, the hero and every living Red body. */
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

/** Whether the Black Ant wave director runs now. A campaign step says so; a free skirmish always does. */
/** Whether the wasp nest sends sorties now. A campaign step says so; a free skirmish always does. */
export function campaignWaspsRunning(ctx: GameContext): boolean {
  const step = activeCampaignStep(ctx);
  return step === null ? true : step.wasps;
}

export function campaignWavesRunning(ctx: GameContext): boolean {
  const step = activeCampaignStep(ctx);
  return step === null ? true : step.waves;
}

/**
 * Stand the authored hostiles the mission does not use back down, so each battlefield reads as its
 * own scenario out of the same yard. Placement stays authored; this only picks who is on duty.
 */
function stageHostiles(ctx: GameContext, hostiles: readonly string[]): void {
  const standing = new Set(hostiles);
  for (const unit of [...session.units.values()]) {
    // Only bodies stand down: the Black Ant Nest and any forward camp are always in the fight.
    if (unit.faction !== "enemy" || unit.kind !== "unit" || standing.has(unit.id)) continue;
    ctx.scene.entity.despawn(unit.id);
    session.units.delete(unit.id);
  }
}

/** Pay the stores the won missions carry, on top of the opening purse. */
function grantCarriedStores(ctx: GameContext): void {
  const stores = campaignStores(campaignStore.read(ctx));
  if (stores.sugar > 0) ctx.game.economy.grant(ctx.player.userId, SUGAR, stores.sugar);
  if (stores.leaf > 0) ctx.game.economy.grant(ctx.player.userId, LEAF, stores.leaf);
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
  // "cleared" rather than "ready" so the field desk can say the yard holds.
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
    title: finished && offered === null ? "The lawn is ours" : shown.mission.title,
    brief: shown.brief,
    index: index + 1,
    total: CAMPAIGN.length,
    objective,
    // Whole seconds, as the card shows them: a fractional clock would re-render the HUD every frame.
    remaining: live && view!.remaining !== null ? Math.ceil(view!.remaining) : null,
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
 * Bank a mission's pay into the yard's stores through the engine's reward appliers. The field is
 * restaged after a win, so sugar left in the battle economy would be discarded; the campaign purse is
 * what the next battle opens with, and a mission only pays once.
 */
/** What a mission's authored reward table pays in the yard's two currencies. */
function missionPayTotal(rewards: MissionRewards | null | undefined): number {
  if (rewards === null || rewards === undefined) return 0;
  let total = 0;
  applyMissionRewards(rewards, { grantEconomy: (currencyId, amount) => { if (currencyId === SUGAR || currencyId === LEAF) total += amount; } });
  return total;
}

function bankMissionRewards(ctx: GameContext, missionId: string, rewards: MissionRewards): void {
  if (campaignStore.read(ctx).won.includes(missionId)) return;
  applyMissionRewards(rewards, {
    grantEconomy: (currencyId, amount) => {
      if (currencyId !== SUGAR && currencyId !== LEAF) return;
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
  // The mission itself pays Mandible: a cleared order is the hero's work as much as a kill is.
  grantHeroXp(ctx, MISSION_XP);
  const step = CAMPAIGN.find((entry) => entry.mission.id === state.missionId);
  ctx.game.audio.play("victory");
  ctx.game.notices.push({
    text: step === undefined ? "Mission complete." : `${step.mission.title} is won. The granary stores go with you.`,
    tone: "success",
    ttlMs: 8000,
  });
  checkpointCampaign(ctx);
  syncCampaignHud(ctx);
  restage?.();
}

function failCampaignStep(ctx: GameContext, state: string, reason: string, restage?: () => void): void {
  // Prefer the authored copy for the named fail state over the machine's generated reason
  // ("survivors below 1"), so the field desk always speaks in the colony's voice.
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
      // An objective reached pays XP, so the campaign's orders level Mandible, not only its kills.
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
 * The black nest falling is reported in the death handler, which pauses the match in the same call, so
 * the finale's last objective is flushed with a zero-length tick before the clock stops.
 */
export function flushCampaign(ctx: GameContext, restage?: () => void): void {
  tickCampaign(ctx, 0, restage);
}

/** A lost nest ends the match; land the mission in its named state before the screen changes. */
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

/** Switch to a free skirmish (same yard, no mission track) or back to the campaign. */
export function setCampaignMode(ctx: GameContext, mode: CampaignMode): void {
  campaignStore.write(ctx, { ...campaignStore.read(ctx), mode });
  campaignRuntime(ctx).abandon();
  syncCampaignHud(ctx);
}

/** Wipe the track and offer mission I again. A new campaign starts with a hero who has picked nothing. */
export function resetCampaignProgress(ctx: GameContext): void {
  campaignStore.write(ctx, { won: [], mode: "campaign", stores: { sugar: 0, leaf: 0 } });
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
