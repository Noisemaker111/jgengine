/**
 * One world model a game's systems read instead of each keeping its own copy. People, places,
 * factions and things carry facts; world events ripple into those facts; jobs are missions that
 * facts unlock and that write a story beat back when they finish. Map blips, phone contacts,
 * dialogue lines, "what next", mission facts and resident reactions are reads of the same state.
 *
 * The state is one serializable record behind an injected storage, so a game that keeps it in a
 * `defineStore` saves and replicates it with the world snapshot and nothing else needs a save path.
 */

import {
  createMissionRuntime,
  validateMissionCatalog,
  type MissionDef,
  type MissionEvent,
  type MissionRewards,
  type MissionRuntime,
  type MissionRuntimeSnapshot,
  type MissionTickInput,
  type MissionView,
} from "../mission/mission";
import type { ScenePoint3 } from "../world/sceneShapes";

/** A fact's value: a number that moves, a name (an owner, a place) or a flag. */
export type WorldFactValue = number | string | boolean;

/** A fact that settles back toward `rest` by `decay` per second, clamped to `[min, max]`. */
export interface WorldFactSpec {
  value: WorldFactValue;
  rest?: number;
  decay?: number;
  min?: number;
  max?: number;
}

/** Facts a subject starts with: a plain value, or a {@link WorldFactSpec} for one that calms down. */
export type WorldFactsDecl = Readonly<Record<string, WorldFactValue | WorldFactSpec>>;

/**
 * A number fact that drifts back to `rest` (default its start) at `perSecond`, kept within 0-100
 * unless the bounds say otherwise.
 *
 * @capability world-model declare a fact that calms back toward its resting value over time
 */
export function calm(value: number, perSecond: number, bounds: { rest?: number; min?: number; max?: number } = {}): WorldFactSpec {
  return { value, decay: perSecond, rest: bounds.rest ?? value, min: bounds.min ?? 0, max: bounds.max ?? 100 };
}

/** A test on one fact: equal to a value, or a numeric band, optionally negated. */
export type WorldCondition = WorldFactValue | { atLeast?: number; atMost?: number; is?: WorldFactValue; not?: boolean };
/** Every keyed fact must pass. `jobs.<id>` reads a job's status (`done`, `active`, `failed`). */
export type WorldConditions = Readonly<Record<string, WorldCondition>>;
/** Fact changes: a number adds, a string or flag sets. Keys are relative to the subject the change lands on. */
export type WorldChanges = Readonly<Record<string, WorldFactValue>>;

/** What a map draws for a subject. */
export interface WorldBlipDecl {
  label?: string;
  icon?: string;
  /** Only shown while these hold. */
  when?: WorldConditions;
}

interface SubjectDecl {
  label?: string;
  facts?: WorldFactsDecl;
  blip?: boolean | WorldBlipDecl;
}

/** A faction: a group with shared facts (mood, money) that places and things can belong to. */
export interface WorldFactionDecl extends SubjectDecl {}

/** A place in the world: a marker or position with a radius, an owner faction and its own facts. */
export interface WorldPlaceDecl extends SubjectDecl {
  /** Marker id the position comes from; or give `position`. */
  marker?: string;
  position?: readonly [number, number];
  /** How far from the position a world event still counts as here (default 30). */
  radius?: number;
  /** Faction that holds the place; stored as the `owner` fact so a beat can change hands. */
  owner?: string;
}

/** One thing a person can say, shown while its conditions hold; the first that holds is current. */
export interface WorldLine {
  text: string;
  when?: WorldConditions;
}

/** A person: where they are, whether they are on the phone, and what they say as the world changes. */
export interface WorldPersonDecl extends SubjectDecl {
  name: string;
  faction?: string;
  /** Place the person is found at; stored as the `at` fact. */
  at?: string;
  /** In the phone's contact list once `known` is true (default true). */
  phone?: boolean;
  known?: boolean;
  says?: readonly WorldLine[];
}

/** Anything owned and located that is not a person: a car, a tower, a ride, a server rack. */
export interface WorldThingDecl extends SubjectDecl {
  owner?: string;
  at?: string;
}

