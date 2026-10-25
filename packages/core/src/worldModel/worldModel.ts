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
import { cancelJob, createWorkQueue, enqueue, jobProgress, tick as tickQueue, type WorkQueueConfig, type WorkQueueState } from "../work/jobQueue";
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
  /** Counted with placed instances of this kind by `totals`, and a target for actions `on` it. */
  kind?: string;
}

/**
 * Something placed at runtime: a tower, a ride, a server rack, a bed. Each placed one is a subject
 * `<kind>-<n>` carrying the kind's facts, so ripples, totals, conditions and actions read it like
 * any declared thing.
 */
export interface WorldKindDecl extends SubjectDecl {
  /** Groups this kind belongs to (`tower`, `ride`); an action `on` or a total `of` a tag covers every kind carrying it. */
  tags?: readonly string[];
  /** What a refusal says when `when` doesn't hold (default "<label> isn't available yet"). */
  refuse?: string;
  /** Absolute changes paid on placing (negative numbers spend); refused when unaffordable. */
  cost?: WorldChanges;
  /** Seconds to build; the spot is reserved at once and the instance is `ready` when its order finishes. */
  takes?: number;
  /** Queue the build waits in (default `"build"`). */
  queue?: string;
  /** Slot group it must occupy, e.g. `"plot"`. */
  slot?: string;
  /** Grid it is placed on, and its footprint in cells (default 1 x 1). */
  grid?: string;
  size?: readonly [number, number];
  /** Place it stands in when it has no slot or grid. */
  at?: string;
  owner?: string;
  /** Most instances that may exist at once. */
  limit?: number;
  /** Fraction of its cost returned when removed (default 0). */
  refund?: number;
  /** Placing is refused unless these absolute facts hold. */
  when?: WorldConditions;
  /** A code hook run when an instance becomes ready. */
  hook?: string;
}

/** One spot in a slot group, positioned by a marker or a position. */
export interface WorldSlotDecl {
  marker?: string;
  position?: readonly [number, number];
}

/** A grid of cells things are placed on with a footprint: a park lot, a ship deck, a base floor. */
export interface WorldGridDecl {
  cols: number;
  rows: number;
  /** World units per cell (default 1). */
  cell?: number;
  /** World position of cell [0, 0]'s corner (default [0, 0]). */
  origin?: readonly [number, number];
}

/**
 * Something the player can do that may be refused: upgrade a tower, fix a ride, train a model, sell.
 * Costs are absolute facts; `effect` lands on the target. With `takes` it waits in a queue.
 */
export interface WorldActionDecl {
  label?: string;
  /** Kind or tag the target must be (a placed instance, or a thing declaring that `kind`); omit for no target. */
  on?: string;
  /** Absolute facts that must hold. */
  when?: WorldConditions;
  /** Facts on the target that must hold, keyed without the subject (`{ level: { atMost: 2 } }`). */
  whenTarget?: WorldConditions;
  /** Absolute changes paid (negative numbers spend); refused when unaffordable. */
  cost?: WorldChanges;
  /** A target fact that multiplies `cost` and `world` numbers (an upgrade that costs more per level). */
  scaleBy?: string;
  /** Changes on the target, keyed without the subject. */
  effect?: WorldChanges;
  /** Absolute changes applied when it lands. */
  world?: WorldChanges;
  /** Removes the target when it lands (sell, demolish), paying its kind's `refund`. */
  removes?: boolean;
  takes?: number;
  queue?: string;
  /** A ripple fired at the target's place when it lands. */
  emit?: string;
  /** A line for the news log; `{target}` is the target's label. */
  note?: string;
  hook?: string;
  /** What a refusal says when `when` or `whenTarget` doesn't hold ("Already at top level"). */
  refuse?: string;
}

/** A fact computed over subjects of one kind: a park's rating, towers standing, a lab's income. */
export interface WorldTotalDecl {
  /** Kind or tag counted: placed instances and things declaring that `kind`. */
  of: string;
  /** Sum this fact across them; with neither `sum` nor `max` the total counts them. */
  sum?: string;
  max?: string;
  /** Only subjects whose facts pass, keyed without the subject. */
  where?: WorldConditions;
  /** Count instances still being built too (default only ready ones). */
  building?: boolean;
}

/** A per-second stream into a fact: income, upkeep, hunger, a reactor's heat. */
export interface WorldFlowDecl {
  /** The fact that changes. */
  to: string;
  /** Units per second (default 1), multiplied by `from` when given. */
  rate?: number;
  /** A fact (often a total) scaling the rate: `lab.income` per second into `lab.cash`. */
  from?: string;
  when?: WorldConditions;
}

/** A queue timed work waits in, and how many orders run at once. */
export interface WorldQueueDecl {
  lanes?: number;
  capacity?: number;
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
  /** A code hook (from `options.hooks`) run when the job is done, for what a beat can't declare. */
  hook?: string;
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
  /** Only spread while these facts hold, so the same event lands differently as the world changes. */
  when?: WorldConditions;
  /** A code hook (from `options.hooks`) run after the changes land, for what can't be declared. */
  hook?: string;
}

/** A ripple the world fires on its own clock: paydays, upkeep, shifts, waves, weather. */
export interface WorldScheduleDecl {
  /** Seconds of world time between firings. */
  every: number;
  /** The ripple to fire. */
  ripple: string;
  /** Where it lands, for its `place`/`owner`/`people` changes. */
  place?: string;
  /** Only fire while these facts hold. */
  when?: WorldConditions;
}

