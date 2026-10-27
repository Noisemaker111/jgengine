import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.expectPage("__jgProbe().inDive === 0 && /rail departure/i.test(document.body.innerText)", "arrival: the diver is standing at Marrow's departure rail, not the title card");
    // walk down the workshop to the Garage anchor
    await f.hold("KeyW", { until: (p) => p.z < 9.5, timeoutMs: 10000 });
    // take the rail: the world swaps to Bellwether and the air tank starts
    await f.press("KeyE");
    await f.waitFor((p) => p.inDive === 1, { timeoutMs: 15000 });
    // walk into Bellwether's receiving floor; the rail is behind at z 1.9, so any z below -3.5 is the corridor crossed. Held to arrival: the first vault frames are slow on software GL, so a fixed hold walked too short
    await f.hold("KeyW", { until: (p) => p.z < -3.5, timeoutMs: 10000 });
    // stand at the receiving spool of wire
    await f.hold("KeyA", { until: (p) => p.x < -3.8, timeoutMs: 10000 });
    await f.waitFor((p) => p.x < -3.8 && p.x > -6, { timeoutMs: 2000 });
    // arrival: the 1.4 s search channel finished and the wire is in the 4 x 3 cache, so the loot is carried and not just spotted
    await f.press("KeyE");
    await f.waitFor((p) => p.carried >= 1, { timeoutMs: 15000 });
    // hand control back: the search's completion sheet swallows a key hold that starts on the frame it closes
    await f.hold("KeyS", { ms: 300 });
    // step back across the receiving floor to the rail's line
    await f.hold("KeyD", { until: (p) => p.x > -1.4, timeoutMs: 10000 });
    await f.hold("KeyS", { until: (p) => p.z > 1.2, timeoutMs: 10000 });
    // arrival: the rail settled the dive and counted one return, so this dive reached extraction and not just the rail's doorway
    await f.waitFor((p) => Math.hypot(p.x, p.z - 1.9) < 1.9, { timeoutMs: 10000 });
    await f.press("KeyE");
    await f.waitFor((p) => p.returns === 1, { timeoutMs: 20000 });
    await f.expect((p) => p.inDive === 0 && p.banked > 0, "arrival: the carried wire is banked at Marrow - the haul survived the return, which is what makes the next dive different");
  },
});
