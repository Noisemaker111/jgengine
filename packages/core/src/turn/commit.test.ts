import { describe, expect, test } from "bun:test";
import { createCommitController } from "@jgengine/core/turn/commit";
import { createTurnLoop } from "@jgengine/core/turn/turnLoop";

interface PlayCard {
  card: string;
}

describe("immediate commit", () => {
  test("submit resolves right away", () => {
    const commit = createCommitController<PlayCard>({ mode: "immediate" });
    const outcome = commit.submit("p1", { card: "strike" });
    expect(outcome.status).toBe("committed");
    expect(outcome.committed).toEqual([{ participant: "p1", action: { card: "strike" } }]);
    expect(commit.pending()).toEqual([]);
  });
});

describe("simultaneous hidden-reveal commit", () => {
  test("sealed actions stay hidden until all ready, then reveal in participant order", () => {
    const commit = createCommitController<PlayCard>({ mode: "simultaneous", participants: ["p1", "p2"] });
    expect(commit.submit("p2", { card: "b" }).status).toBe("sealed");
    expect(commit.allReady()).toBe(false);
    expect(commit.reveal()).toEqual([]);
    commit.submit("p1", { card: "a" });
    expect(commit.allReady()).toBe(true);
    expect(commit.reveal()).toEqual([
      { participant: "p1", action: { card: "a" } },
      { participant: "p2", action: { card: "b" } },
    ]);
  });

  test("double submit before reveal is rejected", () => {
    const commit = createCommitController<PlayCard>({ mode: "simultaneous", participants: ["p1"] });
    commit.submit("p1", { card: "a" });
    expect(commit.submit("p1", { card: "b" }).status).toBe("rejected");
  });
});

describe("rewind-then-commit", () => {
  test("pending actions are visible, rewind discards, commit finalizes", () => {
    const commit = createCommitController<PlayCard>({ mode: "rewind", participants: ["p1"] });
    commit.submit("p1", { card: "a" });
    expect(commit.pending()).toEqual([{ participant: "p1", action: { card: "a" } }]);
    expect(commit.rewind()).toEqual([{ participant: "p1", action: { card: "a" } }]);
    expect(commit.pending()).toEqual([]);
    commit.submit("p1", { card: "c" });
    expect(commit.commit()).toEqual([{ participant: "p1", action: { card: "c" } }]);
    expect(commit.pending()).toEqual([]);
  });

  test("rewind mode allows re-submitting the same participant", () => {
    const commit = createCommitController<PlayCard>({ mode: "rewind", participants: ["p1"] });
    commit.submit("p1", { card: "a" });
    expect(commit.submit("p1", { card: "b" }).status).toBe("pending");
    expect(commit.pending()).toEqual([{ participant: "p1", action: { card: "b" } }]);
  });
});

describe("turnLoop hosts a commit controller", () => {
  test("mode flows through from config", () => {
    const loop = createTurnLoop<PlayCard>({ order: ["p1", "p2"], commit: { mode: "simultaneous" } });
    expect(loop.commit.mode).toBe("simultaneous");
    loop.commit.submit("p1", { card: "x" });
    loop.commit.submit("p2", { card: "y" });
    expect(loop.commit.reveal().map((s) => s.participant)).toEqual(["p1", "p2"]);
  });
});
