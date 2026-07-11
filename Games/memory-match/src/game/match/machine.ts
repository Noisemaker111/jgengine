export type CardFace = "down" | "up" | "matched";

export type MatchPhase = "idle" | "oneUp" | "resolving" | "won";

export type FlipOutcome = "match" | "mismatch" | null;

export type MatchState = {
  readonly pairIds: readonly number[];
  readonly faces: readonly CardFace[];
  readonly firstUp: number | null;
  readonly secondUp: number | null;
  readonly moves: number;
  readonly matchedPairs: number;
  readonly pairCount: number;
  readonly phase: MatchPhase;
  readonly outcome: FlipOutcome;
  readonly outcomeSeq: number;
};

export function createMatch(pairIds: readonly number[]): MatchState {
  return {
    pairIds: [...pairIds],
    faces: pairIds.map(() => "down"),
    firstUp: null,
    secondUp: null,
    moves: 0,
    matchedPairs: 0,
    pairCount: pairIds.length / 2,
    phase: "idle",
    outcome: null,
    outcomeSeq: 0,
  };
}

export function canFlip(state: MatchState, index: number): boolean {
  if (state.phase === "resolving" || state.phase === "won") return false;
  if (!Number.isInteger(index) || index < 0 || index >= state.faces.length) return false;
  return state.faces[index] === "down";
}

function withFaces(faces: readonly CardFace[], changes: readonly (readonly [number, CardFace])[]): CardFace[] {
  const next = [...faces];
  for (const [index, face] of changes) next[index] = face;
  return next;
}

export function flipCard(state: MatchState, index: number): MatchState {
  if (!canFlip(state, index)) return state;

  if (state.phase === "idle") {
    return {
      ...state,
      faces: withFaces(state.faces, [[index, "up"]]),
      firstUp: index,
      phase: "oneUp",
      outcome: null,
    };
  }

  const first = state.firstUp;
  if (first === null) return state;
  const moves = state.moves + 1;
  const isMatch = state.pairIds[first] === state.pairIds[index];

  if (isMatch) {
    const matchedPairs = state.matchedPairs + 1;
    return {
      ...state,
      faces: withFaces(state.faces, [
        [first, "matched"],
        [index, "matched"],
      ]),
      firstUp: null,
      secondUp: null,
      moves,
      matchedPairs,
      phase: matchedPairs === state.pairCount ? "won" : "idle",
      outcome: "match",
      outcomeSeq: state.outcomeSeq + 1,
    };
  }

  return {
    ...state,
    faces: withFaces(state.faces, [[index, "up"]]),
    secondUp: index,
    moves,
    phase: "resolving",
    outcome: "mismatch",
    outcomeSeq: state.outcomeSeq + 1,
  };
}

export function resolveMismatch(state: MatchState): MatchState {
  if (state.phase !== "resolving") return state;
  const first = state.firstUp;
  const second = state.secondUp;
  if (first === null || second === null) return state;
  return {
    ...state,
    faces: withFaces(state.faces, [
      [first, "down"],
      [second, "down"],
    ]),
    firstUp: null,
    secondUp: null,
    phase: "idle",
    outcome: null,
  };
}
