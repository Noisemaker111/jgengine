import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/*
 * Several minutes of ordinary play for a stall hunt (`drive --hitches`, `perf desktop --flow`):
 * walking and looking around Marrow, the pause menu and the stash, a dive, a search, the cache, the
 * lamp, a scan, gunfire, a ride down to a floor not yet loaded, a creature that hunts, and the ride
 * home. Only real input and teleports, so it plays in a shipped build as well as on the dev server.
 */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.expect((p) => p.inDive === 0, "standing in Marrow");
    // a minute of Marrow: walk the workshop and look around it
    await f.hold("KeyW", { ms: 1800 });
    await f.look(500, 0);
    await f.hold("KeyD", { ms: 1500 });
    await f.look(-900, 40);
    await f.hold("KeyS", { ms: 1500 });
    await f.look(400, -40);
    await f.hold(["KeyW", "KeyA"], { ms: 1500 });
    // the pause menu over the live station, and back
    await f.press("Escape");
    await f.wait(1800);
    await f.press("Escape");
    await f.wait(800);
    // the stash bench: the departure docket's other sheet
    await f.command("deepward.openStash");
    await f.wait(2000);
    await f.command("deepward.close");
    await f.wait(800);
    // to the garage and onto the rail: Bellwether loads and the tank starts
    await f.teleport({ x: 0, z: 9.2 });
    await f.press("KeyE");
    await f.waitFor((p) => p.inDive === 1, { timeoutMs: 20000 });
    // receiving floor: walk in, search the spool of wire, pack the cache
    await f.hold("KeyW", { until: (p) => p.z < -3.5, timeoutMs: 10000 });
    await f.hold("KeyA", { until: (p) => p.x < -3.8, timeoutMs: 10000 });
    await f.press("KeyE");
    await f.waitFor((p) => p.carried >= 1, { timeoutMs: 30000 });
    await f.hold("KeyS", { ms: 300 });
    await f.press("Tab");
    await f.waitFor((p) => p.panel === 2, { timeoutMs: 5000 });
    await f.wait(1800);
    await f.press("Tab");
    await f.waitFor((p) => p.panel === 0, { timeoutMs: 5000 });
    await f.wait(600);
    // lamp on, a scan, a burst of fire and a reload
    await f.press("KeyF");
    await f.waitFor((p) => p.lamp === 1, { timeoutMs: 5000 });
    await f.wait(800);
    await f.press("KeyC");
    await f.wait(1500);
    await f.hold("mouse0", { ms: 1600 });
    await f.press("KeyR");
    await f.wait(1800);
    // down the spine toward the printhouse, looking into the rooms off it
    await f.teleport({ x: 0, z: -12 });
    await f.hold("KeyW", { ms: 2500 });
    await f.look(700, 0);
    await f.hold("KeyW", { ms: 2000 });
    await f.look(-1400, 0);
    await f.hold("KeyW", { ms: 2000 });
    await f.look(700, 0);
    // the descent lift to the cold stores, a floor this run has not loaded
    await f.teleport({ x: -1.2, z: -41.6 });
    await f.wait(600);
    await f.press("KeyE");
    await f.waitFor((p) => p.stratum === 2, { timeoutMs: 30000 });
    // off the landing and into the aisles, lamp on so the courier sees it
    await f.hold("KeyS", { ms: 2500 });
    await f.teleport({ x: 0.5, z: -11 });
    await f.look(900, 0);
    await f.hold("KeyW", { ms: 2000 });
    await f.look(-900, 0);
    // stand and fight whatever comes for the light
    await f.wait(6000);
    await f.hold("mouse0", { ms: 2500 });
    await f.press("KeyR");
    await f.wait(2500);
    await f.hold("mouse0", { ms: 2500 });
    await f.wait(3000);
    // the cache again, mid-floor, then back up and home by rail
    await f.press("Tab");
    await f.waitFor((p) => p.panel === 2, { timeoutMs: 5000 });
    await f.wait(1500);
    await f.press("Tab");
    await f.waitFor((p) => p.panel === 0, { timeoutMs: 5000 });
    await f.teleport({ x: 0, z: 16.6 });
    await f.wait(600);
    await f.press("KeyE");
    await f.waitFor((p) => p.stratum === 1, { timeoutMs: 30000 });
    await f.teleport({ x: 0, z: 2.6 });
    await f.wait(600);
    await f.press("KeyE");
    await f.waitFor((p) => p.inDive === 0, { timeoutMs: 20000 });
    await f.wait(2500);
    await f.click("Back to Marrow");
    // a last walk round the workshop
    await f.hold("KeyW", { ms: 2000 });
    await f.look(800, 0);
    await f.hold("KeyW", { ms: 2000 });
    await f.press("Escape");
    await f.wait(1500);
    await f.press("Escape");
    await f.wait(1000);
  },
});
