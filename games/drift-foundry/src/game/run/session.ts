import { createGameFeed } from "@jgengine/core/game/feed";
import type { NoticeFeed, NoticeTone } from "@jgengine/core/game/notices";
import { damagedAxis, type VehicleDamageEffectResolved, type VehicleDamageZoneState } from "@jgengine/core/physics/vehicleDamage";
import { defineStore } from "@jgengine/core/store/defineStore";

import { createRunLoop, type RunSettlement } from "@jgengine/core/run/runLoop";

import { activeSurge, compactorGap, compactorZAt, type CompactorPlan, type CompactorSurge } from "../compactor/schedule";
import { lineReading } from "./haul";
import { compactorPlanForShift, rivalsForShift, shiftInfo, SHIFT_TABLE, type ShiftEffect } from "./shifts";
import { readRunState, saveRunState } from "./shiftState";
import { createGhostRecorder, readGhosts, replayGhost, saveGhost, type GhostPose, type GhostReplay } from "./ghost";
import { resolveCrusherContact } from "../compactor/contact";
import { partInSlotId, tuningFrom, type KartTuning } from "../parts/build";
import type { DriftFoundryPartDef } from "../parts/catalog";
import { PART_SLOTS, partById, type PartSlotId } from "../parts/catalog";
import { createKartDamage, impactImpulse, noseHitPoint } from "../vehicle/damage";
import { surfaceAt, type SurfaceSample } from "../vehicle/surface";
import { createOpponentField, RIVAL_DEFS, type OpponentField, type RivalBody } from "../race/opponents";
import { createStandings, PLAYER_RACER_ID, type RaceSnapshot, type Standings } from "../race/standings";
import { grantPickup, nearestUncollected, PICKUPS, type PickupDef } from "./pickups";
import { gateSatisfied, gateStanding, inLane } from "../route/gates";
import { createVehicleController, type DriveAxis, type VehicleController, type VehiclePose } from "../vehicle/controller";
import { NEAR_MISS_ENTER, NEAR_MISS_EXIT, RUN_SEED } from "./constants";
import { zoneProgress, type TrackZone } from "../zones/catalog";
import { ROW_SIX_TRACK, trackById, type ActiveHazard, type Track } from "../tracks/catalog";
import { FLAT_YARD_GROUND } from "../tracks/ground";
import { browserRecordStorage, completeRun, readRecords, saveRecords, type PersonalBest, type RunRecords, type RecordStorage } from "./records";
import { checkpointParts, readParkedRun, saveParkedRun, type ParkedRun } from "./progress";
import { ESCAPE_BONUS, bankOf, buyPart as buyGaragePart, garageRows, medalsOf, ownedParts, readCareer, SALVAGE_CREDITS, saveCareer, settleRun, standingOf, DRIVER, type CareerSave } from "../career";
import { DEFAULT_EVENT_ID, eventById, eventCompactor, eventRivals, formatMetric, MEDALS, targetText, YARD_EVENTS, YARD_TIERS, type MedalId, type YardEvent } from "../events/catalog";

/**
 * Where a run stands, in the player's words. It is derived, never stored: a settled run reports the
 * outcome the shared run loop closed it with, and an open run is playing once it has begun.
 */
export type RunPhase = "start" | "running" | "won" | "crushed";

export interface RadioLine {
  id: number;
  text: string;
}

export interface RunOutcome {
  kind: "won" | "crushed";
  time: number;
  partsOnExit: number;
  nearMisses: number;
  closestGap: number;
  armorSaves: number;
  zoneLabel: string;
  /** Where the player's kart finished in the four-kart field. */
  place: number;
  fieldSize: number;
  /** Salvage the run carried home, before the line multiplier. */
  carried: number;
  /** What the line paid: 0 on a wreck, 0.5-1.8 on an escape. */
  lineMultiplier: number;
  /** Why the line paid that, one line per term, for the results card. */
  lineNotes: readonly string[];
  /** Credits that reached the bank, or 0 on a wreck. */
  banked: number;
  /** Credits the compactor took, or 0 on an escape. */
  lost: number;
  /** What the next run changes, drawn as this one was settled. */
  nextShift: { id: string; label: string; hint: string } | null;
  /** The calendar event this run raced and what it did to that event's medals. */
  event: EventResult;
}

/** One calendar event's result on the results card. */
export interface EventResult {
  id: string;
  label: string;
  /** The run's number on the event's metric, as words, or `null` when a wreck set none. */
  result: string | null;
  /** The medal this run earned on its own. */
  medal: MedalId | null;
  /** Medals held on the event for the first time, with what each one paid. */
  firstTime: readonly { medal: MedalId; credits: number }[];
  /** Credits the first-time medals paid on top of the line. */
  reward: number;
  /** Calendar tiers this run opened. */
  openedTiers: readonly string[];
  /** The next medal still on offer and what it asks for. */
  next: { medal: MedalId; text: string } | null;
  newBest: boolean;
}

