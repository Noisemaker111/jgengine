import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * A new diver's first dive, on the keys: walk down Marrow's workshop to the rail, ride it down to
 * Bellwether, search the receiving spool for its wire, carry it back across the floor and ride the rail
 * home, where the haul is banked.
 */
export default defineFlow(game, {
  async run(f) {
    // The title card's Enter: into Marrow, where a new record stands at the workshop.
    await f.command("deepward.enter", {});
    await f.waitFor((p) => p.inDive === 0 && p.returns === 0, { timeoutMs: 20_000, note: "a new diver stands in Marrow, never dived" });
    // turn to face down the workshop, and walk to the Garage anchor
    await f.heading(Math.PI);
    await f.hold("KeyW", { until: (p) => p.z < 9.5, timeoutMs: 10_000 });
    // take the rail: the world swaps to Bellwether and the air tank starts
    await f.press("KeyE");
    await f.waitFor((p) => p.inDive === 1, { timeoutMs: 15_000, note: "the rail carried the diver down to Bellwether" });
    // across the receiving floor (the rail is behind at z 1.9) to the spool of wire
    await f.hold("KeyW", { until: (p) => p.z < -3.5, timeoutMs: 10_000 });
    await f.hold("KeyA", { until: (p) => p.x < -3.8, timeoutMs: 10_000 });
    await f.waitFor((p) => p.x < -3.8 && p.x > -6, { timeoutMs: 2000, note: "at the receiving spool" });
    // the 1.4 s search channel, then the wire is in the cache
    await f.press("KeyE");
    await f.waitFor((p) => p.carried >= 1, { timeoutMs: 15_000, note: "the wire is carried" });
    // the search's completion sheet swallows a key hold that starts on the frame it closes
    await f.hold("KeyS", { ms: 300 });
    // back across the floor to the rail's line, and ride it home
    await f.hold("KeyD", { until: (p) => p.x > -1.4, timeoutMs: 10_000 });
    await f.hold("KeyS", { until: (p) => p.z > 1.2, timeoutMs: 10_000 });
    await f.waitFor((p) => Math.hypot(p.x, p.z - 1.9) < 1.9, { timeoutMs: 10_000, note: "at the rail" });
    await f.press("KeyE");
    await f.waitFor((p) => p.returns === 1, { timeoutMs: 20_000, note: "the rail settled the dive" });
    await f.expect((p) => p.inDive === 0 && p.banked > 0, "home with the haul banked: the next dive starts richer");
  },
});
