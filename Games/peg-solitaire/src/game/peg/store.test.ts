import { describe, expect, test } from "bun:test";

import { parseKey } from "./logic";
import { createPegStore, type PegStore } from "./store";

function hasPeg(store: PegStore, r: number, c: number): boolean {
  return store.getState().pegs.some((p) => p.r === r && p.c === c);
}

/** Greedy self-play to a terminal board through the public click API. */
function playToEnd(store: PegStore): void {
  for (let guard = 0; guard < 400; guard += 1) {
    const s = store.getState();
    if (s.status === "over") return;
    if (s.selected !== null && s.landings.length > 0) {
      const to = s.landings[0]!;
      store.pickHole(to.r, to.c);
      continue;
    }
    const key = s.movable[0];
    if (key === undefined) return;
    const { r, c } = parseKey(key);
    store.pickHole(r, c);
  }
}

describe("peg store — setup", () => {
  test("init lays out the English opening", () => {
    const store = createPegStore();
    store.init();
    const s = store.getState();
    expect(s.boardId).toBe("english");
    expect(s.pegsLeft).toBe(32);
    expect(s.startPegs).toBe(32);
    expect(s.moves).toBe(0);
    expect(s.status).toBe("playing");
    expect(s.selected).toBeNull();
    expect(s.canUndo).toBe(false);
    expect(s.bestPegs).toBeNull();
    expect(hasPeg(store, 3, 3)).toBe(false); // centre empty
  });

  test("getState returns a stable reference between changes", () => {
    const store = createPegStore();
    store.init();
    expect(store.getState()).toBe(store.getState());
  });

  test("switching board resets to that board's opening", () => {
    const store = createPegStore();
    store.init();
    store.setBoard("european");
    expect(store.getState().boardId).toBe("european");
    expect(store.getState().pegsLeft).toBe(36);
    expect(store.getState().moves).toBe(0);
  });

  test("exactly four pegs can move at the opening", () => {
    const store = createPegStore();
    store.init();
    expect(store.getState().movable.length).toBe(4);
  });
});

describe("peg store — interaction", () => {
  test("clicking a movable peg selects it and reveals its landings", () => {
    const store = createPegStore();
    store.init();
    store.pickHole(1, 3);
    const s = store.getState();
    expect(s.selected).toEqual({ r: 1, c: 3 });
    expect(s.landings).toEqual([{ r: 3, c: 3 }]);
  });

  test("clicking a peg that cannot jump nudges it and selects nothing", () => {
    const store = createPegStore();
    store.init();
    store.pickHole(2, 0); // arm corner, no legal jump at the opening
    const s = store.getState();
    expect(s.selected).toBeNull();
    expect(s.nudge).toBe("2,0");
  });

  test("clicking the selected peg again deselects it", () => {
    const store = createPegStore();
    store.init();
    store.pickHole(1, 3);
    store.pickHole(1, 3);
    expect(store.getState().selected).toBeNull();
  });

  test("selecting then clicking a landing performs the jump and captures", () => {
    const store = createPegStore();
    store.init();
    store.pickHole(1, 3);
    store.pickHole(3, 3);
    const s = store.getState();
    expect(s.moves).toBe(1);
    expect(s.pegsLeft).toBe(31);
    expect(hasPeg(store, 1, 3)).toBe(false); // mover left
    expect(hasPeg(store, 2, 3)).toBe(false); // captured peg gone
    expect(hasPeg(store, 3, 3)).toBe(true); // landed
    expect(s.capturing.some((cap) => cap.r === 2 && cap.c === 3)).toBe(true);
    expect(s.hopping).not.toBeNull();
  });

  test("jumpTo drives the same jump directly (drag path)", () => {
    const store = createPegStore();
    store.init();
    store.jumpTo(3, 1, 3, 3);
    expect(store.getState().pegsLeft).toBe(31);
    expect(hasPeg(store, 3, 2)).toBe(false);
  });

  test("clearSelection drops the current selection", () => {
    const store = createPegStore();
    store.init();
    store.pickHole(1, 3);
    store.clearSelection();
    expect(store.getState().selected).toBeNull();
  });
});

describe("peg store — hint, undo, restart", () => {
  test("a hint surfaces a currently legal jump", () => {
    const store = createPegStore();
    store.init();
    store.showHint();
    const hint = store.getState().hint;
    expect(hint).not.toBeNull();
    expect(hint!.to).toEqual({ r: 3, c: 3 });
  });

  test("undo restores the captured peg and rewinds the move counter", () => {
    const store = createPegStore();
    store.init();
    store.jumpTo(1, 3, 3, 3);
    expect(store.getState().canUndo).toBe(true);
    store.undo();
    const s = store.getState();
    expect(s.moves).toBe(0);
    expect(s.pegsLeft).toBe(32);
    expect(hasPeg(store, 2, 3)).toBe(true); // capture undone
    expect(hasPeg(store, 3, 3)).toBe(false);
    expect(s.canUndo).toBe(false);
  });

  test("undo unwinds several moves in order", () => {
    const store = createPegStore();
    store.init();
    store.jumpTo(1, 3, 3, 3); // captures (2,3), fills centre; (2,3) now empty
    store.jumpTo(2, 1, 2, 3); // captures (2,2), lands in the vacated (2,3)
    expect(store.getState().moves).toBe(2);
    expect(store.getState().pegsLeft).toBe(30);
    store.undo();
    store.undo();
    expect(store.getState().moves).toBe(0);
    expect(store.getState().pegsLeft).toBe(32);
  });

  test("restart returns to the opening", () => {
    const store = createPegStore();
    store.init();
    store.jumpTo(1, 3, 3, 3);
    store.restart();
    const s = store.getState();
    expect(s.moves).toBe(0);
    expect(s.pegsLeft).toBe(32);
    expect(s.canUndo).toBe(false);
  });
});

describe("peg store — terminal states and records", () => {
  test("every jump removes exactly one peg, so moves = start - pegsLeft", () => {
    const store = createPegStore();
    store.init();
    playToEnd(store);
    const s = store.getState();
    expect(s.status).toBe("over");
    expect(s.outcome).not.toBeNull();
    expect(s.moves).toBe(s.startPegs - s.pegsLeft);
  });

  test("reaching a terminal board records a best score for that board", () => {
    const store = createPegStore();
    store.init();
    playToEnd(store);
    const s = store.getState();
    expect(s.bestPegs).toBe(s.pegsLeft);
    expect(s.bestMoves).toBe(s.moves);
    expect(s.newRecord).toBe(true);
  });

  test("no further moves are accepted once the board is over", () => {
    const store = createPegStore();
    store.init();
    playToEnd(store);
    const movesAtEnd = store.getState().moves;
    store.pickHole(3, 3);
    expect(store.getState().moves).toBe(movesAtEnd);
  });
});

describe("peg store — preview scenario", () => {
  test("preview stages a mid-game English board with a selected peg and a best", () => {
    const store = createPegStore();
    store.preview();
    const s = store.getState();
    expect(s.boardId).toBe("english");
    expect(s.status).toBe("playing");
    expect(s.moves).toBeGreaterThan(0);
    expect(s.selected).not.toBeNull();
    expect(s.landings.length).toBeGreaterThan(0);
    expect(s.bestPegs).toBe(2);
  });
});