/** A story or side job: a mission the giver offers once its gates hold, and the beat it leaves behind. */
export interface WorldJobDecl {
  title: string;
  mission: MissionDef;
  giver?: string;
  kind?: "story" | "side";
  /** Story order: the lowest available act and declaration order lead `next()`. */
  act?: number;
  requires?: readonly string[];
  when?: WorldConditions;
  /** Absolute `subject.fact` changes applied on completion. */
  beat?: WorldChanges;
  /** Where the job starts when it has no giver, or the giver's place is wrong for it. */
  at?: string;
  /** A job that can be run again after it is done (a side activity). */
  repeatable?: boolean;
  /** One line said when the job is offered. */
  pitch?: string;
}

/** How one kind of world event spreads. */
export interface WorldRippleDecl {
  /** Changes on the place the event happened at. */
  place?: WorldChanges;
  /** Changes on the faction that owns that place. */
  owner?: WorldChanges;
  /** Changes on the faction the event names. */
  faction?: WorldChanges;
  /** Changes on every person found at that place. */
  people?: WorldChanges;
  /** Absolute `subject.fact` changes. */
  world?: WorldChanges;
  /** Named amounts the game wires to its own systems (heat, traffic), scaled with the event. */
  out?: Readonly<Record<string, number>>;
  /** A line for the world log and news feed; `{place}` is replaced by the place label. */
  note?: string;
}

/** Everything a game declares about its world: factions, places, people, things, jobs and ripples. */
export interface WorldModelDecl {
  factions?: Readonly<Record<string, WorldFactionDecl>>;
  places?: Readonly<Record<string, WorldPlaceDecl>>;
  people?: Readonly<Record<string, WorldPersonDecl>>;
  things?: Readonly<Record<string, WorldThingDecl>>;
  jobs?: Readonly<Record<string, WorldJobDecl>>;
  ripples?: Readonly<Record<string, WorldRippleDecl>>;
  /** Facts not tied to one subject (`story.act`), keyed absolutely. */
  facts?: WorldFactsDecl;
}

/** A checked declaration. */
export interface WorldModelDef extends WorldModelDecl {
  readonly subjects: ReadonlyMap<string, "faction" | "place" | "person" | "thing">;
}

/** Something that happened, reported by the game. */
export interface WorldEvent {
  kind: string;
  /** Where it happened; resolved to the nearest place within its radius. */
  at?: readonly [number, number, number] | readonly [number, number];
  place?: string;
  by?: string;
  faction?: string;
  /** Multiplies every numeric change and output (default 1). */
  scale?: number;
}

/** One line of the world's recent history. */
export interface WorldLogEntry {
  at: number;
  kind: string;
  place: string | null;
  text: string;
}

/** Where a job stands for the player right now. */
export type WorldJobStatus = "locked" | "available" | "active" | "done" | "failed";

/** The saved form of a world model: facts, live mission and news log. */
export interface WorldModelState {
  time: number;
  facts: Record<string, WorldFactValue>;
  activeJob: string | null;
  mission: MissionRuntimeSnapshot | null;
  log: WorldLogEntry[];
}

/** Where a world model keeps its state, usually a store so saves and co-op sync come for free. */
export interface WorldModelStorage {
  read(): WorldModelState | undefined;
  write(next: WorldModelState): void;
}

/** Hooks that connect a world model to a game: markers, storage, rewards and outputs such as heat. */
export interface WorldModelOptions {
  /** Marker positions by id, for places that name a `marker` and for mission objectives. */
  markers?: Readonly<Record<string, ScenePoint3>>;
  storage?: WorldModelStorage;
  /** Pay a job's mission rewards (cash, items) through the game's own wallet. */
  onReward?(rewards: MissionRewards, jobId: string): void;
  /** Called with each named ripple output, e.g. `heat`. */
  onOutput?(name: string, amount: number, event: WorldEvent): void;
  /** Mission actor id for `pursue` objectives that name no pursuer. */
  defaultPursuer?: string;
  logSize?: number;
}

/** A job as menus, the phone and dialogue show it. */
export interface WorldJobView {
  id: string;
  title: string;
  kind: "story" | "side";
  act: number;
  giver: string | null;
  status: WorldJobStatus;
  pitch: string | null;
  /** Where the job starts. */
  position: readonly [number, number] | null;
}

/** A phone contact: a known person with their current line and the jobs they offer. */
export interface WorldContact {
  id: string;
  name: string;
  faction: string | null;
  line: string | null;
  jobs: readonly WorldJobView[];
}

