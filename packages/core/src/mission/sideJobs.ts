import { pickUniform, pickWeighted } from "../random/pick";
import { seededRng } from "../random/rng";
import { createRaceState, everyoneFinishes, raceTrack, type RaceState } from "../game/race";

/** A place a side job can start or end: a kerb, a shop counter, a start line. `tags` say which kinds use it. */
export interface SideJobSpot {
  id: string;
  x: number;
  z: number;
  tags?: readonly string[];
}

/** An authored, ordered route a kind can run instead of drawing spots: the first point is the pickup or start line. */
export interface SideJobRoute {
  id: string;
  label?: string;
  points: readonly SideJobSpot[];
}

/** How a kind prices a job: `base + perMetre × distance`, clamped, plus `perSecondLeft` for each unused second. */
export interface SideJobFareDef {
  base: number;
  perMetre: number;
  min?: number;
  max?: number;
  /** Cash per second still on the clock at the final drop (default `0`). */
  perSecondLeft?: number;
}

/** How long a job allows: `slack + distance / speed` seconds, never below `min`. */
export interface SideJobDeadlineDef {
  /** Assumed average speed in metres per second. */
  speed: number;
  /** Seconds added on top of the drive time (default `10`). */
  slack?: number;
  min?: number;
  /** Seconds allowed to reach the pickup after accepting; omitted means no pickup clock. */
  pickup?: number;
}

/** A tip paid on top of the fare, scaled by how comfortable the ride stayed (comfort 0–100). */
export interface SideJobTipDef {
  /** Tip as a fraction of the fare at comfort 100. */
  max: number;
  /** Comfort below which no tip is paid (default `0`). */
  minComfort?: number;
}

/** Back-to-back jobs raise a bonus: `step × streak` of the fare, capped at `max`, if the next job is accepted within `window` seconds of the last payout. */
export interface SideJobStreakDef {
  step: number;
  max: number;
  window: number;
}

/** A cash stake the player puts up to accept, paid back as `stake × payouts[place - 1]` (a race purse). */
export interface SideJobWagerDef {
  stake: number;
  /** Multiplier of the stake per finishing place; a place past the list pays nothing. */
  payouts: readonly number[];
}

/** Makes a kind a street race run on {@link RaceState}: the job's drops are the checkpoints, the last one the finish. */
export interface SideJobRaceDef {
  /** Rival racers; the game drives a body for each id the view names and reports its position. */
  rivals: number;
  /** Checkpoint half-extent in metres (default `10`). */
  gateRadius?: number;
}

/** What a game hands a kind's comfort rule each tick while a job is on board. */
export interface SideJobComfortSample {
  dt: number;
  /** Player speed in metres per second. */
  speed: number;
  /** Whatever the game reports this tick: damage taken, wanted level, a crash flag. */
  facts: Readonly<Record<string, number | boolean>>;
}

/** One kind of side job declared as data: taxi fare, delivery, tow, ambulance run, street race. */
export interface SideJobKindDef {
  id: string;
  label: string;
  /** Spot tag pickups are drawn from (ignored when `routes` is set). */
  pickupTag?: string;
  /** Spot tag drops are drawn from (ignored when `routes` is set). */
  dropTag?: string;
  /** Drops per job (default `1`); more than one is a multi-drop route. */
  drops?: number;
  /** Fixed routes to draw from instead of spots. */
  routes?: readonly SideJobRoute[];
  /** Shortest and longest leg in metres when drawing spots (defaults `60` and `Infinity`). */
  minLeg?: number;
  maxLeg?: number;
  fare: SideJobFareDef;
  deadline: SideJobDeadlineDef;
  tip?: SideJobTipDef;
  streak?: SideJobStreakDef;
  wager?: SideJobWagerDef;
  race?: SideJobRaceDef;
  /** Comfort points lost this tick; the game's rule for crashes, hard driving or a chase. */
  comfortLoss?: (sample: SideJobComfortSample) => number;
  /** A job fails as `spoiled` once comfort reaches this (fragile cargo); omitted never fails on comfort. */
  failAtComfort?: number;
  /** Seconds after a job of this kind resolves before another is offered (default `0`). */
  cooldown?: number;
  /** Seconds an offer stays open (default `60`). */
  offerTtl?: number;
  /** Open offers of this kind at once (default `1`). */
  maxOffers?: number;
  /** Relative weight when `generate` draws which kind to offer (default `1`). */
  weight?: number;
  /** Arrival radius in metres (default `8`). */
  radius?: number;
  /** Speed at or under which the player counts as stopped, m/s (default `2`). */
  stopSpeed?: number;
  /** Seconds stopped at the pickup before the job boards (default `0`). */
  boardSeconds?: number;
}

