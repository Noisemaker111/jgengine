import { describe, expect, test } from "bun:test";

import type { GameContext } from "../runtime/gameContext";
import { continueGame, createGameFlowSystem, newGame, openTitle, playGame, saveNow, togglePause } from "./gameFlow";
import { gamePhase } from "./gamePhase";

function fakeCtx(saved = false) {
  const map = new Map<string, unknown>();
  const calls: string[] = [];
  const notices: string[] = [];
  let running = true;
  const ctx = {
    time: { pause: () => (running = false), play: () => (running = true) },
    game: {
      store: { set: (k: string, v: unknown) => map.set(k, v), get: (k: string) => map.get(k) },
      notices: { push: (n: { text: string }) => notices.push(n.text) },
      save: {
        clear: async () => calls.push("clear"),
        load: async () => (calls.push("load"), saved),
        save: async () => calls.push("save"),
        checkpoint: async () => calls.push("checkpoint"),
      },
    },
  } as unknown as GameContext;
  return { ctx, calls, notices, running: () => running };
}

describe("gameFlow", () => {
  test("title stops the clock; play and pause toggle phase and clock", () => {
    const { ctx, running } = fakeCtx();
    openTitle(ctx);
    expect(gamePhase(ctx)).toBe("menu");
    expect(running()).toBe(false);
    playGame(ctx);
    expect(gamePhase(ctx)).toBe("playing");
    togglePause(ctx);
    expect(gamePhase(ctx)).toBe("paused");
    expect(running()).toBe(false);
    togglePause(ctx);
    expect(gamePhase(ctx)).toBe("playing");
    expect(running()).toBe(true);
  });

  test("a second new game calls restart instead of reusing the world", async () => {
    const { ctx, calls } = fakeCtx();
    let restarts = 0;
    await newGame(ctx, () => restarts++);
    expect(restarts).toBe(0);
    expect(gamePhase(ctx)).toBe("playing");
    await newGame(ctx, () => restarts++);
    expect(restarts).toBe(1);
    expect(calls.filter((c) => c === "clear").length).toBe(2);
  });

  test("continue plays only when a save loads; saveNow posts a notice", async () => {
    const missing = fakeCtx(false);
    openTitle(missing.ctx);
    expect(await continueGame(missing.ctx)).toBe(false);
    expect(gamePhase(missing.ctx)).toBe("menu");
    const present = fakeCtx(true);
    expect(await continueGame(present.ctx)).toBe(true);
    expect(gamePhase(present.ctx)).toBe("playing");
    await saveNow(present.ctx);
    expect(present.notices).toEqual(["Saved"]);
  });

  test("the system checkpoints after the configured seconds of play", () => {
    const { ctx, calls } = fakeCtx();
    const commands = new Map<string, unknown>();
    (ctx.game as unknown as { commands: unknown }).commands = { define: (id: string, c: unknown) => commands.set(id, c) };
    const system = createGameFlowSystem({ checkpointEverySeconds: 2 });
    system.create?.(ctx);
    expect([...commands.keys()].sort()).toEqual(["pause", "start"]);
    expect(gamePhase(ctx)).toBe("menu");
    system.update?.(ctx, 5);
    expect(calls).not.toContain("checkpoint");
    playGame(ctx);
    system.update?.(ctx, 1);
    system.update?.(ctx, 1.5);
    expect(calls.filter((c) => c === "checkpoint").length).toBe(1);
  });
});