/** One thing to draw on a map: a place, person, thing, open job or the live objective. */
export interface WorldBlip {
  id: string;
  kind: "place" | "person" | "thing" | "job" | "objective";
  label: string;
  icon: string | null;
  x: number;
  z: number;
}

/** The one thing the player should do next, with where to go. */
export interface WorldNext {
  text: string;
  jobId: string | null;
  target: readonly [number, number] | null;
}

/** A job moved, as `tick` and `startJob` report it. */
export type WorldJobEvent =
  | { kind: "job-started"; jobId: string }
  | { kind: "job-done"; jobId: string; beat: WorldChanges | null }
  | { kind: "job-failed"; jobId: string; reason: string };

/** What changed during one tick: jobs finished or failed and objectives cleared. */
export interface WorldTickResult {
  mission: readonly MissionEvent[];
  jobs: readonly WorldJobEvent[];
}

/** A live world: facts, events that ripple, jobs, and the views every screen reads. */
export interface WorldModel {
  readonly def: WorldModelDef;
  fact(key: string): WorldFactValue | undefined;
  num(key: string): number;
  facts(): Readonly<Record<string, WorldFactValue>>;
  /** Apply absolute `subject.fact` changes (numbers add, others set). */
  change(changes: WorldChanges, scale?: number): void;
  set(key: string, value: WorldFactValue): void;
  test(conditions: WorldConditions | undefined): boolean;
  placeAt(x: number, z: number): string | null;
  position(subject: string): readonly [number, number] | null;
  emit(event: WorldEvent): WorldLogEntry | null;
  tick(dt: number, input?: MissionTickInput): WorldTickResult;
  jobs(): readonly WorldJobView[];
  job(id: string): WorldJobView | null;
  startJob(id: string): WorldJobEvent | null;
  signal(objectiveId: string): WorldTickResult;
  abandonJob(): void;
  missionView(): MissionView | null;
  says(person: string): readonly string[];
  contacts(): readonly WorldContact[];
  blips(): readonly WorldBlip[];
  next(): WorldNext | null;
  log(): readonly WorldLogEntry[];
  snapshot(): WorldModelState;
  restore(next: WorldModelState): void;
}

function issue(message: string): never {
  throw new Error(`world model: ${message}`);
}

/**
 * Check a world declaration once: subject ids unique across kinds, owners and factions declared,
 * people at declared places, job givers, requirements and missions valid.
 *
 * @capability world-model one declarative world of people, places, factions, things, jobs and ripples
 */
export function defineWorldModel(decl: WorldModelDecl): WorldModelDef {
  const subjects = new Map<string, "faction" | "place" | "person" | "thing">();
  const add = (kind: "faction" | "place" | "person" | "thing", ids: Iterable<string>) => {
    for (const id of ids) {
      if (id.includes(".")) issue(`subject "${id}" may not contain a dot`);
      if (id === "jobs") issue(`"jobs" is reserved for job status facts`);
      if (subjects.has(id)) issue(`subject "${id}" is declared twice`);
      subjects.set(id, kind);
    }
  };
  add("faction", Object.keys(decl.factions ?? {}));
  add("place", Object.keys(decl.places ?? {}));
  add("person", Object.keys(decl.people ?? {}));
  add("thing", Object.keys(decl.things ?? {}));
  const is = (id: string | undefined, kind: string) => id === undefined || id === "player" || subjects.get(id) === kind;
  for (const [id, place] of Object.entries(decl.places ?? {})) {
    if (!is(place.owner, "faction")) issue(`place "${id}" owner "${place.owner}" is not a faction`);
  }
  for (const [id, person] of Object.entries(decl.people ?? {})) {
    if (!is(person.faction, "faction")) issue(`person "${id}" faction "${person.faction}" is not a faction`);
    if (!is(person.at, "place")) issue(`person "${id}" is at unknown place "${person.at}"`);
  }
  const jobs = decl.jobs ?? {};
  for (const [id, job] of Object.entries(jobs)) {
    if (!is(job.giver, "person")) issue(`job "${id}" giver "${job.giver}" is not a person`);
    if (!is(job.at, "place")) issue(`job "${id}" starts at unknown place "${job.at}"`);
    for (const need of job.requires ?? []) if (jobs[need] === undefined) issue(`job "${id}" requires unknown job "${need}"`);
  }
  const missions = Object.values(jobs).map((job) => job.mission);
  const errors = validateMissionCatalog(missions).filter((entry) => entry.severity === "error");
  if (errors.length > 0) issue(errors.map((entry) => entry.message).join("; "));
  return { ...decl, subjects };
}