/** Everything a game declares about its world: factions, places, people, things, jobs and ripples. */
export interface WorldModelDecl {
  factions?: Readonly<Record<string, WorldFactionDecl>>;
  places?: Readonly<Record<string, WorldPlaceDecl>>;
  people?: Readonly<Record<string, WorldPersonDecl>>;
  things?: Readonly<Record<string, WorldThingDecl>>;
  jobs?: Readonly<Record<string, WorldJobDecl>>;
  ripples?: Readonly<Record<string, WorldRippleDecl>>;
  schedule?: Readonly<Record<string, WorldScheduleDecl>>;
  kinds?: Readonly<Record<string, WorldKindDecl>>;
  slots?: Readonly<Record<string, Readonly<Record<string, WorldSlotDecl>>>>;
  grids?: Readonly<Record<string, WorldGridDecl>>;
  actions?: Readonly<Record<string, WorldActionDecl>>;
  /** Computed facts, keyed absolutely (`park.rating`); conditions, flows and views read them. */
  totals?: Readonly<Record<string, WorldTotalDecl>>;
  flows?: Readonly<Record<string, WorldFlowDecl>>;
  queues?: Readonly<Record<string, WorldQueueDecl>>;
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

/** A placed instance as saved: what it is and where it stands. */
export interface WorldInstance {
  kind: string;
  slot?: string;
  cell?: readonly [number, number];
  ready: boolean;
  /** Everything spent on it so far (build plus upgrades), which a removal's refund is a share of. */
  paid?: WorldChanges;
}

/** An instance that was removed, with what came back. */
export interface WorldRemoved {
  id: string;
  kind: string;
  label: string;
  refund: WorldChanges;
}

/** What a queued order does when it finishes. */
export type WorldOrderSpec =
  | { type: "place"; instance: string; takes: number; paid: WorldChanges }
  | { type: "act"; action: string; target: string | null; scale: number; takes: number; paid: WorldChanges };

/** The saved form of a world model: facts, live mission, news log, placed instances and queued work. */
export interface WorldModelState {
  time: number;
  facts: Record<string, WorldFactValue>;
  activeJob: string | null;
  mission: MissionRuntimeSnapshot | null;
  log: WorldLogEntry[];
  instances?: Record<string, WorldInstance>;
  seq?: number;
  orders?: Record<string, WorkQueueState<WorldOrderSpec, WorldChanges>>;
}

/** How to place: `free` skips the cost (a starting layout, a reward, a scenario's seed). */
export interface WorldPlaceOptions {
  free?: boolean;
  /** Placed already built, skipping `takes`. */
  built?: boolean;
}

/** Where to place an instance. */
export interface WorldPlacement {
  slot?: string;
  cell?: readonly [number, number];
}

/** Why something was refused, with what was short, in words a HUD can show. */
export interface WorldRefusal {
  ok: false;
  reason: "unknown" | "locked" | "cost" | "taken" | "blocked" | "limit" | "target" | "busy";
  message: string;
  /** For `cost`: how much of each fact is missing. */
  short?: Readonly<Record<string, number>>;
}

/** What placing, acting or removing did. */
export type WorldResult = { ok: true; id: string | null; queued: boolean } | WorldRefusal;

/** A placed instance as views read it. */
export interface WorldInstanceView {
  id: string;
  kind: string;
  label: string;
  slot: string | null;
  cell: readonly [number, number] | null;
  ready: boolean;
  position: readonly [number, number] | null;
}

/** Queued work as a progress bar reads it. */
export interface WorldOrderView {
  id: string;
  queue: string;
  label: string;
  target: string | null;
  progress: number;
  remaining: number;
  active: boolean;
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
  /** Code a declaration names with `hook`: the escape hatch for what facts and ripples can't say. */
  hooks?: Readonly<Record<string, (hook: WorldHookCall) => void>>;
}

/** What a code hook is handed: the live world, and the event or job that ran it. */
export interface WorldHookCall {
  world: WorldModel;
  event: WorldEvent | null;
  place: string | null;
  jobId: string | null;
  /** The instance or thing an action landed on, or the instance that just became ready. */
  target: string | null;
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
  /** Instances whose build finished, for the game to spawn. */
  ready?: readonly WorldInstanceView[];
  /** Instances removed (sold, demolished, cancelled), for the game to despawn. */
  removed?: readonly WorldRemoved[];
  /** Actions that landed, queued or immediate. */
  landed?: readonly { action: string; target: string | null }[];
}

/** A live world: facts, events that ripple, jobs, and the views every screen reads. */
export interface WorldModel {
  readonly def: WorldModelDef;
  fact(key: string): WorldFactValue | undefined;
  num(key: string): number;
  facts(): Readonly<Record<string, WorldFactValue>>;
  /** Apply absolute `subject.fact` changes (numbers add, others set). */
  change(changes: WorldChanges, scale?: number): void;
  /** Apply changes all-or-nothing: refused (false) when any number would drop below its floor (`min`, else 0). */
  spend(changes: WorldChanges): boolean;
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
  /** Place an instance of a kind: pays its cost, takes its slot or cells, and builds over `takes`. */
  place(kind: string, at?: WorldPlacement, options?: WorldPlaceOptions): WorldResult;
  canPlace(kind: string, at?: WorldPlacement, options?: WorldPlaceOptions): WorldRefusal | null;
  /** Remove an instance, paying back its kind's `refund` share of its cost. */
  remove(id: string): WorldResult;
  /** Do an action on an optional target: refused, landed now, or queued. */
  act(action: string, target?: string): WorldResult;
  canAct(action: string, target?: string): WorldRefusal | null;
  /** What an action costs right now, scaled for its target. */
  costOf(action: string, target?: string): WorldChanges;
  /** Cancel a queued order and pay back what it reserved. */
  cancel(orderId: string): boolean;
  instances(kind?: string): readonly WorldInstanceView[];
  instance(id: string): WorldInstanceView | null;
  /** The instance standing in a slot. */
  occupant(slot: string): string | null;
  orders(queue?: string): readonly WorldOrderView[];
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
  for (const [id, timer] of Object.entries(decl.schedule ?? {})) {
    if (!(timer.every > 0)) issue(`schedule "${id}" needs every > 0 seconds`);
    if (decl.ripples?.[timer.ripple] === undefined) issue(`schedule "${id}" fires unknown ripple "${timer.ripple}"`);
    if (!is(timer.place, "place")) issue(`schedule "${id}" lands at unknown place "${timer.place}"`);
  }
  const kinds = decl.kinds ?? {};
  const thingKinds = new Set(Object.values(decl.things ?? {}).map((thing) => thing.kind).filter((kind) => kind !== undefined));
  const kindTags = new Set(Object.values(kinds).flatMap((kind) => kind.tags ?? []));
  const isKind = (id: string) => kinds[id] !== undefined || thingKinds.has(id) || kindTags.has(id);
  const slotIds = new Set<string>();
  for (const [group, slots] of Object.entries(decl.slots ?? {})) {
    for (const id of Object.keys(slots)) {
      if (slotIds.has(id)) issue(`slot "${id}" (in "${group}") is declared twice`);
      slotIds.add(id);
    }
  }
  for (const [id, grid] of Object.entries(decl.grids ?? {})) {
    if (!(grid.cols > 0 && grid.rows > 0)) issue(`grid "${id}" needs cols and rows above 0`);
  }
  for (const [id, kind] of Object.entries(kinds)) {
    if (id.includes(".") || id.includes("-")) issue(`kind "${id}" may not contain a dot or dash`);
    if (subjects.has(id)) issue(`kind "${id}" shares an id with a subject`);
    if (kind.slot !== undefined && decl.slots?.[kind.slot] === undefined) issue(`kind "${id}" needs unknown slot group "${kind.slot}"`);
    if (kind.grid !== undefined && decl.grids?.[kind.grid] === undefined) issue(`kind "${id}" is placed on unknown grid "${kind.grid}"`);
    if (kind.slot !== undefined && kind.grid !== undefined) issue(`kind "${id}" takes a slot or a grid, not both`);
    if (!is(kind.at, "place")) issue(`kind "${id}" stands at unknown place "${kind.at}"`);
    if (!is(kind.owner, "faction")) issue(`kind "${id}" owner "${kind.owner}" is not a faction`);
  }
  for (const [id, action] of Object.entries(decl.actions ?? {})) {
    if (action.on !== undefined && !isKind(action.on)) issue(`action "${id}" acts on unknown kind "${action.on}"`);
    if (action.on === undefined && (action.effect !== undefined || action.whenTarget !== undefined || action.removes === true || action.scaleBy !== undefined)) {
      issue(`action "${id}" changes a target but names no kind with "on"`);
    }
    if (action.emit !== undefined && decl.ripples?.[action.emit] === undefined) issue(`action "${id}" emits unknown ripple "${action.emit}"`);
  }
  for (const [key, total] of Object.entries(decl.totals ?? {})) {
    if (!isKind(total.of)) issue(`total "${key}" counts unknown kind "${total.of}"`);
    if (total.sum !== undefined && total.max !== undefined) issue(`total "${key}" sums or takes a max, not both`);
  }
  for (const [id, flow] of Object.entries(decl.flows ?? {})) {
    if (flow.to.length === 0) issue(`flow "${id}" needs a fact to flow into`);
  }
  const missions = Object.values(jobs).map((job) => job.mission);
  const errors = validateMissionCatalog(missions).filter((entry) => entry.severity === "error");
  if (errors.length > 0) issue(errors.map((entry) => entry.message).join("; "));
  return { ...decl, subjects };
}

function addChanges(a: WorldChanges, b: WorldChanges): WorldChanges {
  const out: Record<string, WorldFactValue> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    const before = out[key];
    out[key] = typeof value === "number" && typeof before === "number" ? before + value : value;
  }
  return out;
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
  const pendingHooks: { name: string; call: WorldHookCall }[] = [];
  const runHooks = () => {
    while (pendingHooks.length > 0) {
      const { name, call } = pendingHooks.shift()!;
      const hook = options.hooks?.[name];
      if (hook === undefined) throw new Error(`world model: no hook named "${name}" in options.hooks`);
      hook(call);
    }
  };
  let decayClock = 0;
  const kinds = def.kinds ?? {};
  const kindSpecs = new Map<string, Map<string, WorldFactSpec>>();
  for (const [id, kind] of Object.entries(kinds)) {
    const own = new Map<string, WorldFactSpec>();
    for (const [fact, raw] of Object.entries(kind.facts ?? {})) {
      const spec = specOf(raw);
      if (spec.decay !== undefined || spec.min !== undefined || spec.max !== undefined) own.set(fact, spec);
    }
    kindSpecs.set(id, own);
  }
  // Instances of the state last read or written; fact clamps on instance facts read their kind's spec.
  let liveInstances: Readonly<Record<string, WorldInstance>> = {};
  const specFor = (key: string): WorldFactSpec | undefined => {
    const direct = specs.get(key);
    if (direct !== undefined) return direct;
    const dot = key.indexOf(".");
    if (dot < 0) return undefined;
    const instance = liveInstances[key.slice(0, dot)];
    return instance === undefined ? undefined : kindSpecs.get(instance.kind)?.get(key.slice(dot + 1));
  };
  // Instants placed or removed and actions landed since the last tick, reported on the next one.
  let pendingReady: string[] = [];
  let pendingRemoved: WorldRemoved[] = [];
  let pendingLanded: { action: string; target: string | null }[] = [];

