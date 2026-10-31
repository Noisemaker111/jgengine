import { describe, expect, test } from "bun:test";

import { createInputRecorder, inputReplayProblem } from "@jgengine/core/replay/inputReplay";
import { environment, terrain } from "@jgengine/core/world/features";
import { defineGame } from "@jgengine/shell/defineGame";

import { playInputReplay } from "./inputReplay.draw";
import { createPlaySession } from "./playSession.draw";

function fixture() {
  return defineGame({
    name: "Replay Fixture",
    world: environment({ terrain: terrain() }),
    input: { moveForward: ["KeyW"], moveRight: ["KeyD"] },
    content: { entityById: (id) => (id === "hero" ? { role: "player", movement: { walkSpeed: 4 } } : null) },
    loop: {
      onInit(ctx) {
        ctx.game.commands.define("roll", {
          apply(state) {
            state.game.store.set("roll", Math.round(state.rng() * 1e6));
          },
        });
      },
      onNewPlayer(ctx) {
        ctx.scene.entity.spawn("hero", { id: ctx.player.userId, position: [0, 0, 0] });
      },
    },
    capture: {
      probe: (ctx) => {
        const me = ctx.scene.entity.get(ctx.player.userId);
        return { x: me?.position[0] ?? 0, z: me?.position[2] ?? 0, roll: Number(ctx.game.store.get("roll") ?? -1) };
      },
    },
  });
}

describe("input replay", () => {
  test("a recorded session replays to the same state from its input and seed", () => {
    const game = fixture();
    const recorder = createInputRecorder({ game: game.game.name, seed: "replay-seed" });
    const live = createPlaySession(game, { seed: "replay-seed", recorder });
    for (let frame = 0; frame < 90; frame += 1) {
      if (frame === 30) live.runner.aim({ heading: 0.7 });
      if (frame === 45) live.command("roll", {});
      live.tick(frame < 60 ? ["moveForward"] : ["moveRight"], frame % 3 === 0 ? 1 / 30 : 1 / 60);
    }
    const recorded = game.capture?.probe?.(live.ctx);
    const replay = recorder.snapshot();
    expect(inputReplayProblem(JSON.parse(JSON.stringify(replay)))).toBeNull();
    expect(replay.frames.length).toBe(90);
    expect(replay.commands).toEqual([{ frame: 45, name: "roll", input: {} }]);

    const first = playInputReplay(game, replay, { boot: false });
    const second = playInputReplay(game, JSON.parse(JSON.stringify(replay)), { boot: false });
    expect(first.probe).toEqual(recorded);
    expect(second.probe).toEqual(recorded);
    expect(recorded?.roll).toBeGreaterThanOrEqual(0);
  });

  test("a replay of another game is refused, and the recorder stops at its bound", () => {
    const recorder = createInputRecorder({ game: "Other", maxFrames: 2 });
    for (let frame = 0; frame < 5; frame += 1) recorder.frame({ dt: 1 / 60, held: [], pressed: [], yaw: 0, pitch: 0 });
    expect(recorder.frames()).toBe(2);
    expect(recorder.full()).toBe(true);
    expect(() => playInputReplay(fixture(), recorder.snapshot())).toThrow('replay is of "Other"');
    recorder.reset();
    expect(recorder.frames()).toBe(0);
  });
});