/** A job on offer: where it starts, where it goes, and what it pays if run clean. */
export interface SideJobOffer {
  id: string;
  kindId: string;
  label: string;
  routeId: string | null;
  pickup: SideJobSpot;
  drops: readonly SideJobSpot[];
  /** Metres from pickup through every drop. */
  distance: number;
  /** The fare before time bonus, tip and streak. */
  fare: number;
  /** Seconds allowed from boarding to the final drop. */
  seconds: number;
  stake: number;
  /** Clock time the offer lapses. */
  expiresAt: number;
}

/** Where an accepted job stands. */
export type SideJobPhase = "pickup" | "en-route" | "paid" | "failed";

/** Why a job failed: the clock ran out, cargo was spoiled, a race placed out of the money, or the game's own reason. */
export type SideJobFailReason = "late" | "spoiled" | "placed" | (string & {});

/** One resolved job's settlement, for a receipt or pager. */
export interface SideJobReceipt {
  jobId: string;
  kindId: string;
  label: string;
  outcome: "paid" | "failed";
  reason: SideJobFailReason | null;
  fare: number;
  timeBonus: number;
  tip: number;
  streakBonus: number;
  /** What a wager returned (0 when lost or not a wager). */
  purse: number;
  /** Everything paid: fare, time bonus, tip, streak bonus and purse; `0` when failed unless a purse paid. */
  total: number;
  comfort: number;
  /** The streak after this job settled. */
  streak: number;
  /** Finishing place in a race, else `null`. */
  place: number | null;
}

/** An accepted job's live state. */
export interface SideJobActive {
  offer: SideJobOffer;
  phase: SideJobPhase;
  /** Index of the next drop. */
  leg: number;
  /** Seconds left on the current clock, or `null` when none runs. */
  timeLeft: number | null;
  comfort: number;
  /** Seconds the player has been stopped at the current target. */
  dwell: number;
  /** The streak this job would extend (count of prior consecutive paid jobs). */
  streak: number;
  racing: boolean;
}

/** Everything a side-job board stores as plain JSON. */
export interface SideJobsState {
  clock: number;
  rng: number;
  nextId: number;
  offers: SideJobOffer[];
  job: SideJobActive | null;
  receipt: SideJobReceipt | null;
  streak: number;
  lastPaidAt: number | null;
  /** Kind id → clock time it may offer again. */
  cooldowns: Record<string, number>;
}

/** What happened during one call, for cues, notices and audio. */
export type SideJobEvent =
  | { type: "offered"; offer: SideJobOffer }
  | { type: "expired"; offerId: string }
  | { type: "accepted"; jobId: string }
  | { type: "boarded"; jobId: string }
  | { type: "race-started"; jobId: string; rivals: readonly string[] }
  | { type: "leg"; jobId: string; leg: number; of: number }
  | { type: "paid"; receipt: SideJobReceipt }
  | { type: "failed"; receipt: SideJobReceipt };

/** The world as the game reports it each tick. */
export interface SideJobTickInput {
  /** Player position (x/z), or `null` while it has no body. */
  position: { x: number; z: number } | null;
  /** Player speed in metres per second. */
  speed?: number;
  facts?: Readonly<Record<string, number | boolean>>;
  /** Rival racer id → world position, while a race runs. */
  racers?: Readonly<Record<string, readonly [number, number, number]>>;
}