  const state = (): WorldModelState => {
    const current = storage.read() ?? fresh();
    liveInstances = current.instances ?? {};
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
    liveInstances = next.instances ?? {};
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
      const spec = specFor(key);
      if (spec?.min !== undefined) next = Math.max(spec.min, next);
      if (spec?.max !== undefined) next = Math.min(spec.max, next);
    }
    facts[key] = next;
  };
  const changeAll = (facts: Record<string, WorldFactValue>, prefix: string, changes: WorldChanges | undefined, scale: number) => {
    if (changes === undefined) return;
    for (const [fact, value] of Object.entries(changes)) applyInto(facts, prefix === "" ? fact : `${prefix}.${fact}`, value, scale);
  };

  /** A kind id matches itself and every tag it carries. */
  const matchesKind = (kindId: string | null, want: string): boolean =>
    kindId !== null && (kindId === want || (kinds[kindId]?.tags ?? []).includes(want));
  const kindOf = (id: string, current: WorldModelState): string | null =>
    current.instances?.[id]?.kind ?? def.things?.[id]?.kind ?? null;
  const membersOf = (kind: string, current: WorldModelState, building: boolean): string[] => {
    const out: string[] = [];
    for (const [id, thing] of Object.entries(def.things ?? {})) if (thing.kind !== undefined && matchesKind(thing.kind, kind)) out.push(id);
    for (const [id, instance] of Object.entries(current.instances ?? {})) if (matchesKind(instance.kind, kind) && (building || instance.ready)) out.push(id);
    return out;
  };
  const testOn = (conditions: WorldConditions | undefined, subject: string, facts: Readonly<Record<string, WorldFactValue>>): boolean => {
    if (conditions === undefined) return true;
    for (const [key, condition] of Object.entries(conditions)) if (!passes(facts[`${subject}.${key}`], condition)) return false;
    return true;
  };
  const numberOf = (value: WorldFactValue | undefined): number => (typeof value === "number" ? value : 0);
  // Totals are computed per state, so every read of one state sees the same numbers.
  let totalsCache: { from: WorldModelState; facts: Record<string, WorldFactValue> } | null = null;
  const allFacts = (current: WorldModelState): Readonly<Record<string, WorldFactValue>> => {
    if (def.totals === undefined) return current.facts;
    if (totalsCache !== null && totalsCache.from === current) return totalsCache.facts;
    const facts: Record<string, WorldFactValue> = { ...current.facts };
    for (const [key, total] of Object.entries(def.totals)) {
      let value = 0;
      for (const id of membersOf(total.of, current, total.building === true)) {
        if (!testOn(total.where, id, current.facts)) continue;
        if (total.sum !== undefined) value += numberOf(current.facts[`${id}.${total.sum}`]);
        else if (total.max !== undefined) value = Math.max(value, numberOf(current.facts[`${id}.${total.max}`]));
        else value += 1;
      }
      facts[key] = value;
    }
    totalsCache = { from: current, facts };
    return facts;
  };

  const test = (conditions: WorldConditions | undefined, current = state()): boolean => {
    if (conditions === undefined) return true;
    const facts = allFacts(current);
    for (const [key, condition] of Object.entries(conditions)) if (!passes(facts[key], condition)) return false;
    return true;
  };

  const factWord = (key: string): string => key.slice(key.lastIndexOf(".") + 1).replace(/_/g, " ");
  /** What is missing to pay `cost` × `scale`: each spend must keep its fact at or above its floor. */
  const shortfall = (cost: WorldChanges | undefined, scale: number, current: WorldModelState): Record<string, number> | null => {
    if (cost === undefined) return null;
    const facts = allFacts(current);
    let short: Record<string, number> | null = null;
    for (const [key, value] of Object.entries(cost)) {
      if (typeof value !== "number" || value >= 0) continue;
      const after = numberOf(facts[key]) + value * scale;
      const floor = specFor(key)?.min ?? 0;
      if (after < floor) (short ??= {})[key] = Math.ceil(floor - after);
    }
    return short;
  };
  const refuse = (reason: WorldRefusal["reason"], message: string, short?: Record<string, number>): WorldRefusal =>
    short === undefined ? { ok: false, reason, message } : { ok: false, reason, message, short };
  const costRefusal = (cost: WorldChanges | undefined, scale: number, current: WorldModelState, what: string): WorldRefusal | null => {
    const short = shortfall(cost, scale, current);
    if (short === null) return null;
    const words = Object.entries(short).map(([key, amount]) => `${amount} more ${factWord(key)}`);
    return refuse("cost", `${what} needs ${words.join(" and ")}`, short);
  };
  const scaled = (changes: WorldChanges | undefined, scale: number): WorldChanges => {
    const out: Record<string, WorldFactValue> = {};
    for (const [key, value] of Object.entries(changes ?? {})) out[key] = typeof value === "number" ? value * scale : value;
    return out;
  };
  /** The gains that pay back the spends in `paid`, times `share`. */
  const payback = (paid: WorldChanges, share: number): WorldChanges => {
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(paid)) if (typeof value === "number" && value < 0) out[key] = Math.round(-value * share);
    return out;
  };

  const slotPosition = (slot: string): readonly [number, number] | null => {
    for (const slots of Object.values(def.slots ?? {})) {
      const decl = slots[slot];
      if (decl === undefined) continue;
      if (decl.position !== undefined) return decl.position;
      const marker = decl.marker === undefined ? undefined : markers[decl.marker];
      return marker === undefined ? null : [marker.x, marker.z];
    }
    return null;
  };
  const slotGroup = (slot: string): string | null => {
    for (const [group, slots] of Object.entries(def.slots ?? {})) if (slots[slot] !== undefined) return group;
    return null;
  };
  const footprint = (kind: string): readonly [number, number] => kinds[kind]?.size ?? [1, 1];
  const cellsOverlap = (a: readonly [number, number], aSize: readonly [number, number], b: readonly [number, number], bSize: readonly [number, number]) =>
    a[0] < b[0] + bSize[0] && b[0] < a[0] + aSize[0] && a[1] < b[1] + bSize[1] && b[1] < a[1] + aSize[1];
  const instancePosition = (id: string, instance: WorldInstance, current: WorldModelState): readonly [number, number] | null => {
    if (instance.slot !== undefined) return slotPosition(instance.slot);
    const kind = kinds[instance.kind];
    if (instance.cell !== undefined && kind?.grid !== undefined) {
      const grid = def.grids![kind.grid]!;
      const cell = grid.cell ?? 1;
      const [w, h] = footprint(instance.kind);
      const origin = grid.origin ?? [0, 0];
      return [origin[0] + (instance.cell[0] + w / 2) * cell, origin[1] + (instance.cell[1] + h / 2) * cell];
    }
    const at = current.facts[`${id}.at`];
    return typeof at === "string" ? placePosition(at) : null;
  };
  const instanceView = (id: string, current: WorldModelState): WorldInstanceView | null => {
    const instance = current.instances?.[id];
    if (instance === undefined) return null;
    return {
      id,
      kind: instance.kind,
      label: kinds[instance.kind]?.label ?? instance.kind,
      slot: instance.slot ?? null,
      cell: instance.cell ?? null,
      ready: instance.ready,
      position: instancePosition(id, instance, current),
    };
  };

  const queueConfig = (name: string): WorkQueueConfig<WorldOrderSpec, WorldChanges, WorldOrderSpec> => ({
    duration: (spec) => spec.takes,
    concurrency: def.queues?.[name]?.lanes ?? 1,
    ...(def.queues?.[name]?.capacity !== undefined ? { capacity: def.queues[name]!.capacity! } : {}),
    reserve: (spec) => spec.paid,
    output: (job) => job.spec,
  });

  const placeRefusal = (kindId: string, at: WorldPlacement, current: WorldModelState, options: WorldPlaceOptions = {}): WorldRefusal | null => {
    const kind = kinds[kindId];
    if (kind === undefined) return refuse("unknown", `Nothing called "${kindId}" can be placed`);
    const what = kind.label ?? kindId;
    if (!test(kind.when, current)) return refuse("locked", kind.refuse ?? `${what} isn't available yet`);
    const placed = Object.entries(current.instances ?? {}).filter(([, instance]) => instance.kind === kindId);
    if (kind.limit !== undefined && placed.length >= kind.limit) return refuse("limit", `Only ${kind.limit} ${what} allowed`);
    if (kind.slot !== undefined) {
      if (at.slot === undefined || slotGroup(at.slot) !== kind.slot) return refuse("blocked", `${what} goes on a ${kind.slot}`);
      if (Object.values(current.instances ?? {}).some((instance) => instance.slot === at.slot)) return refuse("taken", "That spot is taken");
    }
    if (kind.grid !== undefined) {
      const grid = def.grids![kind.grid]!;
      const size = footprint(kindId);
      const cell = at.cell;
      if (cell === undefined || cell[0] < 0 || cell[1] < 0 || cell[0] + size[0] > grid.cols || cell[1] + size[1] > grid.rows) {
        return refuse("blocked", `${what} doesn't fit there`);
      }
      for (const other of Object.values(current.instances ?? {})) {
        if (other.cell === undefined || kinds[other.kind]?.grid !== kind.grid) continue;
        if (cellsOverlap(cell, size, other.cell, footprint(other.kind))) return refuse("taken", "Something is already built there");
      }
    }
    return options.free === true ? null : costRefusal(kind.cost, 1, current, what);
  };

  const actionScale = (action: WorldActionDecl, target: string | null, current: WorldModelState): number =>
    action.scaleBy === undefined || target === null ? 1 : numberOf(current.facts[`${target}.${action.scaleBy}`]);
  const actRefusal = (actionId: string, target: string | null, current: WorldModelState): WorldRefusal | null => {
    const action = def.actions?.[actionId];
    if (action === undefined) return refuse("unknown", `No action called "${actionId}"`);
    const what = action.label ?? actionId;
    if (action.on !== undefined) {
      if (target === null || !matchesKind(kindOf(target, current), action.on)) return refuse("target", `${what} needs a ${action.on}`);
      if (current.instances?.[target]?.ready === false) return refuse("busy", `${what}: still being built`);
    }
    if (!test(action.when, current)) return refuse("locked", action.refuse ?? `${what} isn't available yet`);
    if (target !== null && !testOn(action.whenTarget, target, allFacts(current))) return refuse("locked", action.refuse ?? `${what} can't be done to that`);
    if (target !== null && action.takes !== undefined && action.takes > 0) {
      const queued = Object.values(current.orders ?? {}).some((queue) =>
        queue.jobs.some((job) => job.spec.type === "act" && job.spec.action === actionId && job.spec.target === target));
      if (queued) return refuse("busy", `${what} is already under way`);
    }
    return costRefusal(action.cost, actionScale(action, target, current), current, what);
  };

  /** Drop an instance and its facts from `next`, paying back `share` of what it cost. */
  const dropInstance = (next: WorldModelState, id: string, share: number): WorldModelState => {
    const instance = next.instances?.[id];
    if (instance === undefined) return next;
    const facts: Record<string, WorldFactValue> = {};
    for (const [key, value] of Object.entries(next.facts)) if (!key.startsWith(`${id}.`)) facts[key] = value;
    const refund = payback(instance.paid ?? kinds[instance.kind]?.cost ?? {}, share);
    changeAll(facts, "", refund, 1);
    const instances = { ...next.instances };
    delete instances[id];
    pendingRemoved.push({ id, kind: instance.kind, label: kinds[instance.kind]?.label ?? instance.kind, refund });
    return { ...next, facts, instances };
  };

  /** Apply what an action does to `next`; returns the new state and the ripple to fire after writing. */
  const landAction = (next: WorldModelState, actionId: string, target: string | null, scale: number): { next: WorldModelState; ripple: WorldEvent | null } => {
    const action = def.actions![actionId]!;
    const facts = { ...next.facts };
    if (target !== null) changeAll(facts, target, action.effect, 1);
    changeAll(facts, "", action.world, scale);
    let out: WorldModelState = { ...next, facts };
    const where = target === null ? null : (() => {
      const instance = out.instances?.[target];
      const at = instance === undefined ? position(target) : instancePosition(target, instance, out);
      return at === null ? null : placeAt(at[0], at[1]);
    })();
    if (action.note !== undefined) {
      const text = action.note.replace("{target}", target === null ? "" : (out.instances?.[target] !== undefined ? kinds[out.instances[target]!.kind]?.label ?? target : label(target)));
      out = { ...out, log: pushLog(out, { at: out.time, kind: actionId, place: where, text }) };
    }
    if (action.removes === true && target !== null) out = dropInstance(out, target, kinds[kindOf(target, out) ?? ""]?.refund ?? 0);
    pendingLanded.push({ action: actionId, target });
    if (action.hook !== undefined) pendingHooks.push({ name: action.hook, call: { world: model, event: null, place: where, jobId: null, target } });
    return { next: out, ripple: action.emit === undefined ? null : { kind: action.emit, ...(where !== null ? { place: where } : {}) } };
  };

  /** Count what an action cost toward its target's refund. */
  const addPaid = (current: WorldModelState, target: string | null, paid: WorldChanges): WorldModelState => {
    const owned = target === null ? undefined : current.instances?.[target];
    if (owned === undefined || target === null || Object.keys(paid).length === 0) return current;
    return { ...current, instances: { ...current.instances, [target]: { ...owned, paid: addChanges(owned.paid ?? {}, paid) } } };
  };

  /** Advance every queue by `dt`, landing what finished. */
  const tickOrders = (next: WorldModelState, dt: number): { next: WorldModelState; ripples: WorldEvent[] } => {
    const ripples: WorldEvent[] = [];
    if (next.orders === undefined) return { next, ripples };
    let out = next;
    const orders = { ...next.orders };
    let moved = false;
    for (const [name, queue] of Object.entries(next.orders)) {
      if (queue.jobs.length === 0) continue;
      const result = tickQueue(queue, queueConfig(name), dt);
      orders[name] = result.state;
      moved = true;
      for (const event of result.events) {
        if (event.type !== "completed") continue;
        const spec = event.output;
        if (spec.type === "place") {
          const instance = out.instances?.[spec.instance];
          if (instance === undefined) continue;
          out = { ...out, instances: { ...out.instances, [spec.instance]: { ...instance, ready: true } } };
          pendingReady.push(spec.instance);
          const hook = kinds[instance.kind]?.hook;
          if (hook !== undefined) pendingHooks.push({ name: hook, call: { world: model, event: null, place: null, jobId: null, target: spec.instance } });
        } else {
          if (spec.target !== null && out.instances?.[spec.target] === undefined && def.things?.[spec.target] === undefined) continue;
          const landed = landAction(addPaid(out, spec.target, spec.paid), spec.action, spec.target, spec.scale);
          out = landed.next;
          if (landed.ripple !== null) ripples.push(landed.ripple);
        }
      }
    }
    return { next: moved ? { ...out, orders } : out, ripples };
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
    const open = (job.requires ?? []).every((need) => current.facts[`jobs.${need}`] === "done") && test(job.when, current);
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
        if (job.hook !== undefined) pendingHooks.push({ name: job.hook, call: { world: model, event: null, place: job.at ?? null, jobId, target: null } });
      } else if (event.kind === "failed") {
        next = { ...next, facts: { ...next.facts, [`jobs.${jobId}`]: "failed" }, activeJob: null };
        out.push({ kind: "job-failed", jobId, reason: event.reason });
      }
    }
    if (next !== current || events.length > 0) next = { ...next, mission: runtime.snapshot() };
    return { next, jobs: out };
  };

  const decay = (facts: Record<string, WorldFactValue>, dt: number, current: WorldModelState): boolean => {
    let moved = false;
    const settle = (key: string, spec: WorldFactSpec) => {
      if (spec.decay === undefined || spec.decay <= 0) return;
      const value = facts[key];
      if (typeof value !== "number") return;
      const rest = spec.rest ?? (typeof spec.value === "number" ? spec.value : 0);
      if (value === rest) return;
      const step = spec.decay * dt;
      facts[key] = value > rest ? Math.max(rest, value - step) : Math.min(rest, value + step);
      moved = true;
    };
    for (const [key, spec] of specs) settle(key, spec);
    for (const [id, instance] of Object.entries(current.instances ?? {})) {
      for (const [fact, spec] of kindSpecs.get(instance.kind) ?? []) settle(`${id}.${fact}`, spec);
    }
    // Flows read totals from the state the step started from, so income follows what stood then.
    if (def.flows !== undefined) {
      const before = allFacts(current);
      for (const flow of Object.values(def.flows)) {
        if (!test(flow.when, current)) continue;
        const amount = (flow.rate ?? 1) * (flow.from === undefined ? 1 : numberOf(before[flow.from])) * dt;
        if (amount === 0) continue;
        applyInto(facts, flow.to, amount, 1);
        moved = true;
      }
    }
    return moved;
  };

  const view = (): WorldModel => model;
  const model: WorldModel = {
    def,
    fact: (key) => allFacts(state())[key],
    num: (key) => numberOf(allFacts(state())[key]),
    facts: () => allFacts(state()),
    change(changes, scale = 1) {
      const current = state();
      const facts = { ...current.facts };
      changeAll(facts, "", changes, scale);
      write({ ...current, facts });
    },
    spend(changes) {
      const current = state();
      if (shortfall(changes, 1, current) !== null) return false;
      const facts = { ...current.facts };
      changeAll(facts, "", changes, 1);
      write({ ...current, facts });
      return true;
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
      if (ripple === undefined || !test(ripple.when, current)) return null;
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
      if (ripple.hook !== undefined) {
        pendingHooks.push({ name: ripple.hook, call: { world: model, event, place, jobId: null, target: null } });
        runHooks();
      }
      return entry;
    },
    tick(dt, input = {}) {
      const current = state();
      let facts = current.facts;
      decayClock += Math.max(0, dt);
      const stepped = decayClock >= DECAY_STEP;
      const stepDt = decayClock;
      if (stepped) {
        const copy = { ...facts };
        if (decay(copy, stepDt, current)) facts = copy;
      }
      let next: WorldModelState = { ...current, time: current.time + (stepped ? stepDt : 0), facts };
      if (stepped) decayClock = 0;
      let ripples: WorldEvent[] = [];
      if (stepped) {
        const ordered = tickOrders(next, stepDt);
        next = ordered.next;
        ripples = ordered.ripples;
      }
      let missionEvents: readonly MissionEvent[] = [];
      let jobEvents: WorldJobEvent[] = [];
      if (current.activeJob !== null) {
        missionEvents = runtime.tick(dt, { ...input, facts: { ...allFacts(next), ...(input.facts ?? {}) } });
        const settled = settleMission(missionEvents, next);
        next = settled.next;
        jobEvents = settled.jobs;
      }
      // The clock, calming facts, flows and queues are written four times a second, not every frame.
      if (stepped || missionEvents.length > 0) write(next);
      for (const ripple of ripples) model.emit(ripple);
      runHooks();
      if (stepped) {
        for (const timer of Object.values(def.schedule ?? {})) {
          if (Math.floor(next.time / timer.every) > Math.floor(current.time / timer.every) && test(timer.when, next)) {
            model.emit({ kind: timer.ripple, ...(timer.place !== undefined ? { place: timer.place } : {}) });
          }
        }
      }
      const after = state();
      const ready = pendingReady.map((id) => instanceView(id, after)).filter((entry): entry is WorldInstanceView => entry !== null);
      const result: WorldTickResult = {
        mission: missionEvents,
        jobs: jobEvents,
        ...(ready.length > 0 ? { ready } : {}),
        ...(pendingRemoved.length > 0 ? { removed: pendingRemoved } : {}),
        ...(pendingLanded.length > 0 ? { landed: pendingLanded } : {}),
      };
      pendingReady = [];
      pendingRemoved = [];
      pendingLanded = [];
      return result;
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
      runHooks();
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
      return (def.people?.[person]?.says ?? []).filter((line) => test(line.when, current)).map((line) => line.text);
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
          if (!test(blip.when, current)) continue;
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
    canPlace: (kind, at = {}, options = {}) => placeRefusal(kind, at, state(), options),
    place(kindId, at = {}, options = {}) {
      const current = state();
      const refusal = placeRefusal(kindId, at, current, options);
      if (refusal !== null) return refusal;
      const kind = kinds[kindId]!;
      const paid = options.free === true ? {} : (kind.cost ?? {});
      const facts = { ...current.facts };
      changeAll(facts, "", paid, 1);
      const seq = (current.seq ?? 0) + 1;
      const id = `${kindId}-${seq}`;
      for (const [fact, raw] of Object.entries(kind.facts ?? {})) facts[`${id}.${fact}`] = specOf(raw).value;
      if (kind.owner !== undefined) facts[`${id}.owner`] = kind.owner;
      if (kind.at !== undefined) facts[`${id}.at`] = kind.at;
      const takes = options.built === true ? 0 : Math.max(0, kind.takes ?? 0);
      const instance: WorldInstance = {
        kind: kindId,
        ...(at.slot !== undefined && kind.slot !== undefined ? { slot: at.slot } : {}),
        ...(at.cell !== undefined && kind.grid !== undefined ? { cell: [at.cell[0], at.cell[1]] as const } : {}),
        ready: takes === 0,
        paid,
      };
      let next: WorldModelState = { ...current, facts, seq, instances: { ...(current.instances ?? {}), [id]: instance } };
      if (takes > 0) {
        const name = kind.queue ?? "build";
        const queued = enqueue(next.orders?.[name] ?? createWorkQueue<WorldOrderSpec, WorldChanges>(), queueConfig(name), { type: "place", instance: id, takes, paid }, { id: `order-${id}` });
        if (!queued.ok) return refuse("busy", `The ${name} queue is full`);
        next = { ...next, orders: { ...(next.orders ?? {}), [name]: queued.state } };
      }
      write(next);
      if (takes === 0) {
        pendingReady.push(id);
        if (kind.hook !== undefined) pendingHooks.push({ name: kind.hook, call: { world: model, event: null, place: null, jobId: null, target: id } });
        runHooks();
      }
      return { ok: true, id, queued: takes > 0 };
    },
    remove(id) {
      const current = state();
      const instance = current.instances?.[id];
      if (instance === undefined) return refuse("target", "Nothing to remove there");
      let next = current;
      if (!instance.ready) {
        // Still being built: cancel the order and pay back all of it.
        const name = kinds[instance.kind]?.queue ?? "build";
        const queue = next.orders?.[name];
        if (queue !== undefined) {
          const cancelled = cancelJob(queue, queueConfig(name), `order-${id}`);
          if (cancelled.ok) next = { ...next, orders: { ...next.orders, [name]: cancelled.state } };
        }
        write(dropInstance(next, id, 1));
      } else {
        write(dropInstance(next, id, kinds[instance.kind]?.refund ?? 0));
      }
      return { ok: true, id, queued: false };
    },
    canAct: (action, target) => actRefusal(action, target ?? null, state()),
    costOf(actionId, target) {
      const current = state();
      const action = def.actions?.[actionId];
      return action === undefined ? {} : scaled(action.cost, actionScale(action, target ?? null, current));
    },
    act(actionId, targetArg) {
      const target = targetArg ?? null;
      const current = state();
      const refusal = actRefusal(actionId, target, current);
      if (refusal !== null) return refusal;
      const action = def.actions![actionId]!;
      const scale = actionScale(action, target, current);
      const paid = scaled(action.cost, scale);
      const facts = { ...current.facts };
      changeAll(facts, "", paid, 1);
      let next: WorldModelState = { ...current, facts };
      const takes = Math.max(0, action.takes ?? 0);
      if (takes > 0) {
        const name = action.queue ?? "build";
        const queued = enqueue(next.orders?.[name] ?? createWorkQueue<WorldOrderSpec, WorldChanges>(), queueConfig(name), { type: "act", action: actionId, target, scale, takes, paid });
        if (!queued.ok) return refuse("busy", `The ${name} queue is full`);
        write({ ...next, orders: { ...(next.orders ?? {}), [name]: queued.state } });
        return { ok: true, id: queued.job.id, queued: true };
      }
      const landed = landAction(addPaid(next, target, paid), actionId, target, scale);
      write(landed.next);
      if (landed.ripple !== null) model.emit(landed.ripple);
      runHooks();
      return { ok: true, id: target, queued: false };
    },
    cancel(orderId) {
      const current = state();
      for (const [name, queue] of Object.entries(current.orders ?? {})) {
        const job = queue.jobs.find((entry) => entry.id === orderId);
        if (job === undefined) continue;
        if (job.spec.type === "place") return model.remove(job.spec.instance).ok;
        const cancelled = cancelJob(queue, queueConfig(name), orderId);
        if (!cancelled.ok) return false;
        const facts = { ...current.facts };
        changeAll(facts, "", payback(job.reservation, 1), 1);
        write({ ...current, facts, orders: { ...current.orders, [name]: cancelled.state } });
        return true;
      }
      return false;
    },
    instances(kind) {
      const current = state();
      return Object.keys(current.instances ?? {})
        .filter((id) => kind === undefined || matchesKind(current.instances![id]!.kind, kind))
        .map((id) => instanceView(id, current)!);
    },
    instance: (id) => instanceView(id, state()),
    occupant(slot) {
      for (const [id, instance] of Object.entries(state().instances ?? {})) if (instance.slot === slot) return id;
      return null;
    },
    orders(queueName) {
      const current = state();
      const out: WorldOrderView[] = [];
      for (const [name, queue] of Object.entries(current.orders ?? {})) {
        if (queueName !== undefined && name !== queueName) continue;
        for (const job of queue.jobs) {
          const spec = job.spec;
          const labelText = spec.type === "place"
            ? kinds[current.instances?.[spec.instance]?.kind ?? ""]?.label ?? spec.instance
            : def.actions?.[spec.action]?.label ?? spec.action;
          out.push({
            id: job.id,
            queue: name,
            label: labelText,
            target: spec.type === "place" ? spec.instance : spec.target,
            progress: jobProgress(job),
            remaining: Math.max(0, job.duration - job.elapsed),
            active: job.status === "active",
          });
        }
      }
      return out;
    },
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
