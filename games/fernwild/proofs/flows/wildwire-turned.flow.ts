import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** Review shot: the Hivemind enraged in her lair, her signal turning the technician's own bots on them. */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.phase === 1 && p.health > 0, { timeoutMs: 120000 });
    // A level-30 survivor at the Green Obelisk with two uploaded bots and Gamma's tribute.
    await f.command("cheat", { clock: 1800, xp: 5000, spend: { health: 30 }, teleport: [669, 247, 0] });
    await f.command("cheat", { summon: { species: "scrapper", level: 30, distance: 9, side: -7, tamed: true } });
    await f.command("cheat", { summon: { species: "lodestone", level: 20, distance: 6, side: 5, tamed: true } });
    await f.command("cheat", { teleport: [669, 258, 0], give: { artifact_clever: 1, artifact_hunter: 1, artifact_massive: 1 } });
    await f.waitFor((p) => p.atObelisk === 1, { timeoutMs: 5000 });
    await f.command("summonBoss", { tier: "gamma" });
    await f.waitFor((p) => p.hive === 1, { timeoutMs: 3000 });
    await f.command("cheat", { clock: 1830 });
    await f.waitFor((p) => p.hive === 2 && p.inLair === 1, { timeoutMs: 5000 });
    // Generated robot models build on first sight: give software rendering time to load them.
    await f.wait(35000);
    // Straight to her last third: enraged, she turns the survivor's bots.
    await f.command("cheat", { hiveHealth: 0.3 });
    await f.waitFor((p) => p.hivePhase === 3, { timeoutMs: 5000 });
    await f.wait(2500);
    await f.shot("wildwire-hive-turned");
  },
});
