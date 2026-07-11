import { createRecordBook, type RecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";
import { seededRng } from "@jgengine/core/random/rng";

import {
  BANNER_SECONDS,
  CLEAR_ANIM,
  DEATH_ANIM,
  FLY_DURATION,
  FLY_MAX_DELAY,
  FLY_MIN_DELAY,
  HOME_ROW,
  HOP_ANIM,
  MAX_LIVES,
  PARALLAX_SPEED,
  RECORD_KEY,
  SCORE_ALL_HOMES,
  SCORE_FORWARD,
  START_COL,
  START_LIVES,
  START_ROW,
  TIME_LIMIT,
} from "./constants";
import {
  isOffField,
  isRiverRow,
  isRoadRow,
  resolveHop,
  snapCol,
  type HopDir,
} from "./grid";
import {
  advanceLane,
  buildLanes,
  carrierSupportAt,
  laneBodies,
  vehicleHitsCol,
  type Body,
  type Lane,
  type LaneKind,
  type Variant,
} from "./lanes";
import {
  allFilled,
  createHomes,
  pickEmptyBay,
  resolveHomeLanding,
  type HomeBay,
} from "./homes";
import { crossesExtraLife, homeScore, timeFraction } from "./scoring";

export type Phase = "ready" | "playing" | "paused" | "dying" | "cleared" | "gameover";
export type DeathKind = "splash" | "squish" | "timeout";

export interface LaneView {
  readonly row: number;
  readonly kind: LaneKind;
  readonly variant: Variant;
  readonly dir: 1 | -1;
  readonly submerged: boolean;
  readonly blinking: boolean;
  readonly bodies: readonly Body[];
}

export interface HomeView {
  readonly col: number;
  readonly filled: boolean;
  readonly fly: boolean;
}

export interface HopperView {
  readonly col: number;
  readonly row: number;
  readonly facing: HopDir;
  readonly hop: number;
  readonly onCarrier: boolean;
}

export interface HopperSnapshot {
  readonly phase: Phase;
  readonly score: number;
  readonly best: number;
  readonly bestLevel: number;
  readonly lives: number;
  readonly level: number;
  readonly timeLeft: number;
  readonly timeFrac: number;
  readonly homes: readonly HomeView[];
  readonly lanes: readonly LaneView[];
  readonly hopper: HopperView;
  readonly deathKind: DeathKind | null;
  readonly deathProgress: number;
  readonly clearProgress: number;
  readonly banner: string | null;
  readonly newBest: boolean;
  readonly parallax: number;
}

export interface RoadHopperStore {
  getState(): HopperSnapshot;
  subscribe(listener: (snapshot: HopperSnapshot) => void): () => void;
  hop(dir: HopDir): void;
  confirm(): void;
  togglePause(): void;
  restart(): void;
  tick(dt: number): void;
  preview(): void;
}

function resolveStorage(): RecordStorage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    return null;
  }
  return null;
}

interface Mutable {
  phase: Phase;
  score: number;
  lives: number;
  level: number;
  timeLeft: number;
  homes: HomeBay[];
  lanes: Lane[];
  hopperCol: number;
  hopperRow: number;
  facing: HopDir;
  hopTimer: number;
  onCarrier: boolean;
  furthestRow: number;
  deathKind: DeathKind | null;
  deathTimer: number;
  clearTimer: number;
  banner: string | null;
  bannerTimer: number;
  flyDelay: number;
  flyTimer: number;
  flyBay: number | null;
  extraLifeGiven: boolean;
  newBest: boolean;
  parallax: number;
  best: number;
  bestLevel: number;
  rng: () => number;
  runIndex: number;
}

