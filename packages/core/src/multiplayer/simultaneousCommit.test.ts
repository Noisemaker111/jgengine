import { describe, expect, test } from "bun:test";

import { createCommitRound, resolveCommits } from "./simultaneousCommit";

interface Play {
  card: string;
  lane: number;
}

describe("simultaneous hidden-commit + reveal", () => {
  test("actions stay hidden until every participant has sealed", () => {
    const round = createCommitRound<Play>({ participants: ["a", "b"] });

    const first = round.seal("a", { card: "ironman", lane: 1 }, 10);
    expect(first).toEqual({ ok: true, allSealed: false });
    expect(round.reveal()).toBeNull();
    expect(round.phase).toBe("collecting");
    expect(round.pending()).toEqual(["b"]);

    const second = round.seal("b", { card: "hulk", lane: 2 }, 12);
    expect(second).toEqual({ ok: true, allSealed: true });

    const revealed = round.reveal();
    expect(revealed).not.toBeNull();
    expect(round.phase).toBe("revealed");
  });

  test("reveal order follows participant order, not seal arrival order", () => {
    const round = createCommitRound<Play>({ participants: ["a", "b", "c"] });
    round.seal("c", { card: "z", lane: 0 }, 3);
    round.seal("a", { card: "x", lane: 0 }, 1);
    round.seal("b", { card: "y", lane: 0 }, 2);

    const revealed = round.reveal()!;
    expect(revealed.map((c) => c.playerId)).toEqual(["a", "b", "c"]);
  });

  test("resolution is deterministic regardless of arrival order", () => {
    const play = (order: readonly string[]): string => {
      const round = createCommitRound<Play>({ participants: ["a", "b"] });
      const actions: Record<string, Play> = {
        a: { card: "ironman", lane: 1 },
        b: { card: "hulk", lane: 2 },
      };
      for (const id of order) round.seal(id, actions[id]!, 0);
      return resolveCommits(round.reveal()!, (ordered) =>
        ordered.map((c) => `${c.playerId}:${c.action.card}@${c.action.lane}`).join("|"),
      );
    };
    expect(play(["a", "b"])).toBe(play(["b", "a"]));
    expect(play(["a", "b"])).toBe("a:ironman@1|b:hulk@2");
  });

  test("double seal is rejected by default and cannot leak a change post-reveal", () => {
    const round = createCommitRound<Play>({ participants: ["a", "b"] });
    round.seal("a", { card: "x", lane: 0 }, 0);
    expect(round.seal("a", { card: "y", lane: 1 }, 1)).toEqual({
      ok: false,
      reason: "already_sealed",
    });
    round.seal("b", { card: "z", lane: 0 }, 0);
    round.reveal();
    expect(round.seal("b", { card: "late", lane: 9 }, 5)).toEqual({
      ok: false,
      reason: "already_revealed",
    });
  });

  test("allowReseal lets a player change until all-ready locks the round", () => {
    const round = createCommitRound<Play>({ participants: ["a", "b"], allowReseal: true });
    round.seal("a", { card: "x", lane: 0 }, 0);
    round.seal("a", { card: "x2", lane: 3 }, 1);
    round.seal("b", { card: "y", lane: 0 }, 0);
    const revealed = round.reveal()!;
    expect(revealed[0]!.action.card).toBe("x2");
  });

  test("an outsider cannot seal into the round", () => {
    const round = createCommitRound<Play>({ participants: ["a"] });
    expect(round.seal("intruder", { card: "x", lane: 0 }, 0)).toEqual({
      ok: false,
      reason: "unknown_participant",
    });
  });
});