/** What a HUD shows for the job in hand. */
export interface SideJobView {
  jobId: string;
  kindId: string;
  label: string;
  phase: SideJobPhase;
  /** What the player is driving to. */
  target: SideJobSpot | null;
  targetRole: "pickup" | "dropoff" | "checkpoint" | "finish" | null;
  /** 1-based leg number among `legs` drops. */
  leg: number;
  legs: number;
  timeLeft: number | null;
  /** Metres from the last reported position to the target. */
  distance: number | null;
  fare: number;
  /** Fare + time bonus + tip + streak bonus if the job ended clean now. */
  fareSoFar: number;
  comfort: number;
  streak: number;
  stake: number;
  /** Rival racer ids while a race runs. */
  rivals: readonly string[];
  /** The player's place while a race runs. */
  place: number | null;
}

/** Options for {@link SideJobs.generate}. */
export interface SideJobGenerateOptions {
  /** Only these kinds (default every kind). */
  kinds?: readonly string[];
  /** Only pickups within `radius` metres of `at`, and at least `min` away. */
  near?: { at: { x: number; z: number }; radius: number; min?: number };
  /** Offers to try to add (default `1`). */
  count?: number;
}

/** Durable home for the board's state; `save` runs on each change a player can see, never per tick. */
export interface SideJobsPersistence {
  load?: () => SideJobsState | null;
  save: (state: SideJobsState) => void;
}

/** Configuration for {@link createSideJobs}. */
export interface SideJobsConfig {
  kinds: readonly SideJobKindDef[];
  /** Spots offers are drawn from. */
  spots?: readonly SideJobSpot[];
  /** Seed for offers (default `"side-jobs"`). */
  seed?: string | number;
  /** Racer id the player's position is filed under in a race (default `"player"`). */
  playerId?: string;
  persist?: SideJobsPersistence;
}

/** A side-job board: offers, the job in hand, the streak and the last receipt. */
export interface SideJobs {
  /** Draw new offers for kinds off cooldown and under their cap; same seed and calls, same offers. */
  generate(options?: SideJobGenerateOptions): SideJobEvent[];
  offers(): readonly SideJobOffer[];
  /** Take an offer. Returns `null` when the id is unknown or a job is already in hand. The game charges any `stake`. */
  accept(offerId: string): SideJobEvent[] | null;
  /** Advance the clock, expire offers and run the job in hand against the reported world. */
  tick(dt: number, input: SideJobTickInput): SideJobEvent[];
  /** End the job in hand as failed with the game's reason (busted, left the car, wrecked). */
  fail(reason: SideJobFailReason): SideJobEvent[];
  /** Drop every open offer (going off duty). */
  clearOffers(): void;
  /** Clear the last receipt. */
  dismiss(): void;
  job(): SideJobActive | null;
  receipt(): SideJobReceipt | null;
  view(): SideJobView | null;
  streak(): number;
  kind(id: string): SideJobKindDef | undefined;
  /** Change a kind's numbers during play; the id stays. */
  retune(kindId: string, patch: Partial<Omit<SideJobKindDef, "id">>): void;
  setSpots(spots: readonly SideJobSpot[]): void;
  snapshot(): SideJobsState;
  /** Put a saved state back. A race in progress returns to its start line, since race standings are not stored. */
  restore(next: SideJobsState): void;
}

/** The fare a kind charges for `distance` metres, before time bonus, tip and streak. */
export function sideJobFare(fare: SideJobFareDef, distance: number): number {
  const raw = fare.base + fare.perMetre * Math.max(0, distance);
  return Math.round(Math.min(fare.max ?? Infinity, Math.max(fare.min ?? 0, raw)));
}

/** Seconds a kind allows for `distance` metres. */
export function sideJobDeadline(deadline: SideJobDeadlineDef, distance: number): number {
  const speed = deadline.speed > 0 ? deadline.speed : 1;
  return Math.ceil(Math.max(deadline.min ?? 0, (deadline.slack ?? 10) + Math.max(0, distance) / speed));
}