function specOf(value: WorldFactValue | WorldFactSpec): WorldFactSpec {
  return typeof value === "object" ? value : { value };
}

function initialFacts(def: WorldModelDef): { facts: Record<string, WorldFactValue>; specs: Map<string, WorldFactSpec> } {
  const facts: Record<string, WorldFactValue> = {};
  const specs = new Map<string, WorldFactSpec>();
  const put = (key: string, raw: WorldFactValue | WorldFactSpec) => {
    const spec = specOf(raw);
    facts[key] = spec.value;
    if (spec.decay !== undefined || spec.min !== undefined || spec.max !== undefined) specs.set(key, spec);
  };
  const subject = (id: string, decl: SubjectDecl) => {
    for (const [fact, raw] of Object.entries(decl.facts ?? {})) put(`${id}.${fact}`, raw);
  };
  for (const [id, decl] of Object.entries(def.factions ?? {})) subject(id, decl);
  for (const [id, decl] of Object.entries(def.places ?? {})) {
    subject(id, decl);
    if (decl.owner !== undefined) facts[`${id}.owner`] = decl.owner;
  }
  for (const [id, decl] of Object.entries(def.people ?? {})) {
    subject(id, decl);
    if (decl.at !== undefined) facts[`${id}.at`] = decl.at;
    facts[`${id}.known`] = decl.known ?? true;
  }
  for (const [id, decl] of Object.entries(def.things ?? {})) {
    subject(id, decl);
    if (decl.owner !== undefined) facts[`${id}.owner`] = decl.owner;
    if (decl.at !== undefined) facts[`${id}.at`] = decl.at;
  }
  for (const [key, raw] of Object.entries(def.facts ?? {})) put(key, raw);
  return { facts, specs };
}

function passes(value: WorldFactValue | undefined, condition: WorldCondition): boolean {
  if (typeof condition !== "object") return value === condition;
  let ok = true;
  if (condition.is !== undefined) ok = value === condition.is;
  if (ok && condition.atLeast !== undefined) ok = typeof value === "number" && value >= condition.atLeast;
  if (ok && condition.atMost !== undefined) ok = typeof value === "number" && value <= condition.atMost;
  return condition.not === true ? !ok : ok;
}

const DECAY_STEP = 0.25;

/**
 * Run a declared world: facts that ripple and calm, jobs on the shared mission machine, and every
 * view a HUD, phone, map, dialogue or resident needs, all over one serializable state.
 *
 * @capability world-model one declarative world of people, places, factions, things, jobs and ripples
 */