/** One event on the calendar, as the pit's board reads it. */
export interface CalendarEvent {
  event: YardEvent;
  /** The track the event runs on. */
  trackLabel: string;
  open: boolean;
  selected: boolean;
  medal: MedalId | null;
  best: string | null;
  next: { medal: MedalId; text: string } | null;
}

export interface CalendarTier {
  id: string;
  label: string;
  requires: number;
  open: boolean;
  missing: number;
  events: readonly CalendarEvent[];
}

export interface SessionSnapshot {
  paused: boolean;
  records: RunRecords;
  recordsSaved: boolean;
  personalBest: PersonalBest;
  parkedRun: ParkedRun | null;
  clearedGateIds: ReadonlySet<string>;
  phase: RunPhase;
  runTime: number;
  pose: VehiclePose;
  /** The track this run is on, and where the kart sits on it. */
  track: { id: string; label: string; exitAt: number; gates: number };
  /** Run metres from the start line, and metres left of the centreline. */
  run: number;
  lateral: number;
  /** Route under the kart: the main line or a shortcut's id. */
  route: string;
  /** Hazards under the kart this tick. */
  hazards: readonly ActiveHazard[];
  zone: TrackZone;
  progress: number;
  compactorZ: number;
  compactorGap: number;
  compactorSurge: CompactorSurge | null;
  installed: Readonly<Record<PartSlotId, DriftFoundryPartDef | null>>;
  tuning: KartTuning;
  /** Ground under the kart: which yard, and how much grip it is giving. */
  surface: SurfaceSample;
  /** Front-corner damage, one entry per authored zone - a bent nose reads here and in `tuning.feel`. */
  damage: readonly VehicleDamageZoneState[];
  ticker: readonly RadioLine[];
  nearMissCount: number;
  closestGap: number;
  armorSaveArmed: boolean;
  armorSavesUsed: number;
  outcome: RunOutcome | null;
  collectedIds: ReadonlySet<string>;
  /** Salvage this run is carrying and would bank on an escape. */
  salvageAtRisk: number;
  /** What this run changes about the yard, or `null` on the honest first run. */
  shift: { id: string; label: string; hint: string } | null;
  /** Runs settled in this career, and the loop's own lifetime totals. */
  runsPlayed: number;
  runSaved: boolean;
  /** Live four-kart standings: the player's place, the lap, and the field order. */
  race: RaceSnapshot;
  /** Where the three yard karts are this tick - the loop poses their entities from this. */
  rivals: readonly RivalBody[];
  /** Career money, standing and the garage's next rung per slot, as the pit screen reads them. */
  career: { credits: number; standing: number; tier: string; garage: ReturnType<typeof garageRows>; saved: boolean };
  /** The event this run races, and the medal it asks for next. */
  event: { id: string; label: string; blurb: string; garage: boolean; track: string; trackLabel: string; trackBlurb: string; trackLength: number; medal: MedalId | null; next: { medal: MedalId; text: string } | null };
  /** Your best run on this timed event, replayed on the run clock; `null` on untimed events or before a first escape. */
  ghost: { pose: GhostPose | null; best: number; aheadMetres: number | null } | null;
  /** The yard calendar: tiers, events, medals held and medal points. */
  calendar: { points: number; maxPoints: number; tiers: readonly CalendarTier[] };
}

export interface RunSession {
  snapshot(): SessionSnapshot;
  start(): void;
  restart(): void;
  returnToTitle(): void;
  /** Pick the calendar event the next run races; refused while it is locked or a run is under way. */
  selectEvent(eventId: string): { ok: boolean; reason?: string };
  /** Buy the next rung of a slot's ladder; the pit screen re-reads the career from the snapshot. */
  buyPart(slot: PartSlotId): { ok: boolean; reason?: string };
  /** Park the stopped, grounded run where it stands; false when it is moving or airborne. */
  park(): boolean;
  togglePause(): void;
  suspend(value: boolean): void;
  tick(dt: number, axis: DriveAxis, input: { jumpPressed: boolean; plowBracing: boolean; salvageSwap?: boolean }): void;
}

export const runSessionStore = defineStore<RunSession>("runSession", () => createRunSession());

const TICKER_LIMIT = 6;
/** A train on a crossing throws a kart this far back up the road. */
const TRAIN_KNOCKBACK = 4;

/** The track an event runs on; an unknown id falls back to Row Six. */
export function trackOfEvent(event: YardEvent): Track {
  return trackById(event.track) ?? ROW_SIX_TRACK;
}

/** Ghosts are kept per track and event; Row Six keeps the bare event id its ghosts were first saved under. */
export function ghostKey(event: YardEvent): string {
  const track = trackOfEvent(event);
  return track.id === ROW_SIX_TRACK.id ? event.id : `${track.id}:${event.id}`;
}

const runOf = (pose: VehiclePose): number => pose.run ?? pose.position[2];
const lateralOf = (pose: VehiclePose): number => pose.lateral ?? pose.position[0];

