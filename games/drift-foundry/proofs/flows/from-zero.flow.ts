import { defineFlow, type FlowKey } from "@jgengine/core/play/flow";

import { game } from "../../src/game.config";
import { MAIN_ROUTE } from "@jgengine/core/roads/routeCourse";
import type { SessionSnapshot } from "../../src/game/run/session";
import { createCoursePilot } from "../../src/game/testing/courseDriver";
import { TRACKS } from "../../src/game/tracks/catalog";

/** A driver re-reads the road about ten times a second. */
const FRAME_MS = 100;
/** A run is a minute or two; past this the run never ended. */
const MAX_FRAMES = 3000;
const WON = 2;
const CRUSHED = 3;

/**
 * A new driver's first run, on the keys: the pit wall's start button starts it, then the driver follows the
 * track's racing line with W, S, A and D (Space to hop, Shift to brace the plow) the way the dash and
 * the road read, until the run ends.
 */
export default defineFlow(game, {
  // The pit wall with nothing staged: the driver presses its start button.
  state: "title",
  async run(f) {
    await f.command("startRun", {});
    const start = await f.waitFor((p) => p.phase === 1 && p.track >= 0, { timeoutMs: 10_000, note: "a run is live on the first track" });
    const track = TRACKS[start.track]!;
    const pilot = createCoursePilot(track);
    for (let frame = 0; frame < MAX_FRAMES; frame += 1) {
      const p = await f.probe();
      if (p.phase === WON || p.phase === CRUSHED) break;
      // type-escape: the line follower reads only the pose, run mark, route and clock of a snapshot.
      const snap = { pose: { position: [p.x, p.y, p.z], heading: p.heading, speedKmh: p.speedKmh, airborne: p.airborne === 1 }, run: p.run, route: MAIN_ROUTE, runTime: p.runTime, collectedIds: new Set<string>() } as unknown as SessionSnapshot;
      const { axis, input } = pilot(snap);
      const keys: FlowKey[] = [];
      if (axis.throttle > 0.2) keys.push("KeyW");
      if (axis.brake > 0.2) keys.push("KeyS");
      if (axis.steer > 0.15) keys.push("KeyD");
      if (axis.steer < -0.15) keys.push("KeyA");
      if (input.jumpPressed) keys.push("Space");
      if (input.plowBracing) keys.push("ShiftLeft");
      const [first, ...rest] = keys;
      if (first !== undefined) await f.hold([first, ...rest], { ms: FRAME_MS });
      else await f.wait(FRAME_MS);
    }
    await f.expect((p) => p.phase === WON, "the first run is escaped: the kart beat the compactor out of the yard");
  },
});