export function createWorldModel(def: WorldModelDef, options: WorldModelOptions = {}): WorldModel {
  const { facts: startFacts, specs } = initialFacts(def);
  const markers = options.markers ?? {};
  const logSize = options.logSize ?? 24;
  const jobs = def.jobs ?? {};
  const jobIds = Object.keys(jobs);
  const missionToJob = new Map(jobIds.map((id) => [jobs[id]!.mission.id, id]));
  const fresh = (): WorldModelState => ({ time: 0, facts: { ...startFacts }, activeJob: null, mission: null, log: [] });
  let local: WorldModelState = fresh();
  const storage: WorldModelStorage = options.storage ?? { read: () => local, write: (next) => { local = next; } };
  const runtime: MissionRuntime = createMissionRuntime({
    missions: jobIds.map((id) => jobs[id]!.mission),
    markers,
    ...(options.defaultPursuer !== undefined ? { defaultPursuer: options.defaultPursuer } : {}),
  });
  let restoredFrom: MissionRuntimeSnapshot | null | undefined;
  let decayClock = 0;

  const state = (): WorldModelState => {
    const current = storage.read() ?? fresh();
    // A save load or a replicated host write swaps the stored mission under the runtime; follow it.
    if (current.mission !== restoredFrom) {
      restoredFrom = current.mission;
      if (current.mission === null) runtime.abandon();
      else runtime.restore(current.mission);
    }
    return current;
  };
  const write = (next: WorldModelState) => {
    restoredFrom = next.mission;
    storage.write(next);
  };

  const placePosition = (id: string): readonly [number, number] | null => {
    const place = def.places?.[id];
    if (place === undefined) return null;
    if (place.position !== undefined) return place.position;
    const marker = place.marker === undefined ? undefined : markers[place.marker];
    return marker === undefined ? null : [marker.x, marker.z];
  };
  const position = (subject: string): readonly [number, number] | null => {
    const kind = def.subjects.get(subject);
    if (kind === "place") return placePosition(subject);
    if (kind === "person" || kind === "thing") {
      const at = state().facts[`${subject}.at`];
      return typeof at === "string" ? placePosition(at) : null;
    }
    return null;
  };

  const applyInto = (facts: Record<string, WorldFactValue>, key: string, value: WorldFactValue, scale: number) => {
    const before = facts[key];
    let next: WorldFactValue = value;
    if (typeof value === "number") {
      next = (typeof before === "number" ? before : 0) + value * scale;
      const spec = specs.get(key);
      if (spec?.min !== undefined) next = Math.max(spec.min, next);
      if (spec?.max !== undefined) next = Math.min(spec.max, next);
    }
    facts[key] = next;
  };
  const changeAll = (facts: Record<string, WorldFactValue>, prefix: string, changes: WorldChanges | undefined, scale: number) => {
    if (changes === undefined) return;
    for (const [fact, value] of Object.entries(changes)) applyInto(facts, prefix === "" ? fact : `${prefix}.${fact}`, value, scale);
  };

  const test = (conditions: WorldConditions | undefined, facts = state().facts): boolean => {
    if (conditions === undefined) return true;
    for (const [key, condition] of Object.entries(conditions)) if (!passes(facts[key], condition)) return false;
    return true;
  };

  const placeAt = (x: number, z: number): string | null => {
    let best: string | null = null;
    let bestDistance = Infinity;
    for (const [id, place] of Object.entries(def.places ?? {})) {
      const at = placePosition(id);
      if (at === null) continue;
      const distance = Math.hypot(at[0] - x, at[1] - z);
      if (distance <= (place.radius ?? 30) && distance < bestDistance) {
        best = id;
        bestDistance = distance;
      }
    }
    return best;
  };

  const label = (id: string): string => {
    const kind = def.subjects.get(id);
    if (kind === "place") return def.places?.[id]?.label ?? id;
    if (kind === "person") return def.people?.[id]?.name ?? id;
    if (kind === "faction") return def.factions?.[id]?.label ?? id;
    return def.things?.[id]?.label ?? id;
  };

  const pushLog = (current: WorldModelState, entry: WorldLogEntry): WorldLogEntry[] => {
    const log = [...current.log, entry];
    return log.length > logSize ? log.slice(log.length - logSize) : log;
  };

  const jobStatus = (id: string, current = state()): WorldJobStatus => {
    const job = jobs[id]!;
    if (current.activeJob === id) return "active";
    const recorded = current.facts[`jobs.${id}`];
    if (recorded === "done" && job.repeatable !== true) return "done";
    const open = (job.requires ?? []).every((need) => current.facts[`jobs.${need}`] === "done") && test(job.when, current.facts);
    if (!open) return "locked";
    return recorded === "failed" ? "failed" : "available";
  };
  const jobPosition = (job: WorldJobDecl): readonly [number, number] | null => {
    if (job.at !== undefined) return placePosition(job.at);
    return job.giver === undefined ? null : position(job.giver);
  };
  const jobView = (id: string, current = state()): WorldJobView => {
    const job = jobs[id]!;
    return {
      id,
      title: job.title,
      kind: job.kind ?? "story",
      act: job.act ?? 0,
      giver: job.giver ?? null,
      status: jobStatus(id, current),
      pitch: job.pitch ?? null,
      position: jobPosition(job),
    };
  };

  const settleMission = (events: readonly MissionEvent[], current: WorldModelState): { next: WorldModelState; jobs: WorldJobEvent[] } => {
    const out: WorldJobEvent[] = [];
    let next = current;
    for (const event of events) {
      const jobId = missionToJob.get(event.missionId);
      if (jobId === undefined) continue;
      if (event.kind === "reward") options.onReward?.(event.rewards, jobId);
      if (event.kind === "completed") {
        const job = jobs[jobId]!;
        const facts = { ...next.facts, [`jobs.${jobId}`]: "done" };
        changeAll(facts, "", job.beat, 1);
        next = { ...next, facts, activeJob: null, log: pushLog(next, { at: next.time, kind: "job-done", place: job.at ?? null, text: job.title }) };
        out.push({ kind: "job-done", jobId, beat: job.beat ?? null });
      } else if (event.kind === "failed") {
        next = { ...next, facts: { ...next.facts, [`jobs.${jobId}`]: "failed" }, activeJob: null };
        out.push({ kind: "job-failed", jobId, reason: event.reason });
      }
    }
    if (next !== current || events.length > 0) next = { ...next, mission: runtime.snapshot() };
    return { next, jobs: out };
  };

  const decay = (facts: Record<string, WorldFactValue>, dt: number): boolean => {
    let moved = false;
    for (const [key, spec] of specs) {
      if (spec.decay === undefined || spec.decay <= 0) continue;
      const value = facts[key];
      if (typeof value !== "number") continue;
      const rest = spec.rest ?? (typeof spec.value === "number" ? spec.value : 0);
      if (value === rest) continue;
      const step = spec.decay * dt;
      facts[key] = value > rest ? Math.max(rest, value - step) : Math.min(rest, value + step);
      moved = true;
    }
    return moved;
  };

  const view = (): WorldModel => model;
  const model: WorldModel = {
    def,
    fact: (key) => state().facts[key],
    num: (key) => {
      const value = state().facts[key];
      return typeof value === "number" ? value : 0;
    },
    facts: () => state().facts,
    change(changes, scale = 1) {
      const current = state();
      const facts = { ...current.facts };
      changeAll(facts, "", changes, scale);
      write({ ...current, facts });
    },
    set(key, value) {
      const current = state();
      write({ ...current, facts: { ...current.facts, [key]: value } });
    },
    test: (conditions) => test(conditions),
    placeAt,
    position,
    emit(event) {
      const ripple = def.ripples?.[event.kind];
      const current = state();
      const place = event.place ?? (event.at === undefined ? null : placeAt(event.at[0], event.at.length === 3 ? event.at[2] : event.at[1]));
      if (ripple === undefined) return null;
      const scale = event.scale ?? 1;
      const facts = { ...current.facts };
      if (place !== null) {
        changeAll(facts, place, ripple.place, scale);
        const owner = facts[`${place}.owner`];
        if (typeof owner === "string" && def.subjects.get(owner) === "faction") changeAll(facts, owner, ripple.owner, scale);
        if (ripple.people !== undefined) {
          for (const person of Object.keys(def.people ?? {})) if (facts[`${person}.at`] === place) changeAll(facts, person, ripple.people, scale);
        }
      }
      if (event.faction !== undefined) changeAll(facts, event.faction, ripple.faction, scale);
      changeAll(facts, "", ripple.world, scale);
      const text = (ripple.note ?? event.kind).replace("{place}", place === null ? "the city" : label(place));
      const entry: WorldLogEntry = { at: current.time, kind: event.kind, place, text };
      write({ ...current, facts, log: ripple.note === undefined ? current.log : pushLog(current, entry) });
      for (const [name, amount] of Object.entries(ripple.out ?? {})) options.onOutput?.(name, amount * scale, event);
      return entry;
    },
    tick(dt, input = {}) {
      const current = state();
      let facts = current.facts;
      decayClock += Math.max(0, dt);
      const stepped = decayClock >= DECAY_STEP;
      if (stepped) {
        const copy = { ...facts };
        if (decay(copy, decayClock)) facts = copy;
      }
      let next: WorldModelState = { ...current, time: current.time + (stepped ? decayClock : 0), facts };
      if (stepped) decayClock = 0;
      let missionEvents: readonly MissionEvent[] = [];
      let jobEvents: WorldJobEvent[] = [];
      if (current.activeJob !== null) {
        missionEvents = runtime.tick(dt, { ...input, facts: { ...facts, ...(input.facts ?? {}) } });
        const settled = settleMission(missionEvents, next);
        next = settled.next;
        jobEvents = settled.jobs;
      }
      // The clock and calming facts are written four times a second, not every frame.
      if (stepped || missionEvents.length > 0) write(next);
      return { mission: missionEvents, jobs: jobEvents };
    },
    jobs: () => {
      const current = state();
      return jobIds.map((id) => jobView(id, current));
    },
    job: (id) => (jobs[id] === undefined ? null : jobView(id)),
    startJob(id) {
      const current = state();
      if (jobs[id] === undefined || current.activeJob !== null) return null;
      const status = jobStatus(id, current);
      if (status !== "available" && status !== "failed") return null;
      runtime.start(jobs[id]!.mission.id, current.facts);
      write({ ...current, activeJob: id, mission: runtime.snapshot(), facts: { ...current.facts, [`jobs.${id}`]: "active" } });
      return { kind: "job-started", jobId: id };
    },
    signal(objectiveId) {
      const current = state();
      if (current.activeJob === null) return { mission: [], jobs: [] };
      const events = runtime.signal(jobs[current.activeJob]!.mission.id, objectiveId);
      const settled = settleMission(events, current);
      write(settled.next);
      return { mission: events, jobs: settled.jobs };
    },
    abandonJob() {
      const current = state();
      if (current.activeJob === null) return;
      runtime.abandon();
      write({ ...current, activeJob: null, mission: null, facts: { ...current.facts, [`jobs.${current.activeJob}`]: "failed" } });
    },
    missionView: () => (state().activeJob === null ? null : runtime.view()),
    says(person) {
      const current = state();
      return (def.people?.[person]?.says ?? []).filter((line) => test(line.when, current.facts)).map((line) => line.text);
    },
    contacts() {
      const current = state();
      return Object.entries(def.people ?? {})
        .filter(([id, person]) => person.phone === true && current.facts[`${id}.known`] === true)
        .map(([id, person]) => ({
          id,
          name: person.name,
          faction: person.faction ?? null,
          line: view().says(id)[0] ?? null,
          jobs: jobIds.filter((job) => jobs[job]!.giver === id).map((job) => jobView(job, current)).filter((job) => job.status !== "locked"),
        }));
    },
    blips() {
      const current = state();
      const out: WorldBlip[] = [];
      const subjectBlips = (kind: "place" | "person" | "thing", entries: Readonly<Record<string, SubjectDecl>> | undefined) => {
        for (const [id, decl] of Object.entries(entries ?? {})) {
          if (decl.blip === undefined || decl.blip === false) continue;
          const blip = decl.blip === true ? {} : decl.blip;
          if (!test(blip.when, current.facts)) continue;
          const at = position(id);
          if (at === null) continue;
          out.push({ id, kind, label: blip.label ?? label(id), icon: blip.icon ?? null, x: at[0], z: at[1] });
        }
      };
      subjectBlips("place", def.places);
      subjectBlips("person", def.people);
      subjectBlips("thing", def.things);
      for (const id of jobIds) {
        const status = jobStatus(id, current);
        if (status !== "available" && status !== "failed") continue;
        const at = jobPosition(jobs[id]!);
        if (at !== null) out.push({ id, kind: "job", label: jobs[id]!.title, icon: jobs[id]!.kind === "side" ? "side" : "story", x: at[0], z: at[1] });
      }
      const target = objectiveTarget();
      if (target !== null) out.push({ id: "objective", kind: "objective", label: runtime.view()?.label ?? "", icon: "objective", x: target[0], z: target[1] });
      return out;
    },
    next() {
      const current = state();
      if (current.activeJob !== null) {
        const live = runtime.view();
        return { text: live?.label ?? jobs[current.activeJob]!.title, jobId: current.activeJob, target: objectiveTarget() };
      }
      const views = jobIds.map((id) => jobView(id, current));
      const pick = (kind: "story" | "side", status: WorldJobStatus) =>
        views.filter((job) => job.kind === kind && job.status === status).sort((a, b) => a.act - b.act)[0];
      const job = pick("story", "failed") ?? pick("story", "available") ?? pick("side", "failed") ?? pick("side", "available");
      if (job === undefined) return null;
      const giver = job.giver === null ? null : label(job.giver);
      const retry = job.status === "failed" ? "Retry" : giver === null ? "Start" : "See";
      return { text: giver === null ? `${retry}: ${job.title}` : `${retry} ${giver}: ${job.title}`, jobId: job.id, target: job.position };
    },
    log: () => state().log,
    snapshot: () => structuredClone(state()),
    restore(next) {
      write(structuredClone(next));
      restoredFrom = undefined;
      state();
    },
  };

  function objectiveTarget(): readonly [number, number] | null {
    const active = state().activeJob;
    const live = runtime.state();
    if (active === null || live === null || live.objective === null) return null;
    const objective = jobs[active]!.mission.objectives.find((entry) => entry.id === live.objective);
    const marker = objective?.marker === undefined ? undefined : markers[objective.marker];
    return marker === undefined ? null : [marker.x, marker.z];
  }

  return model;
}