/** `notices` is the game's shared feed (`ctx.game.notices`); pickups, saves and armor saves surface there. */
export function createRunSession(
  groundHeightAt: (x: number, z: number) => number = FLAT_YARD_GROUND,
  storage: RecordStorage | undefined = browserRecordStorage(),
  notices?: Pick<NoticeFeed, "push">,
): RunSession {
  let begun = false;
  let paused = false;
  let suspended = false;
  let records = readRecords(storage);
  let recordsSaved = true;
  let personalBest: PersonalBest = "unchanged";
  let parkedRun = readParkedRun(storage);
  let runTime = 0;
  let installed: readonly DriftFoundryPartDef[] = [];
  let collected = new Set<string>();
  let gateAnnounced = new Set<string>();
  let announcedSurge: string | null = null;
  let armorSaveArmed = false;
  let armorSavesUsed = 0;
  let nearMissCount = 0;
  let wasNear = false;
  let closestGap = Number.POSITIVE_INFINITY;
  const radioFeed = createGameFeed({ limit: TICKER_LIMIT });
  let radioCounter = 0;
  let outcome: RunOutcome | null = null;
  let career: CareerSave = readCareer(storage);
  let careerSaved = true;
  /** The event the open run races; a locked or unknown saved choice falls back to the salvage run. */
  function currentEvent(): YardEvent {
    const chosen = eventById(career.event);
    return chosen !== null && medalsOf(career).isOpen(chosen.id) ? chosen : eventById(DEFAULT_EVENT_ID)!;
  }
  let event: YardEvent = currentEvent();
  let track: Track = trackOfEvent(event);
  // A parked run belongs to the track it was parked on.
  if (parkedRun !== null && (parkedRun.track ?? ROW_SIX_TRACK.id) !== track.id) parkedRun = null;
  const startingParts = (): readonly DriftFoundryPartDef[] => (event.garage ? ownedParts(career) : []);
  const ghostRecorder = createGhostRecorder();
  let ghosts = readGhosts(storage);
  let ghostReplay: GhostReplay | null = null;
  /** A run resumed from a parked checkpoint has no frames before the park, so it never becomes the ghost. */
  let ghostRecording = true;
  function loadGhost(): void {
    const saved = event.metric === "time" ? ghosts[ghostKey(event)] : undefined;
    ghostReplay = saved === undefined ? null : replayGhost(saved);
  }
  let runSaved = true;
  // The run loop owns what a run carries, what a settled run banks or loses, and the shift the next
  // run draws. The money stays in the career bank; this only decides how much of it arrives. Every
  // carry writes the loop's own state and a checkpoint of the live run, so a reload or a crash
  // mid-run comes back to the haul and the route instead of the pit.
  const loop = createRunLoop<ShiftEffect>({
    seed: RUN_SEED,
    changes: SHIFT_TABLE,
    persist: {
      load: () => readRunState(storage),
      save: (state) => {
        runSaved = saveRunState(state, storage);
      },
    },
  });
  let shift: { id: string; label: string; hint: string } | null = shiftInfo(loop.offer().changeId);
  let compactor: CompactorPlan = eventCompactor(event, compactorPlanForShift(loop.offer().changeId));

  // Handling is composed from the installed parts and the damage baked into the body, then handed to
  // the sim as one object. The controller retunes by reference, so an installed part or a bent nose
  // changes the numbers without the kart losing its momentum.
  const damage = createKartDamage();
  let damageEffect: VehicleDamageEffectResolved = damage.effect();
  let tuning: KartTuning = tuningFrom(installed);
  /** One barricade hit per approach: pinned against a gate must not grind damage tick after tick. */
  let gateImpactArmed = true;

  function rebuildTuning(): void {
    tuning = tuningFrom(installed, damage.total() > 0 ? damageEffect : undefined);
  }

  let vehicle: VehicleController = createVehicleController(track.spawn, track);

  function createField(): OpponentField {
    return createOpponentField({
      groundHeightAt,
      track,
      defs: eventRivals(event, rivalsForShift(loop.offer().changeId)),
      // A rival's bumper is real: contact moves the player's kart too, without costing either kart the
      // momentum their driver had built up.
      onPlayerKnock: (dx, dz) => {
        vehicle.shove(dx, dz);
        pose = { ...pose, position: [pose.position[0] + dx, pose.position[1], pose.position[2] + dz] };
      },
    });
  }

  // The field and its standings run on the same authored corridor and the same composed handling as
  // the player; `createStandings` wraps the shared race state machine, which owns order, laps and
  // the finish condition. The field is rebuilt per run because a shift can change a rival's line.
  let opponents: OpponentField = createField();
  function createGrid(): Standings {
    return createStandings({
      ...Object.fromEntries(eventRivals(event, RIVAL_DEFS).map((def) => [def.id, def.name])),
      // Added last so the player starts bottom of the grid, behind every rival.
      [PLAYER_RACER_ID]: "YOU",
    }, track);
  }
  let standings: Standings = createGrid();
  let FIELD_SIZE = eventRivals(event, RIVAL_DEFS).length + 1;
  let announcedPlace = standings.placeOf(PLAYER_RACER_ID);
  const restPose = (position: readonly [number, number, number], heading: number): VehiclePose => {
    const fix = track.locate(position[0], position[2]);
    return { position, heading, speedKmh: 0, slip: 0, surface: 1, loadGrip: 1, airborne: false, blockedByGate: false, run: track.run(fix), lateral: fix.offset, route: fix.route, roadY: fix.elevation, hazards: [] };
  };
  let announcedHazards = new Set<string>();
  let pose: VehiclePose = {
    ...restPose(track.spawn.position, track.spawn.heading),
    speedKmh: 0,
    slip: 0,
    surface: 1,
    loadGrip: 1,
    airborne: false,
    blockedByGate: false,
  };

  function pushRadio(text: string): void {
    radioCounter += 1;
    radioFeed.push("radio", { id: radioCounter, text });
  }

  function notify(text: string, tone: NoticeTone): void {
    notices?.push({ text, tone });
  }

  /**
   * Where the run stands. A settled run reports the outcome the shared run loop closed it with: the
   * readout has no outcome field, and its banked/lost totals cannot tell a zero-haul escape from a
   * zero-haul wreck, so the settlement the loop returned is the only honest answer. `begun` is the
   * one bit the loop cannot know - it opens a run at the pit, before the engine starts.
   */
  function phaseNow(): RunPhase {
    if (outcome !== null) return outcome.kind;
    return begun ? "running" : "start";
  }

  function installedBySlot(): Record<PartSlotId, DriftFoundryPartDef | null> {
    const result = {} as Record<PartSlotId, DriftFoundryPartDef | null>;
    for (const slot of PART_SLOTS) {
      const id = partInSlotId(installed, slot);
      result[slot] = id === null ? null : partById(id);
    }
    return result;
  }

  function applyPickup(consent: boolean): void {
    const found: PickupDef | null = nearestUncollected(pose.position, collected, track.pickups);
    if (found === null) return;
    const incoming = partById(found.partId);
    // Preserve safe route-capability lessons; engine/frame swaps are commitments.
    if (incoming !== null && (incoming.slot === "engine" || incoming.slot === "frame") && partInSlotId(installed, incoming.slot) !== null && !consent) return;
    const grant = grantPickup(found, installed, collected);
    if (grant.status !== "accepted") return;
    const { part, ejected } = grant;
    installed = grant.installed;
    rebuildTuning();
    collected.add(found.id);
    loop.carry(SALVAGE_CREDITS);
    // The loop has just written what the kart carries; write where it is too, so the reload resumes
    // the route instead of handing the haul back at the start line.
    checkpointLiveRun();
    notify(part.radioLine, "success");
    pushRadio(part.radioLine);
    if (ejected !== null) pushRadio(`${ejected.label.toUpperCase()} FLEW OFF THE BACK`);
    if ((part.grants?.armor ?? 0) > 0) armorSaveArmed = true;
  }

  function announceGates(): void {
    for (const gate of track.gates) {
      if (gateAnnounced.has(gate.id)) continue;
      if ((pose.route ?? "main") !== gate.route) continue;
      if (!inLane(lateralOf(pose), gate.laneX)) continue;
      if (runOf(pose) <= gate.atZ) continue;
      if (!gateSatisfied(gate, tuning)) continue;
      if (!gateStanding(gate, runTime)) {
        // Past a set-piece barricade before it dropped: it falls in behind the kart, uncleared.
        if (!gateAnnounced.has(`${gate.id}:beaten`)) pushRadio(`BEAT THE ${gate.label} — IT'S DOWN BEHIND YOU`);
        gateAnnounced.add(`${gate.id}:beaten`);
        continue;
      }
      gateAnnounced.add(gate.id);
      pushRadio(gate.radioLine);
    }
  }

  /**
   * The track's hazards, as the run meets them: the radio calls each one the first time the kart is in
   * it, and a train on a crossing the kart is standing in throws it back up the road and bends the nose.
   */
  function meetHazards(approachKmh: number): void {
    for (const hazard of pose.hazards ?? []) {
      if (!announcedHazards.has(hazard.id)) {
        announcedHazards.add(hazard.id);
        pushRadio(hazard.label);
      }
      if (hazard.kind !== "train") continue;
      const span = track.hazardSpans.find((entry) => entry.id === hazard.id);
      if (span === undefined) continue;
      const back = track.course.progressOf(span.route, span.from) - track.origin - TRAIN_KNOCKBACK;
      const to = track.point(span.route, back, lateralOf(pose));
      vehicle.resetTo([to.x, pose.position[1], to.z], pose.heading);
      pose = { ...pose, position: [to.x, pose.position[1], to.z], run: back, speedKmh: 0 };
      const transitions = damage.hit(noseHitPoint(0), impactImpulse(Math.max(30, approachKmh)));
      if (transitions.length > 0) {
        damageEffect = damage.effect();
        rebuildTuning();
      }
      notify("FREIGHT CLIPPED YOU — WAIT FOR THE GAP", "warn");
      pushRadio("CLIPPED BY THE FREIGHT — WATCH THE LIGHTS");
    }
  }

  /** `keepRun` resumes the run already open (a parked checkpoint); otherwise this starts a new one. */
  function reset(keepRun = false): void {
    begun = false;
    paused = false;
    runTime = 0;
    event = currentEvent();
    const nextTrack = trackOfEvent(event);
    if (nextTrack !== track) {
      track = nextTrack;
      vehicle = createVehicleController(track.spawn, track);
    }
    announcedHazards = new Set<string>();
    installed = startingParts();
    ghostRecorder.reset();
    ghostRecording = !keepRun;
    loadGhost();
    // Salvage a run still carried when the player walks away from it is gone, and the run counts.
    if (!keepRun) {
      if (loop.haul() > 0) loop.settle("lost");
      loop.start();
    }
    shift = shiftInfo(loop.offer().changeId);
    compactor = eventCompactor(event, compactorPlanForShift(loop.offer().changeId));
    collected = new Set<string>();
    gateAnnounced = new Set<string>();
    announcedSurge = null;
    armorSaveArmed = false;
    armorSavesUsed = 0;
    nearMissCount = 0;
    wasNear = false;
    closestGap = Number.POSITIVE_INFINITY;
    radioFeed.hydrate({});
    outcome = null;
    personalBest = "unchanged";
    damage.reset();
    damageEffect = damage.effect();
    rebuildTuning();
    gateImpactArmed = true;
    vehicle.resetTo(track.spawn.position, track.spawn.heading);
    pose = restPose(track.spawn.position, track.spawn.heading);
    opponents = createField();
    standings = createGrid();
    FIELD_SIZE = eventRivals(event, RIVAL_DEFS).length + 1;
    announcedPlace = standings.placeOf(PLAYER_RACER_ID);
  }

  reset(parkedRun !== null);

  /** The live run as the pit would restore it: parts, route, clocks, haul-side details. */
  function checkpointNow(): ParkedRun {
    return { version: 1, track: track.id, position: pose.position, heading: pose.heading, runTime, partIds: installed.map(entry => entry.id), collectedIds: [...collected], gateIds: [...gateAnnounced], armorSaveArmed, armorSavesUsed, nearMissCount, closestGap: Number.isFinite(closestGap) ? closestGap : 0, wasNear, announcedSurge };
  }

  /**
   * Write the checkpoint the loop's own persistence hook fires on each carry, so a reload finds the
   * route too. A pause or a banner is not written: only what the run has already earned.
   */
  function checkpointLiveRun(): void {
    if (phaseNow() !== "running" || runTime <= 0) return;
    const checkpoint = checkpointNow();
    if (saveParkedRun(checkpoint, storage)) parkedRun = checkpoint;
  }

  function parkRun(): void {
    if (phaseNow() !== "running" || pose.airborne || pose.speedKmh > 0.1 || runTime <= 0) return;
    const checkpoint: ParkedRun = checkpointNow();
    if (saveParkedRun(checkpoint, storage)) {
      parkedRun = checkpoint;
      // The salvage in the kart's hold is part of the parked run; the loop has already written it, and
      // this keeps an explicit park in step with an autosaved one.
      runSaved = saveRunState(loop.snapshot(), storage);
      notify("PARKED RUN SAVED — CONTINUE FROM THE PIT", "success");
    }
    else notify("THIS BROWSER COULD NOT SAVE YOUR PARKED RUN", "warn");
  }

  const nextOf = (board: ReturnType<typeof medalsOf>, id: string): { medal: MedalId; text: string } | null => {
    const next = board.next(id);
    const def = eventById(id);
    return next === null || def === null ? null : { medal: next.medal as MedalId, text: targetText(def.metric, next.value) };
  };

  /** The run's number on this event's metric. Grudge is seconds of margin on HOBBS at the gate. */
  function eventValue(place: number): number {
    if (event.metric === "place") return place;
    if (event.metric === "time") return Math.round(runTime * 100) / 100;
    if (event.metric === "sweep") return collected.size;
    const hobbs = standings.snapshot().standings.find((entry) => entry.id === "rival_hobbs");
    if (hobbs?.finishTime != null) return Math.round((hobbs.finishTime - runTime) * 100) / 100;
    const body = opponents.bodies().find((entry) => entry.id === "rival_hobbs");
    if (body === undefined) return 0;
    const metresLeft = Math.max(0, track.exitAt - body.run);
    return Math.round((metresLeft / Math.max(6, body.speedKmh / 3.6)) * 100) / 100;
  }

  /** Grade an escape on the event's board; the medals and payout settle with the run. */
  let pendingMedals: CareerSave["medals"] | undefined;
  function scoreEvent(escaped: boolean, place: number): EventResult {
    const board = medalsOf(career);
    if (!escaped) {
      pendingMedals = undefined;
      return { id: event.id, label: event.label, result: null, medal: null, firstTime: [], reward: 0, openedTiers: [], next: nextOf(board, event.id), newBest: false };
    }
    const value = eventValue(place);
    const submission = board.submit(event.id, value);
    pendingMedals = board.snapshot();
    const firstTime = submission.newlyEarned.map((medal) => ({ medal: medal as MedalId, credits: event.rewards[medal as MedalId] }));
    const reward = firstTime.reduce((sum, entry) => sum + entry.credits, 0);
    for (const entry of firstTime) pushRadio(`${entry.medal.toUpperCase()} ON ${event.label.toUpperCase()} — +${entry.credits} CR`);
    for (const tier of submission.openedTiers) pushRadio(`${YARD_TIERS.find((entry) => entry.id === tier)?.label.toUpperCase() ?? tier} EVENTS OPEN ON THE CALENDAR`);
    return {
      id: event.id,
      label: event.label,
      result: formatMetric(event.metric, value),
      medal: submission.medal as MedalId | null,
      firstTime,
      reward,
      openedTiers: submission.openedTiers.map((tier) => YARD_TIERS.find((entry) => entry.id === tier)?.label ?? tier),
      next: nextOf(board, event.id),
      newBest: submission.newBest,
    };
  }

  function ghostNow(): SessionSnapshot["ghost"] {
    if (ghostReplay === null) return null;
    const ghostPose = phaseNow() === "start" ? null : ghostReplay.poseAt(runTime);
    return {
      pose: ghostPose,
      best: ghostReplay.time,
      aheadMetres: ghostPose === null ? null : Math.round(runOf(pose) - track.run(track.locate(ghostPose.position[0], ghostPose.position[2]))),
    };
  }

  function calendar(): SessionSnapshot["calendar"] {
    const board = medalsOf(career);
    const tiers = board.tiers();
    return {
      points: board.points(),
      maxPoints: YARD_EVENTS.length * MEDALS[MEDALS.length - 1]!.points,
      tiers: YARD_TIERS.map((tier) => {
        const status = tiers.find((entry) => entry.tier.id === tier.id);
        return {
          id: tier.id,
          label: tier.label,
          requires: tier.requires,
          open: status?.open ?? true,
          missing: status?.missing ?? 0,
          events: YARD_EVENTS.filter((entry) => entry.tier === tier.id).map((entry) => {
            const best = board.best(entry.id);
            return {
              event: entry,
              trackLabel: trackOfEvent(entry).label,
              open: board.isOpen(entry.id),
              selected: entry.id === event.id,
              medal: board.medalOf(entry.id) as MedalId | null,
              best: best === null ? null : formatMetric(entry.metric, best),
              next: nextOf(board, entry.id),
            };
          }),
        };
      }),
    };
  }

  function recordOutcome(settlement: RunSettlement<ShiftEffect>): void {
    const completed = completeRun(records, { kind: outcome?.kind === "won" ? "won" : "crushed", time: runTime, distance: Math.max(0, Math.min(track.exitAt, runOf(pose))) });
    records = completed.records;
    personalBest = completed.personalBest;
    recordsSaved = saveRecords(records, storage);
    // What the loop settled is the whole payment: an escape banks its line-scaled salvage, a wreck
    // carries its salvaged haul into the bank's lost counter and leaves the banked credits alone.
    career = settleRun(career, {
      kind: outcome?.kind === "won" ? "escape" : "crushed",
      place: standings.placeOf(PLAYER_RACER_ID),
      haul: outcome?.kind === "won" ? settlement.banked + (outcome?.event.reward ?? 0) : settlement.lost,
      medals: pendingMedals,
    });
    pendingMedals = undefined;
    careerSaved = saveCareer(career, storage);
    runSaved = saveRunState(loop.snapshot(), storage);
    parkedRun = null;
    saveParkedRun(null, storage);
  }

  return {
    snapshot() {
      return {
        paused: paused || suspended,
        records,
        recordsSaved,
        personalBest,
        parkedRun,
        clearedGateIds: gateAnnounced,
        phase: phaseNow(),
        runTime,
        pose,
        track: { id: track.id, label: track.label, exitAt: track.exitAt, gates: track.gates.length },
        run: runOf(pose),
        lateral: lateralOf(pose),
        route: pose.route ?? "main",
        hazards: pose.hazards ?? [],
        zone: track.zoneAt(runOf(pose)),
        progress: zoneProgress(runOf(pose), track.exitAt),
        compactorZ: compactorZAt(runTime, compactor),
        compactorGap: compactorGap(runOf(pose), compactorZAt(runTime, compactor)),
        compactorSurge: activeSurge(runTime, compactor),
        installed: installedBySlot(),
        tuning,
        surface: surfaceAt(lateralOf(pose), runOf(pose), track, pose.hazards ?? []),
        damage: damage.zones(),
        ticker: radioFeed.recent("radio").map((entry) => entry.data as RadioLine),
        nearMissCount,
        closestGap: Number.isFinite(closestGap) ? closestGap : 0,
        armorSaveArmed,
        armorSavesUsed,
        outcome,
        collectedIds: collected,
        salvageAtRisk: loop.haul(),
        shift,
        runsPlayed: loop.snapshot().completed,
        runSaved,
        race: standings.snapshot(),
        rivals: opponents.bodies(),
        career: {
          credits: bankOf(career).banked(),
          standing: standingOf(career).standing(DRIVER, "yard"),
          tier: standingOf(career).tier(DRIVER, "yard").id,
          garage: garageRows(career),
          saved: careerSaved,
        },
        event: {
          id: event.id,
          label: event.label,
          blurb: event.blurb,
          garage: event.garage,
          track: track.id,
          trackLabel: track.label,
          trackBlurb: track.def.blurb,
          trackLength: track.exitAt,
          medal: medalsOf(career).medalOf(event.id) as MedalId | null,
          next: nextOf(medalsOf(career), event.id),
        },
        calendar: calendar(),
        ghost: ghostNow(),
      };
    },
    start() {
      if (phaseNow() === "start") {
        if (parkedRun !== null) {
          const checkpoint = parkedRun;
          installed = checkpointParts(checkpoint);
          collected = new Set(checkpoint.collectedIds);
          gateAnnounced = new Set(checkpoint.gateIds);
          runTime = checkpoint.runTime;
          armorSaveArmed = checkpoint.armorSaveArmed;
          armorSavesUsed = checkpoint.armorSavesUsed;
          nearMissCount = checkpoint.nearMissCount;
          closestGap = checkpoint.closestGap;
          wasNear = checkpoint.wasNear;
          announcedSurge = checkpoint.announcedSurge;
          vehicle.resetTo(checkpoint.position, checkpoint.heading);
          pose = restPose(checkpoint.position, checkpoint.heading);
          // A parked build is restored undamaged: the checkpoint stores parts, not dents.
          damage.reset();
          damageEffect = damage.effect();
          rebuildTuning();
          pushRadio("PARKED RUN RESTORED — YOUR BUILD IS STILL BOLTED ON");
        }
        begun = true;
        if (parkedRun === null) pushRadio("BOLT IT ON, GO GO");
      }
    },
    selectEvent(eventId) {
      const chosen = eventById(eventId);
      if (chosen === null) return { ok: false, reason: "The yard runs no such event" };
      if (phaseNow() === "running") return { ok: false, reason: "Finish or park the run before you change events" };
      if (!medalsOf(career).isOpen(eventId)) return { ok: false, reason: `${chosen.label} is still locked` };
      if (chosen.id === event.id) return { ok: true };
      career = { ...career, event: chosen.id };
      careerSaved = saveCareer(career, storage);
      // A parked run belongs to the event it started in; picking another event drops it.
      parkedRun = null;
      saveParkedRun(null, storage);
      reset();
      return { ok: true };
    },
    buyPart(slot) {
      try {
        career = buyGaragePart(career, slot);
        careerSaved = saveCareer(career, storage);
        if (phaseNow() === "start") {
          installed = startingParts();
          rebuildTuning();
        }
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: (error as Error).message };
      }
    },
    restart() {
      parkedRun = null;
      saveParkedRun(null, storage);
      reset();
      begun = true;
      pushRadio("BOLT IT ON, GO GO");
    },
    returnToTitle() { parkRun(); reset(parkedRun !== null); },
    park() { parkRun(); return parkedRun !== null; },
    togglePause() { if (phaseNow() === "running") { if (!paused) parkRun(); paused = !paused; } },
    suspend(value) { suspended = value; },
    tick(dt, axis, input) {
      if (phaseNow() !== "running" || paused || suspended) return;
      // A resumed/background tab cannot advance the crusher by a large wall-clock delta.
      dt = Math.max(0, Math.min(dt, 0.05));
      runTime += dt;

      // A bent frame pulls the wheel on its own; the last stage of a nose zone adds that bias here.
      const approachKmh = pose.speedKmh;
      pose = vehicle.tick(dt, damagedAxis({ ...axis, handbrake: axis.handbrake ?? 0 }, damageEffect), tuning, { ...input, time: runTime }, groundHeightAt);
      if (ghostRecording) ghostRecorder.record(runTime, { position: pose.position, rotationY: pose.heading });

      // A barricade the build cannot clear stops the kart on the nose. One impulse per approach at the
      // approach speed: leaning on a gate afterwards must not keep folding metal.
      if (!pose.blockedByGate) gateImpactArmed = true;
      else if (gateImpactArmed) {
        gateImpactArmed = false;
        const transitions = damage.hit(noseHitPoint(axis.steer), impactImpulse(approachKmh));
        if (transitions.length > 0) {
          damageEffect = damage.effect();
          rebuildTuning();
          notify("FRONT END FOLDED — SHE PULLS WHEN YOU STEER", "warn");
          pushRadio(transitions[0]!.stage >= 2 ? "NOSE IS FOLDED FLAT — BABY HER HOME" : "CLIPPED THE BARRIER — FRONT END'S BENT");
        }
      }

      applyPickup(input.salvageSwap === true);
      announceGates();
      meetHazards(approachKmh);

      // The field races the same corridor every tick, then the shared race state machine re-orders
      // the four karts from their positions and tells us if the player's place changed. Its lap timer
      // is the shared wall clock, so the HUD's lap time and the results screen's splits are one source.
      opponents.tick(dt, pose.position, runOf(pose), runTime);
      standings.tick(dt);
      // The ring is placed on the road: every kart is measured at the road height under it, so a
      // checkpoint 26 m up the smelter still sees a kart that hopped.
      const placed: Record<string, readonly [number, number, number]> = { [PLAYER_RACER_ID]: [pose.position[0], pose.roadY ?? 0, pose.position[2]] };
      for (const body of opponents.bodies()) placed[body.id] = [body.position[0], body.roadY, body.position[2]];
      standings.update(runTime, placed);
      const place = standings.placeOf(PLAYER_RACER_ID);
      if (place !== announcedPlace) {
        pushRadio(place < announcedPlace ? `P${place} OF ${FIELD_SIZE} — TOOK HIM` : `P${place} OF ${FIELD_SIZE} — PASSED`);
        announcedPlace = place;
      }

      const compactorZ = compactorZAt(runTime, compactor);
      const surge = activeSurge(runTime, compactor);
      if (surge !== null && surge.id !== announcedSurge) {
        announcedSurge = surge.id;
        pushRadio(surge.label);
      }

      const gap = compactorGap(runOf(pose), compactorZ);
      if (gap < closestGap) closestGap = gap;
      if (!wasNear && gap < NEAR_MISS_ENTER) {
        wasNear = true;
        nearMissCount += 1;
        pushRadio("TOO CLOSE, TOO CLOSE");
      } else if (wasNear && gap > NEAR_MISS_EXIT) {
        wasNear = false;
      }

      const contact = resolveCrusherContact(runOf(pose), compactorZ, armorSaveArmed);
      if (contact.outcome === "saved") {
        armorSaveArmed = false;
        armorSavesUsed += 1;
        const rebound = track.point(pose.route ?? "main", contact.reboundZ, lateralOf(pose));
        vehicle.resetTo([rebound.x, pose.position[1], rebound.z], pose.heading);
        pose = { ...pose, position: [rebound.x, pose.position[1], rebound.z], run: contact.reboundZ };
        notify("ARMOR PLATE SAVED YOUR HIDE", "warn");
        pushRadio("ARMOR PLATE TOOK THE HIT — KEEP MOVING");
      } else if (contact.outcome === "crushed") {
        const settlement = loop.settle("lost");
        outcome = {
          kind: "crushed",
          time: runTime,
          partsOnExit: installed.length,
          nearMisses: nearMissCount,
          closestGap: Number.isFinite(closestGap) ? closestGap : 0,
          armorSaves: armorSavesUsed,
          zoneLabel: track.zoneAt(runOf(pose)).label,
          place: standings.placeOf(PLAYER_RACER_ID),
          fieldSize: FIELD_SIZE,
          carried: settlement.haul,
          lineMultiplier: 0,
          lineNotes: [],
          banked: settlement.banked,
          lost: settlement.lost,
          nextShift: shiftInfo(settlement.next.changeId),
          event: scoreEvent(false, standings.placeOf(PLAYER_RACER_ID)),
        };
        recordOutcome(settlement);
        return;
      }

      if (runOf(pose) >= track.exitAt) {
        // The gate bonus is part of what the run carried, so the line is paid on the whole haul.
        loop.carry(ESCAPE_BONUS);
        const place = standings.placeOf(PLAYER_RACER_ID);
        const line = lineReading({
          barriers: [...gateAnnounced].filter((id) => !id.endsWith(":beaten")).length,
          // Winning a race of one is not a finish worth paying for.
          place: FIELD_SIZE > 1 ? place : 0,
          time: runTime,
          damageStage: Math.max(0, ...damage.zones().map((zone) => zone.stage)),
          armorSaves: armorSavesUsed,
          gates: track.gates.length,
          par: track.def.par,
        });
        const settlement = loop.settle("banked", line.multiplier);
        const key = ghostKey(event);
        const previousGhost = ghosts[key];
        if (event.metric === "time" && ghostRecording && (previousGhost === undefined || runTime < previousGhost.time)) {
          const ghost = ghostRecorder.take(runTime);
          if (saveGhost(key, ghost, storage)) ghosts = readGhosts(storage);
          else ghosts = { ...ghosts, [key]: ghost };
        }
        outcome = {
          kind: "won",
          time: runTime,
          partsOnExit: installed.length,
          nearMisses: nearMissCount,
          closestGap: Number.isFinite(closestGap) ? closestGap : 0,
          armorSaves: armorSavesUsed,
          zoneLabel: track.zoneAt(runOf(pose)).label,
          place,
          fieldSize: FIELD_SIZE,
          carried: settlement.haul,
          lineMultiplier: line.multiplier,
          lineNotes: line.notes,
          banked: settlement.banked,
          lost: settlement.lost,
          nextShift: shiftInfo(settlement.next.changeId),
          event: scoreEvent(true, place),
        };
        recordOutcome(settlement);
      }
    },
  };
}

export const ALL_PICKUP_COUNT = PICKUPS.length;
