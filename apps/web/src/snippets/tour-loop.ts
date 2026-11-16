import { defineStore, defineSystem } from "@jgengine/shell/gameKit";

import { drain, gather, newRun, type Run } from "./tour-rules";

// State is one typed slot in the game store, so saves, replays and
// multiplayer snapshots carry it.
export const run = defineStore<Run>("run", newRun);

// A system is a schedule plus a function. The engine owns the frame loop.
export const gatherLoop = defineSystem({
  id: "gather-loop",
  tick: { type: "frame" },
  update(ctx, dt) {
    let next = drain(run.read(ctx), dt);
    if (ctx.input.justPressed("interact")) next = gather(next, ctx.rng);
    run.write(ctx, next);
  },
});
