import { defineFlow } from "@jgengine/core/play/flow";

import { game } from "../../src/game.config";
import { INCIDENTS } from "../../src/game/sim/events";

/** A player checks on the household about every few seconds of a day. */
const LOOK_MS = 3000;
/** A term is a handful of days; past this the first review never came and the flow fails. */
const MAX_LOOKS = 4000;
/** Reading a transmission before answering it. */
const READ_MS = 4000;

/**
 * A new household lived through its first charter term the way a first-time player plays it: the
 * members go about their days on their own, every transmission is read and answered (the careful
 * choice the slip offers), and when the term closes its review is read and dismissed.
 */
export default defineFlow(game, {
  async run(f) {
    await f.waitFor((p) => p.members === 4, { timeoutMs: 40_000, note: "a new household of four moves in" });
    const start = await f.expect((p) => p.day === 0 && p.term === 0, "the charter's first day of its first term");
    let answered = 0;
    for (let look = 0; look < MAX_LOOKS; look += 1) {
      const p = await f.probe();
      if (p.review === 1) break;
      if (p.incident === 1 && p.incidentKind >= 0) {
        const incident = INCIDENTS[p.incidentKind];
        await f.wait(READ_MS);
        if (incident?.fallback !== undefined && (await f.tryCommand("incident.answer", { choice: incident.fallback })).status === "applied") answered += 1;
        continue;
      }
      await f.wait(LOOK_MS);
    }
    await f.expect((p) => p.review === 1, "the first term closed and its review is up");
    await f.wait(READ_MS);
    await f.command("charter.dismiss", {});
    await f.expect((p) => p.review === 0 && p.term >= 1 && p.credits !== start.credits, "the review is read: a second term has begun, and the household earned and spent along the way");
    if (answered === 0) await f.expect(() => false, "no transmission came in a whole term");
  },
});
