import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** A click on the lot at ground point (x, z), as the park's pointer command receives it from the canvas. */
const click = (x: number, z: number) => ({ point: [x, 0, z], entity: null, object: null });

/**
 * A new game from nothing, the first 10 minutes at 1x, through the palette keys and the commands the
 * HUD's own buttons dispatch: an empty lot and a shut gate, a path in, the carousel, "Connect it", the
 * gate, the lab, a mechanic, food and drink, then the lab kept busy while the first guests arrive.
 * Every wait is a player reading the hint or watching the park; nothing is staged, seeded or sped up.
 */
export default defineFlow(game, {
  async run(f) {
    await f.expect((p) => p.guests === 0 && p.rides === 0 && p.unlocks === 0, "second 0: an empty lot, nobody inside, nothing researched");
    await f.wait(4000);

    // The hint says to lay a path in from the gate: the path key, then four cells north of the plaza.
    await f.press("Digit6");
    for (const z of [44, 40, 36, 32]) {
      await f.command("park.pointer", click(0, z));
      await f.wait(900);
    }
    await f.expect((p) => p.taught >= 1, "taught: the path step is done");

    // The carousel beside it; its window opens shut, and Connect it lays the entrance and exit.
    await f.wait(2500);
    await f.press("Digit1");
    await f.wait(1500);
    await f.command("park.pointer", click(4, 36));
    await f.expect((p) => p.rides === 1, "the first ride stands on the lot");
    await f.wait(3000);
    await f.command("build.connect", {});
    await f.wait(2500);
    await f.command("brightway.act", { action: "open_gate" });
    await f.expect((p) => p.taught >= 4, "taught: path, ride, connect and gate are done");

    // The lab: the first topic is short, so the first unlock lands inside two minutes.
    await f.wait(6000);
    await f.command("brightway.act", { action: "research_stall_icecream" });
    await f.wait(3000);
    await f.command("brightway.act", { action: "research_deco_topiary" });

    // A mechanic before the carousel wears out.
    await f.wait(8000);
    await f.command("build.select", { id: "staff_mechanic" });
    await f.wait(1500);
    await f.command("park.pointer", click(-12, 36));
    await f.expect((p) => p.staffHired === 1, "staff: a mechanic is on the payroll");

    // Food and drink beside the path, each connected from its own window.
    await f.wait(10000);
    await f.press("Digit4");
    await f.wait(1500);
    await f.command("park.pointer", click(-4, 40));
    await f.wait(2000);
    await f.command("build.connect", {});
    await f.wait(6000);
    await f.command("build.select", { id: "stall_drink" });
    await f.wait(1500);
    await f.command("park.pointer", click(-4, 32));
    await f.wait(2000);
    await f.command("build.connect", {});

    await f.waitFor((p) => p.unlocks >= 1, { timeoutMs: 120_000, note: "unlock: the ice cream cart's research lands" });
    await f.waitFor((p) => p.guests > 0, { timeoutMs: 120_000, note: "guests: the first visitors walk in through the gate" });

    // Keep the lab busy: the teacups, then the dodgems, as each one before it lands.
    await f.waitFor((p) => p.unlocks >= 2, { timeoutMs: 180_000, note: "unlock: the topiary lands" });
    await f.wait(5000);
    await f.command("brightway.act", { action: "research_ride_teacups" });
    await f.wait(20000);
    await f.command("brightway.act", { action: "research_ride_bumper" });

    // A handyman once the paths start to need one.
    await f.wait(40000);
    await f.command("build.select", { id: "staff_janitor" });
    await f.wait(1500);
    await f.command("park.pointer", click(8, 28));

    await f.waitFor((p) => p.unlocks >= 3, { timeoutMs: 240_000, note: "unlock: the teacups land" });
    await f.wait(5000);
    await f.command("build.select", { id: "ride_teacups" });
    await f.wait(1500);
    await f.command("park.pointer", click(-6, 24));
    await f.wait(2500);
    await f.command("build.connect", {});
    await f.expect((p) => p.rides === 2, "a researched ride is built");

    await f.waitFor((p) => p.unlocks >= 4, { timeoutMs: 240_000, note: "unlock: the dodgems land" });
    await f.wait(195_000);
    await f.expect((p) => p.visitors > 0 && p.researched >= 4, "the park has had visitors and the lab has opened four topics");
  },
});
