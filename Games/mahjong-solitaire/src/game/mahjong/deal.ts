import { seededRng } from "@jgengine/core/random/rng";

import { isFree, SLOT_COUNT } from "./layout";
import { buildPairs, groupOf, matchable } from "./tiles";

const MAX_ATTEMPTS = 600;

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export interface Deal {
  readonly faces: ReadonlyArray<string | null>;
  readonly solution: ReadonlyArray<readonly [number, number]>;
}

// Reverse-removal: repeatedly assign a matched pair to two simultaneously-free
// slots, recording the removal order. Replaying that order forward is a
// guaranteed solve, so the deal is always solvable.
function attemptDeal(seed: string): Deal | null {
  const rng = seededRng(seed);
  const pairs = shuffle(buildPairs(), rng);
  const present = new Set<number>();
  for (let i = 0; i < SLOT_COUNT; i += 1) present.add(i);
  const faces: Array<string | null> = new Array<string | null>(SLOT_COUNT).fill(null);
  const solution: Array<[number, number]> = [];
  let pi = 0;
  while (present.size > 0) {
    const free = shuffle([...present].filter((id) => isFree(id, present)), rng);
    if (free.length < 2) return null;
    const a = free[0];
    const b = free[1];
    const pair = pairs[pi];
    pi += 1;
    faces[a] = pair[0];
    faces[b] = pair[1];
    present.delete(a);
    present.delete(b);
    solution.push([a, b]);
  }
  return { faces, solution };
}

export function generateDeal(seed: string): Deal {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const deal = attemptDeal(attempt === 0 ? seed : `${seed}#${attempt}`);
    if (deal !== null) return deal;
  }
  throw new Error(`mahjong: no solvable deal for seed "${seed}"`);
}

export function findFreePairs(
  present: ReadonlySet<number>,
  faces: ReadonlyArray<string | null>,
): Array<[number, number]> {
  const free = [...present].filter((id) => isFree(id, present));
  const out: Array<[number, number]> = [];
  for (let i = 0; i < free.length; i += 1) {
    for (let j = i + 1; j < free.length; j += 1) {
      const fa = faces[free[i]];
      const fb = faces[free[j]];
      if (fa !== null && fb !== null && matchable(fa, fb)) out.push([free[i], free[j]]);
    }
  }
  return out;
}

export function findHint(
  present: ReadonlySet<number>,
  faces: ReadonlyArray<string | null>,
): [number, number] | null {
  const pairs = findFreePairs(present, faces);
  return pairs.length > 0 ? pairs[0] : null;
}

export interface Reshuffle {
  readonly faces: ReadonlyArray<string | null>;
  readonly solution: ReadonlyArray<readonly [number, number]>;
}

// Re-partition the remaining tiles into valid pairs, then reverse-remove over
// the current positions — so a reshuffle is always solvable by construction.
function attemptReshuffle(
  present: ReadonlySet<number>,
  faces: ReadonlyArray<string | null>,
  seed: string,
): Reshuffle | null {
  const rng = seededRng(seed);
  const ids = [...present];
  const counts = new Map<string, number>();
  const flowers: string[] = [];
  const seasons: string[] = [];
  for (const id of ids) {
    const f = faces[id];
    if (f === null) continue;
    const g = groupOf(f);
    if (g === "flower") flowers.push(f);
    else if (g === "season") seasons.push(f);
    else counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  const pairs: Array<[string, string]> = [];
  for (const [f, c] of counts) {
    if (c % 2 !== 0) return null;
    for (let i = 0; i < c / 2; i += 1) pairs.push([f, f]);
  }
  if (flowers.length % 2 !== 0 || seasons.length % 2 !== 0) return null;
  shuffle(flowers, rng);
  for (let i = 0; i < flowers.length; i += 2) pairs.push([flowers[i], flowers[i + 1]]);
  shuffle(seasons, rng);
  for (let i = 0; i < seasons.length; i += 2) pairs.push([seasons[i], seasons[i + 1]]);
  shuffle(pairs, rng);

  const work = new Set<number>(ids);
  const out: Array<string | null> = faces.map(() => null);
  const solution: Array<[number, number]> = [];
  let pi = 0;
  while (work.size > 0) {
    const free = shuffle([...work].filter((id) => isFree(id, work)), rng);
    if (free.length < 2) return null;
    const a = free[0];
    const b = free[1];
    const pair = pairs[pi];
    pi += 1;
    out[a] = pair[0];
    out[b] = pair[1];
    work.delete(a);
    work.delete(b);
    solution.push([a, b]);
  }
  return { faces: out, solution };
}

export function reshuffleRemaining(
  present: ReadonlySet<number>,
  faces: ReadonlyArray<string | null>,
  seed: string,
): Reshuffle | null {
  if (present.size < 2) return null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const result = attemptReshuffle(present, faces, attempt === 0 ? seed : `${seed}#${attempt}`);
    if (result !== null) return result;
  }
  return null;
}
