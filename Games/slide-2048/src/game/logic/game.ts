import type { Dir, Tile } from "./board";
import { hasWon, isGameOver, slide, spawnTile } from "./board";

export const STORE_KEY = "game";

export interface GameSnapshot {
  tiles: Tile[];
  score: number;
  spawnCount: number;
  nextId: number;
  moveCount: number;
  won: boolean;
  keepGoing: boolean;
  over: boolean;
}

export interface GameState extends GameSnapshot {
  seed: string;
  best: number;
  history: GameSnapshot | null;
}

function cloneTiles(tiles: readonly Tile[]): Tile[] {
  return tiles.map((t) => ({ ...t }));
}

function snapshotOf(state: GameState): GameSnapshot {
  return {
    tiles: cloneTiles(state.tiles),
    score: state.score,
    spawnCount: state.spawnCount,
    nextId: state.nextId,
    moveCount: state.moveCount,
    won: state.won,
    keepGoing: state.keepGoing,
    over: state.over,
  };
}

export function createGame(seed: string, best = 0): GameState {
  let tiles: Tile[] = [];
  let spawnCount = 0;
  let nextId = 1;
  for (let i = 0; i < 2; i += 1) {
    const spawn = spawnTile(tiles, spawnCount, seed, nextId, 0);
    if (spawn === null) break;
    tiles = [...tiles, spawn];
    spawnCount += 1;
    nextId += 1;
  }
  return {
    tiles,
    score: 0,
    spawnCount,
    nextId,
    moveCount: 0,
    won: false,
    keepGoing: false,
    over: false,
    seed,
    best,
    history: null,
  };
}

export function applyMove(state: GameState, dir: Dir): GameState {
  if (state.over) return state;
  const gen = state.moveCount + 1;
  const result = slide(state.tiles, dir, gen);
  if (!result.moved) return state;

  const history = snapshotOf(state);
  let tiles = result.tiles;
  let spawnCount = state.spawnCount;
  let nextId = state.nextId;
  const spawn = spawnTile(tiles, spawnCount, state.seed, nextId, gen);
  if (spawn !== null) {
    tiles = [...tiles, spawn];
    spawnCount += 1;
    nextId += 1;
  }

  const score = state.score + result.gained;
  return {
    ...state,
    tiles,
    score,
    best: Math.max(state.best, score),
    spawnCount,
    nextId,
    moveCount: gen,
    won: state.won || hasWon(tiles),
    over: isGameOver(tiles),
    history,
  };
}

export function undoMove(state: GameState): GameState {
  const h = state.history;
  if (h === null) return state;
  return {
    ...state,
    tiles: h.tiles.map((t) => ({ ...t, merged: false, isNew: false })),
    score: h.score,
    spawnCount: h.spawnCount,
    nextId: h.nextId,
    moveCount: h.moveCount,
    won: h.won,
    keepGoing: h.keepGoing,
    over: h.over,
    history: null,
  };
}

export function keepPlaying(state: GameState): GameState {
  return { ...state, keepGoing: true };
}

export function randomSeed(): string {
  const entropy =
    typeof Date !== "undefined" ? Date.now() : 0;
  const noise = Math.floor(Math.random() * 0xffffffff);
  return ((entropy ^ noise) >>> 0).toString(36);
}