/** The tip for a fare at a comfort level (0–100). */
export function sideJobTip(tip: SideJobTipDef | undefined, fare: number, comfort: number): number {
  if (tip === undefined || comfort < (tip.minComfort ?? 0)) return 0;
  return Math.round(fare * tip.max * Math.max(0, Math.min(100, comfort)) / 100);
}

/** The streak bonus a fare earns when `streak` jobs were paid back to back before it. */
export function sideJobStreakBonus(streak: SideJobStreakDef | undefined, fare: number, count: number): number {
  if (streak === undefined || count <= 0) return 0;
  return Math.round(fare * Math.min(streak.max, streak.step * count));
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function routeDistance(pickup: SideJobSpot, drops: readonly SideJobSpot[]): number {
  let total = 0;
  let at: SideJobSpot = pickup;
  for (const drop of drops) {
    total += dist(at, drop);
    at = drop;
  }
  return total;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Side jobs any open-world game runs between story work: taxi fares, deliveries, tows, ambulance runs
 * and street races, each a kind declared as data. Offers are drawn from game-supplied spots (or
 * authored routes) with a seeded stream, so the same seed and calls replay the same board. An accepted
 * job walks pickup → each drop → paid or failed, against a clock of `slack + distance / speed`; arrival
 * means inside `radius` and stopped. The fare is `base + perMetre × distance` plus a bonus per second
 * left, a comfort-scaled tip (the game's `comfortLoss` rule says what a crash or a chase costs) and a
 * streak bonus for back-to-back jobs. A kind with `race` runs its drops as checkpoints on
 * {@link RaceState} against rivals whose positions the game reports, and a `wager` pays the stake back
 * by place. The board keeps its own clock, so pausing the game pauses every deadline.
 *
 * @capability side-jobs offer and run repeatable side jobs (fares, deliveries, races) with fare math, deadlines, tips, streaks and wagers
 */
export function createSideJobs(config: SideJobsConfig): SideJobs {
  const kinds = new Map<string, SideJobKindDef>();
  for (const kind of config.kinds) {
    if (kinds.has(kind.id)) throw new Error(`side-job kind "${kind.id}" is declared twice`);
    kinds.set(kind.id, { ...kind });
  }
  const playerId = config.playerId ?? "player";
  const rng = seededRng(config.seed ?? "side-jobs");
  let spots: readonly SideJobSpot[] = config.spots ?? [];
  let state: SideJobsState = {
    clock: 0,
    rng: rng.state(),
    nextId: 1,
    offers: [],
    job: null,
    receipt: null,
    streak: 0,
    lastPaidAt: null,
    cooldowns: {},
  };
  let race: RaceState | null = null;
  let lastPosition: { x: number; z: number } | null = null;

  function persist(): void {
    if (config.persist === undefined) return;
    try {
      config.persist.save(snapshot());
    } catch {
      // A failed write must not stop play.
    }
  }

  function snapshot(): SideJobsState {
    return clone({ ...state, rng: rng.state() });
  }

  function kindOf(id: string): SideJobKindDef {
    const kind = kinds.get(id);
    if (kind === undefined) throw new Error(`unknown side-job kind "${id}"`);
    return kind;
  }

  function rivalsOf(job: SideJobActive): string[] {
    const kind = kindOf(job.offer.kindId);
    return Array.from({ length: kind.race?.rivals ?? 0 }, (_, i) => `${job.offer.id}:rival:${i}`);
  }

  function drawOffer(kind: SideJobKindDef, near: SideJobGenerateOptions["near"]): SideJobOffer | null {
    const nearOk = (spot: SideJobSpot) =>
      near === undefined || (dist(spot, near.at) <= near.radius && dist(spot, near.at) >= (near.min ?? 0));
    let pickup: SideJobSpot | undefined;
    let drops: SideJobSpot[] = [];
    let routeId: string | null = null;
    let label = kind.label;
    if (kind.routes !== undefined && kind.routes.length > 0) {
      const route = pickUniform(rng, kind.routes.filter((r) => r.points.length >= 2 && nearOk(r.points[0]!)));
      if (route === undefined) return null;
      pickup = route.points[0]!;
      drops = route.points.slice(1);
      routeId = route.id;
      label = route.label ?? kind.label;
    } else {
      const minLeg = kind.minLeg ?? 60;
      const maxLeg = kind.maxLeg ?? Infinity;
      const busy = new Set(state.offers.map((o) => o.pickup.id));
      if (state.job !== null) busy.add(state.job.offer.pickup.id);
      pickup = pickUniform(
        rng,
        spots.filter((s) => (kind.pickupTag === undefined || s.tags?.includes(kind.pickupTag)) && !busy.has(s.id) && nearOk(s)),
      );
      if (pickup === undefined) return null;
      let at = pickup;
      const used = new Set([pickup.id]);
      for (let i = 0; i < Math.max(1, kind.drops ?? 1); i += 1) {
        const from = at;
        const next = pickUniform(
          rng,
          spots.filter((s) => {
            if (used.has(s.id) || (kind.dropTag !== undefined && !s.tags?.includes(kind.dropTag))) return false;
            const d = dist(from, s);
            return d >= minLeg && d <= maxLeg;
          }),
        );
        if (next === undefined) return null;
        drops.push(next);
        used.add(next.id);
        at = next;
      }
    }
    const distance = Math.round(routeDistance(pickup, drops));
    const offer: SideJobOffer = {
      id: `${kind.id}-${state.nextId}`,
      kindId: kind.id,
      label,
      routeId,
      pickup: clone(pickup),
      drops: clone(drops),
      distance,
      fare: sideJobFare(kind.fare, distance),
      seconds: sideJobDeadline(kind.deadline, distance),
      stake: kind.wager?.stake ?? 0,
      expiresAt: state.clock + (kind.offerTtl ?? 60),
    };
    state.nextId += 1;
    return offer;
  }

  function settle(job: SideJobActive, outcome: "paid" | "failed", reason: SideJobFailReason | null, place: number | null): SideJobEvent[] {
    const kind = kindOf(job.offer.kindId);
    const purse = kind.wager !== undefined && place !== null ? Math.round(kind.wager.stake * (kind.wager.payouts[place - 1] ?? 0)) : 0;
    const clean = outcome === "paid";
    const fare = clean ? job.offer.fare : 0;
    const timeBonus = clean ? Math.round((kind.fare.perSecondLeft ?? 0) * Math.max(0, job.timeLeft ?? 0)) : 0;
    const tip = clean ? sideJobTip(kind.tip, job.offer.fare, job.comfort) : 0;
    const streakBonus = clean ? sideJobStreakBonus(kind.streak, job.offer.fare, job.streak) : 0;
    if (clean && kind.streak !== undefined) {
      state.streak = job.streak + 1;
      state.lastPaidAt = state.clock;
    } else if (!clean) {
      state.streak = 0;
    }
    const receipt: SideJobReceipt = {
      jobId: job.offer.id,
      kindId: kind.id,
      label: job.offer.label,
      outcome,
      reason,
      fare,
      timeBonus,
      tip,
      streakBonus,
      purse,
      total: fare + timeBonus + tip + streakBonus + purse,
      comfort: Math.round(job.comfort),
      streak: state.streak,
      place,
    };
    state.job = null;
    state.receipt = receipt;
    if ((kind.cooldown ?? 0) > 0) state.cooldowns[kind.id] = state.clock + kind.cooldown!;
    race = null;
    persist();
    return [{ type: outcome, receipt }];
  }

  function startRace(job: SideJobActive): SideJobEvent[] {
    const kind = kindOf(job.offer.kindId);
    const half = kind.race?.gateRadius ?? 10;
    const track = raceTrack({
      checkpoints: job.offer.drops.map((spot, i) => ({ id: `cp_${i}`, center: [spot.x, 0, spot.z] as const, half: [half, 1e6, half] as const })),
    });
    race = createRaceState({ track, win: everyoneFinishes() });
    race.addRacer(playerId, state.clock);
    const rivals = rivalsOf(job);
    for (const id of rivals) race.addRacer(id, state.clock);
    job.racing = true;
    return [{ type: "race-started", jobId: job.offer.id, rivals }];
  }

  function placeOf(id: string): number | null {
    if (race === null) return null;
    return race.standings().findIndex((s) => s.racerId === id) + 1 || null;
  }

  function tickJob(dt: number, input: SideJobTickInput): SideJobEvent[] {
    const job = state.job;
    if (job === null) return [];
    const kind = kindOf(job.offer.kindId);
    const events: SideJobEvent[] = [];
    if (job.timeLeft !== null) {
      job.timeLeft = Math.max(0, job.timeLeft - dt);
      if (job.timeLeft <= 0) return settle(job, "failed", "late", null);
    }
    const speed = input.speed ?? 0;
    if (job.phase === "en-route" && kind.comfortLoss !== undefined) {
      const loss = kind.comfortLoss({ dt, speed, facts: input.facts ?? {} });
      if (Number.isFinite(loss) && loss > 0) job.comfort = Math.max(0, job.comfort - loss);
      if (kind.failAtComfort !== undefined && job.comfort <= kind.failAtComfort) return settle(job, "failed", "spoiled", null);
    }
    const at = input.position;
    if (job.racing && race !== null) {
      const positions: Record<string, readonly [number, number, number]> = { ...(input.racers ?? {}) };
      if (at !== null) positions[playerId] = [at.x, 0, at.z];
      race.update(state.clock, positions);
      const me = race.progressOf(playerId);
      if (me !== null) job.leg = Math.min(job.offer.drops.length - 1, me.progress);
      if (me?.finished === true) {
        const place = placeOf(playerId);
        const paid = kind.wager !== undefined && place !== null && (kind.wager.payouts[place - 1] ?? 0) > 0;
        return settle(job, paid || kind.wager === undefined ? "paid" : "failed", paid || kind.wager === undefined ? null : "placed", place);
      }
      return events;
    }
    if (at === null) return events;
    const target = job.phase === "pickup" ? job.offer.pickup : job.offer.drops[job.leg];
    if (target === undefined) return events;
    const inside = dist(at, target) <= (kind.radius ?? 8) && speed <= (kind.stopSpeed ?? 2);
    job.dwell = inside ? job.dwell + dt : 0;
    if (!inside) return events;
    if (job.phase === "pickup") {
      if (job.dwell < (kind.boardSeconds ?? 0)) return events;
      job.phase = "en-route";
      job.dwell = 0;
      job.timeLeft = job.offer.seconds;
      events.push({ type: "boarded", jobId: job.offer.id });
      if (kind.race !== undefined) events.push(...startRace(job));
      persist();
      return events;
    }
    job.leg += 1;
    job.dwell = 0;
    events.push({ type: "leg", jobId: job.offer.id, leg: job.leg, of: job.offer.drops.length });
    if (job.leg >= job.offer.drops.length) {
      job.leg = job.offer.drops.length - 1;
      return [...events, ...settle(job, "paid", null, null)];
    }
    persist();
    return events;
  }

  function restoreState(next: SideJobsState): void {
    state = clone(next);
    rng.restore(state.rng);
    race = null;
    const job = state.job;
    if (job !== null && job.racing) {
      job.racing = false;
      job.phase = "pickup";
      job.leg = 0;
      job.dwell = 0;
      job.timeLeft = kindOf(job.offer.kindId).deadline.pickup ?? null;
    }
  }

  const saved = config.persist?.load?.();
  if (saved != null) restoreState(saved);

  return {
    generate(options = {}) {
      const events: SideJobEvent[] = [];
      const wanted = options.kinds === undefined ? null : new Set(options.kinds);
      for (let n = 0; n < Math.max(1, options.count ?? 1); n += 1) {
        const eligible = [...kinds.values()].filter(
          (kind) =>
            (wanted === null || wanted.has(kind.id)) &&
            (state.cooldowns[kind.id] ?? 0) <= state.clock &&
            state.offers.filter((o) => o.kindId === kind.id).length < (kind.maxOffers ?? 1),
        );
        const kind = pickWeighted(rng, eligible, (k) => k.weight ?? 1);
        if (kind === undefined) break;
        const offer = drawOffer(kind, options.near);
        if (offer === null) continue;
        state.offers.push(offer);
        events.push({ type: "offered", offer: clone(offer) });
      }
      if (events.length > 0) persist();
      return events;
    },
    offers: () => clone(state.offers),
    accept(offerId) {
      if (state.job !== null) return null;
      const offer = state.offers.find((o) => o.id === offerId);
      if (offer === undefined) return null;
      const kind = kindOf(offer.kindId);
      state.offers = state.offers.filter((o) => o.id !== offerId);
      const keepsStreak = kind.streak !== undefined && state.lastPaidAt !== null && state.clock - state.lastPaidAt <= kind.streak.window;
      if (!keepsStreak) state.streak = 0;
      state.job = {
        offer,
        phase: "pickup",
        leg: 0,
        timeLeft: kind.deadline.pickup ?? null,
        comfort: 100,
        dwell: 0,
        streak: state.streak,
        racing: false,
      };
      state.receipt = null;
      persist();
      return [{ type: "accepted", jobId: offer.id }];
    },
    tick(dt, input) {
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
      state.clock += step;
      if (input.position !== null) lastPosition = { x: input.position.x, z: input.position.z };
      const events: SideJobEvent[] = [];
      const live = state.offers.filter((o) => o.expiresAt > state.clock);
      if (live.length !== state.offers.length) {
        for (const o of state.offers) if (o.expiresAt <= state.clock) events.push({ type: "expired", offerId: o.id });
        state.offers = live;
        persist();
      }
      events.push(...tickJob(step, input));
      return events;
    },
    fail(reason) {
      return state.job === null ? [] : settle(state.job, "failed", reason, null);
    },
    clearOffers() {
      if (state.offers.length === 0) return;
      state.offers = [];
      persist();
    },
    dismiss() {
      state.receipt = null;
      persist();
    },
    job: () => (state.job === null ? null : clone(state.job)),
    receipt: () => (state.receipt === null ? null : clone(state.receipt)),
    view() {
      const job = state.job;
      if (job === null) return null;
      const kind = kindOf(job.offer.kindId);
      const target = job.phase === "pickup" ? job.offer.pickup : job.offer.drops[job.leg] ?? null;
      const last = job.leg >= job.offer.drops.length - 1;
      const role = job.phase === "pickup" ? "pickup" : kind.race !== undefined ? (last ? "finish" : "checkpoint") : "dropoff";
      const enRoute = job.phase === "en-route";
      const fareSoFar = job.offer.fare
        + (enRoute ? Math.round((kind.fare.perSecondLeft ?? 0) * Math.max(0, job.timeLeft ?? 0)) : 0)
        + sideJobTip(kind.tip, job.offer.fare, job.comfort)
        + sideJobStreakBonus(kind.streak, job.offer.fare, job.streak);
      return {
        jobId: job.offer.id,
        kindId: kind.id,
        label: job.offer.label,
        phase: job.phase,
        target: target === null ? null : clone(target),
        targetRole: target === null ? null : role,
        leg: job.phase === "pickup" ? 0 : job.leg + 1,
        legs: job.offer.drops.length,
        timeLeft: job.timeLeft,
        distance: target === null || lastPosition === null ? null : Math.round(dist(lastPosition, target)),
        fare: job.offer.fare,
        fareSoFar,
        comfort: Math.round(job.comfort),
        streak: job.streak,
        stake: job.offer.stake,
        rivals: job.racing ? rivalsOf(job) : [],
        place: job.racing ? placeOf(playerId) : null,
      };
    },
    streak: () => state.streak,
    kind: (id) => kinds.get(id),
    retune(kindId, patch) {
      const kind = kindOf(kindId);
      kinds.set(kindId, { ...kind, ...patch, id: kindId });
    },
    setSpots(next) {
      spots = [...next];
    },
    snapshot,
    restore(next) {
      restoreState(next);
      persist();
    },
  };
}
