import { seedFromUrl, withSeedParam } from "@jgengine/core/random/seedLink";

import { isSolved, press as togglePress } from "./logic/board";
import {
  LEVEL_COUNT,
  generateCampaignBoard,
  generateRandomBoard,
  parForLevel,
  starsFor,
} from "./logic/campaign";
import { hintCell as optimalHintCell } from "./logic/solver";
import { allLevelBests, randomBest, submitLevel, submitRandom } from "./records";

export type Screen = "levels" | "play";
export type Mode = "campaign" | "random";

export interface AppSnapshot {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly levelIndex: number;
  readonly board: number;
  readonly par: number;
  readonly presses: number;
  readonly hintsUsed: number;
  readonly hintCell: number | null;
  readonly canUndo: boolean;
  readonly solved: boolean;
  readonly stars: number;
  readonly newRecord: boolean;
  readonly seed: string;
  readonly shareUrl: string;
  readonly levelBests: readonly (number | null)[];
  readonly randomBest: number | null;
}

export interface AppStore {
  getState(): AppSnapshot;
  subscribe(listener: (snapshot: AppSnapshot) => void): () => void;
  init(): void;
  openLevels(): void;
  startLevel(level: number): void;
  startRandom(seed?: string): void;
  press(cell: number): void;
  hint(): void;
  undo(): void;
  restart(): void;
  next(): void;
  back(): void;
  preview(): void;
}

function currentHref(): string {
  if (typeof window === "undefined") return "";
  const href = window.location?.href;
  return typeof href === "string" ? href : "";
}

let seedCounter = 0;
function generateSeed(): string {
  seedCounter += 1;
  const now = typeof Date !== "undefined" ? Date.now() : 0;
  return (now * 31 + seedCounter).toString(36).slice(-7);
}

export function createAppStore(): AppStore {
  let screen: Screen = "levels";
  let mode: Mode = "campaign";
  let levelIndex = 0;
  let board = 0;
  let initialBoard = 0;
  let par = parForLevel(0);
  let presses = 0;
  let hintsUsed = 0;
  let hint: number | null = null;
  let history: number[] = [];
  let solved = false;
  let stars = 0;
  let newRecord = false;
  let seed = "";

  const listeners = new Set<(snapshot: AppSnapshot) => void>();

  function snapshot(): AppSnapshot {
    return {
      screen,
      mode,
      levelIndex,
      board,
      par,
      presses,
      hintsUsed,
      hintCell: hint,
      canUndo: history.length > 0 && !solved,
      solved,
      stars,
      newRecord,
      seed,
      shareUrl: seed === "" ? "" : withSeedParam(currentHref(), seed),
      levelBests: allLevelBests(),
      randomBest: randomBest(),
    };
  }

  let current = snapshot();
  function emit(): void {
    current = snapshot();
    for (const listener of listeners) listener(current);
  }

  function loadBoard(nextBoard: number, nextPar: number): void {
    board = nextBoard;
    initialBoard = nextBoard;
    par = nextPar;
    presses = 0;
    hintsUsed = 0;
    hint = null;
    history = [];
    solved = false;
    stars = 0;
    newRecord = false;
  }

  function finish(): void {
    solved = true;
    hint = null;
    stars = starsFor(presses, par);
    newRecord = mode === "campaign" ? submitLevel(levelIndex, presses) : submitRandom(presses);
  }

  function pressAt(cell: number): void {
    if (screen !== "play" || solved) return;
    history.push(board);
    board = togglePress(board, cell);
    presses += 1;
    hint = null;
    if (isSolved(board)) finish();
    emit();
  }

  function startLevel(level: number): void {
    const clamped = Math.max(0, Math.min(LEVEL_COUNT - 1, level));
    const generated = generateCampaignBoard(clamped);
    mode = "campaign";
    levelIndex = clamped;
    seed = "";
    loadBoard(generated.board, generated.par);
    screen = "play";
    emit();
  }

  function startRandom(nextSeed?: string): void {
    const chosen = nextSeed !== undefined && nextSeed !== "" ? nextSeed : generateSeed();
    const generated = generateRandomBoard(chosen);
    mode = "random";
    levelIndex = -1;
    seed = chosen;
    loadBoard(generated.board, generated.par);
    screen = "play";
    emit();
  }

  return {
    getState: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    init() {
      const fromUrl = currentHref() === "" ? null : seedFromUrl(currentHref());
      if (fromUrl !== null && fromUrl !== "") startRandom(fromUrl);
      else emit();
    },
    openLevels() {
      screen = "levels";
      emit();
    },
    startLevel,
    startRandom,
    press(cell) {
      pressAt(cell);
    },
    hint() {
      if (screen !== "play" || solved) return;
      const cell = optimalHintCell(board);
      if (cell === null) return;
      hint = cell;
      hintsUsed += 1;
      emit();
    },
    undo() {
      if (solved || history.length === 0) return;
      const previous = history.pop();
      if (previous === undefined) return;
      board = previous;
      presses = Math.max(0, presses - 1);
      hint = null;
      emit();
    },
    restart() {
      board = initialBoard;
      presses = 0;
      hintsUsed = 0;
      hint = null;
      history = [];
      solved = false;
      stars = 0;
      newRecord = false;
      emit();
    },
    next() {
      if (mode === "random") {
        startRandom();
        return;
      }
      if (levelIndex < LEVEL_COUNT - 1) startLevel(levelIndex + 1);
      else {
        screen = "levels";
        emit();
      }
    },
    back() {
      if (screen === "play") {
        screen = "levels";
        emit();
      }
    },
    preview() {
      startLevel(6);
      pressAt(7);
      pressAt(12);
      pressAt(18);
    },
  };
}

export const store = createAppStore();