export function createRoadHopperStore(seed = "road-hopper"): RoadHopperStore {
  const listeners = new Set<(snapshot: HopperSnapshot) => void>();
  const records: RecordBook<"score" | "level"> = createRecordBook<"score" | "level">({
    key: RECORD_KEY,
    fields: { score: "higher", level: "higher" },
    storage: resolveStorage(),
  });

  const state: Mutable = {
    phase: "ready",
    score: 0,
    lives: START_LIVES,
    level: 1,
    timeLeft: TIME_LIMIT,
    homes: createHomes(),
    lanes: buildLanes(1),
    hopperCol: START_COL,
    hopperRow: START_ROW,
    facing: "up",
    hopTimer: 0,
    onCarrier: false,
    furthestRow: START_ROW,
    deathKind: null,
    deathTimer: 0,
    clearTimer: 0,
    banner: null,
    bannerTimer: 0,
    flyDelay: FLY_MIN_DELAY,
    flyTimer: 0,
    flyBay: null,
    extraLifeGiven: false,
    newBest: false,
    parallax: 0,
    best: records.bestOf("score") ?? 0,
    bestLevel: records.bestOf("level") ?? 0,
    rng: seededRng(seed),
    runIndex: 0,
  };

  let snapshot: HopperSnapshot;

  function randDelay(): number {
    return FLY_MIN_DELAY + state.rng() * (FLY_MAX_DELAY - FLY_MIN_DELAY);
  }

  function laneForRow(row: number): Lane | undefined {
    return state.lanes.find((lane) => lane.row === row);
  }

  function setBanner(text: string): void {
    state.banner = text;
    state.bannerTimer = BANNER_SECONDS;
  }

  function respawnHopper(): void {
    state.hopperCol = START_COL;
    state.hopperRow = START_ROW;
    state.facing = "up";
    state.hopTimer = 0;
    state.onCarrier = false;
    state.furthestRow = START_ROW;
    state.timeLeft = TIME_LIMIT;
  }

  function startLevel(level: number): void {
    state.level = level;
    state.lanes = buildLanes(level);
    state.homes = createHomes();
    state.flyBay = null;
    state.flyTimer = 0;
    state.flyDelay = randDelay();
    respawnHopper();
  }

  function newGame(): void {
    state.runIndex += 1;
    state.rng = seededRng(`${seed}:${state.runIndex}`);
    state.score = 0;
    state.lives = START_LIVES;
    state.extraLifeGiven = false;
    state.newBest = false;
    state.banner = null;
    state.bannerTimer = 0;
    state.deathKind = null;
    state.best = records.bestOf("score") ?? 0;
    state.bestLevel = records.bestOf("level") ?? 0;
    startLevel(1);
    state.phase = "playing";
  }

  function addScore(amount: number): void {
    const prev = state.score;
    state.score = prev + amount;
    if (!state.extraLifeGiven && crossesExtraLife(prev, state.score)) {
      state.lives = Math.min(MAX_LIVES, state.lives + 1);
      state.extraLifeGiven = true;
      setBanner("Extra Life!");
    }
  }

  function submitRun(): void {
    const result = records.submit({ score: state.score, level: state.level });
    state.best = result.best.score ?? state.best;
    state.bestLevel = result.best.level ?? state.bestLevel;
    state.newBest = result.improved.includes("score") && state.score > 0;
  }

  function death(kind: DeathKind): void {
    if (state.phase !== "playing") return;
    state.phase = "dying";
    state.deathKind = kind;
    state.deathTimer = DEATH_ANIM;
    state.onCarrier = false;
  }

  function finishDeath(): void {
    state.lives -= 1;
    state.deathKind = null;
    if (state.lives <= 0) {
      state.lives = 0;
      state.phase = "gameover";
      submitRun();
      return;
    }
    respawnHopper();
    state.phase = "playing";
  }

  function startNextLevel(): void {
    startLevel(state.level + 1);
    state.phase = "playing";
    setBanner(`Level ${state.level}`);
  }

  function resolveHomeEntry(): void {
    const landing = resolveHomeLanding(state.homes, state.hopperCol);
    if (landing.kind === "miss" || landing.kind === "occupied") {
      death("squish");
      return;
    }
    const bay = state.homes[landing.index]!;
    bay.filled = true;
    state.hopperCol = landing.col;
    const gained = homeScore(state.timeLeft, landing.fly);
    addScore(gained);
    if (landing.fly) {
      bay.fly = false;
      if (state.flyBay === landing.index) {
        state.flyBay = null;
        state.flyTimer = 0;
        state.flyDelay = randDelay();
      }
    }
    if (allFilled(state.homes)) {
      addScore(SCORE_ALL_HOMES);
      state.phase = "cleared";
      state.clearTimer = CLEAR_ANIM;
      setBanner("All Homes Filled!");
    } else {
      setBanner(landing.fly ? "Fly Bonus! +200" : `Home +${gained}`);
      respawnHopper();
    }
  }

  function hop(dir: HopDir): void {
    if (state.phase !== "playing") return;
    const target = resolveHop({ col: state.hopperCol, row: state.hopperRow }, dir);
    if (target === null) return;
    state.facing = dir;
    state.hopTimer = HOP_ANIM;
    state.hopperRow = target.row;
    state.hopperCol = isRiverRow(target.row) ? target.col : snapCol(target.col);
    state.onCarrier = false;
    if (target.row > state.furthestRow) {
      state.furthestRow = target.row;
      addScore(SCORE_FORWARD);
    }
    if (target.row === HOME_ROW) resolveHomeEntry();
    emit();
  }

  function updateFly(dt: number): void {
    if (state.flyBay !== null) {
      state.flyTimer -= dt;
      if (state.flyTimer <= 0) {
        const bay = state.homes[state.flyBay];
        if (bay !== undefined) bay.fly = false;
        state.flyBay = null;
        state.flyDelay = randDelay();
      }
      return;
    }
    state.flyDelay -= dt;
    if (state.flyDelay <= 0) {
      const index = pickEmptyBay(state.homes, state.rng);
      if (index === null) {
        state.flyDelay = 1.5;
        return;
      }
      state.homes[index]!.fly = true;
      state.flyBay = index;
      state.flyTimer = FLY_DURATION;
    }
  }

  function resolveHopperContinuous(dt: number): void {
    const row = state.hopperRow;
    if (isRiverRow(row)) {
      const lane = laneForRow(row);
      if (lane === undefined) return;
      const support = carrierSupportAt(lane, state.hopperCol);
      if (support.supported) {
        state.onCarrier = true;
        state.hopperCol += support.dir * support.speed * dt;
        if (isOffField(state.hopperCol)) death("splash");
      } else {
        state.onCarrier = false;
        death("splash");
      }
    } else if (isRoadRow(row)) {
      state.onCarrier = false;
      const lane = laneForRow(row);
      if (lane !== undefined && vehicleHitsCol(lane, state.hopperCol)) death("squish");
    } else {
      state.onCarrier = false;
    }
  }

  function tick(dt: number): void {
    if (dt <= 0) {
      emit();
      return;
    }
    const step = Math.min(dt, 0.05);
    state.parallax = (state.parallax + PARALLAX_SPEED * step) % 1000;

    if (state.phase === "ready" || state.phase === "paused" || state.phase === "gameover") {
      emit();
      return;
    }

    for (const lane of state.lanes) advanceLane(lane, step, state.level);

    if (state.phase === "playing") {
      updateFly(step);
      state.timeLeft -= step;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        death("timeout");
      } else {
        resolveHopperContinuous(step);
      }
    }

    if (state.phase === "dying") {
      state.deathTimer -= step;
      if (state.deathTimer <= 0) finishDeath();
    } else if (state.phase === "cleared") {
      state.clearTimer -= step;
      if (state.clearTimer <= 0) startNextLevel();
    }

    if (state.hopTimer > 0) state.hopTimer = Math.max(0, state.hopTimer - step);
    if (state.bannerTimer > 0) {
      state.bannerTimer -= step;
      if (state.bannerTimer <= 0) state.banner = null;
    }
    emit();
  }

  function confirm(): void {
    if (state.phase === "ready" || state.phase === "gameover") {
      newGame();
      emit();
    }
  }

  function togglePause(): void {
    if (state.phase === "playing") state.phase = "paused";
    else if (state.phase === "paused") state.phase = "playing";
    else return;
    emit();
  }

  function restart(): void {
    newGame();
    emit();
  }

  function buildSnapshot(): HopperSnapshot {
    return {
      phase: state.phase,
      score: state.score,
      best: Math.max(state.best, state.score),
      bestLevel: Math.max(state.bestLevel, state.level),
      lives: state.lives,
      level: state.level,
      timeLeft: state.timeLeft,
      timeFrac: timeFraction(state.timeLeft),
      homes: state.homes.map((bay) => ({ col: bay.col, filled: bay.filled, fly: bay.fly })),
      lanes: state.lanes.map((lane) => ({
        row: lane.row,
        kind: lane.kind,
        variant: lane.variant,
        dir: lane.dir,
        submerged: lane.submerged,
        blinking: lane.blinking,
        bodies: laneBodies(lane),
      })),
      hopper: {
        col: state.hopperCol,
        row: state.hopperRow,
        facing: state.facing,
        hop: state.hopTimer > 0 ? 1 - state.hopTimer / HOP_ANIM : 1,
        onCarrier: state.onCarrier,
      },
      deathKind: state.deathKind,
      deathProgress: state.deathKind !== null ? 1 - Math.max(0, state.deathTimer) / DEATH_ANIM : 0,
      clearProgress: state.phase === "cleared" ? 1 - Math.max(0, state.clearTimer) / CLEAR_ANIM : 0,
      banner: state.bannerTimer > 0 ? state.banner : null,
      newBest: state.newBest,
      parallax: state.parallax,
    };
  }

  function emit(): void {
    snapshot = buildSnapshot();
    for (const listener of listeners) listener(snapshot);
  }

  function preview(): void {
    state.runIndex += 1;
    state.rng = seededRng(`${seed}:preview`);
    state.level = 3;
    state.score = 4820;
    state.lives = 2;
    state.extraLifeGiven = true;
    state.lanes = buildLanes(3);
    state.homes = createHomes();
    state.homes[0]!.filled = true;
    state.homes[4]!.filled = true;
    state.homes[2]!.fly = true;
    state.flyBay = 2;
    state.flyTimer = FLY_DURATION;
    state.best = Math.max(records.bestOf("score") ?? 0, 6120);
    state.bestLevel = Math.max(records.bestOf("level") ?? 0, 4);
    for (const lane of state.lanes) advanceLane(lane, 2.4, 3);
    const river = laneForRow(9);
    if (river !== undefined) {
      const body = laneBodies(river)[0]!;
      state.hopperRow = 9;
      state.hopperCol = body.x + body.len / 2 - 0.5;
    } else {
      state.hopperRow = 9;
      state.hopperCol = START_COL;
    }
    state.facing = "up";
    state.hopTimer = 0;
    state.onCarrier = true;
    state.furthestRow = 9;
    state.timeLeft = 21;
    state.deathKind = null;
    state.phase = "playing";
    setBanner("Cross to the Fly!");
    emit();
  }

  startLevel(1);
  state.phase = "ready";
  snapshot = buildSnapshot();

  return {
    getState: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hop,
    confirm,
    togglePause,
    restart,
    tick,
    preview,
  };
}

export const roadHopperStore = createRoadHopperStore();
