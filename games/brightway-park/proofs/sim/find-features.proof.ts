import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { click } from "./scenarios";

/** The first scenario's hints, in `PARK_HINTS` order. */
const PATH = 0, RIDE = 1, CONNECT = 2, GATE = 3, SCARE = 4, SEANCE = 5, GHOSTS = 6, GREMLIN = 7;

// A new haunt follows only the hint card: a path in from the gate, the carousel beside it and its
// doors, the gate, a scare beside the path, a séance, a ghost moving in, and a gremlin. Each core
// feature - building, connecting, the gate, scares, the séance table, ghost residents and spooks -
// gets its first use, and the first of the living walk in.
export default defineProof(game, {
  proves: ["onboarding.find-features"],
  async play(p) {
    await p.expect((r) => r.hint === PATH && r.rides === 0, "a new haunt, the hint says to lay a path");
    for (let step = 0; step < 40; step += 1) {
      const r = await p.probe();
      if (r.hint === -1) break;
      if (r.hint === PATH) { await p.press("Digit6"); for (const z of [44, 40, 36, 32]) await p.act("park.pointer", click(0, z)); }
      else if (r.hint === RIDE) { await p.press("Digit1"); await p.act("park.pointer", click(4, 36)); }
      else if (r.hint === CONNECT) await p.act("build.connect", {});
      else if (r.hint === GATE) await p.act("brightway.act", { action: "open_gate" });
      else if (r.hint === SCARE) { await p.act("build.select", { id: "prop_coffin" }); await p.act("park.pointer", click(-4, 36)); }
      else if (r.hint === SEANCE) await p.act("brightway.act", { action: "research_stall_icecream" });
      else if (r.hint === GHOSTS) await p.waitFor((x) => x.ghosts > 0, { timeoutMs: 40_000, note: "the Victorian Child moves in" });
      else if (r.hint === GREMLIN) { await p.act("build.select", { id: "staff_mechanic" }); await p.act("park.pointer", click(-12, 36)); }
      await p.wait(300);
    }
    await p.expect((r) => r.hint === -1 && r.rides === 1 && r.props >= 1 && r.seances >= 1 && r.ghosts === 1 && r.staffHired >= 1 && r.gateOpen === 1,
      "following the hints built a ride, a scare, ran a séance, moved a ghost in and bound a gremlin");
    await p.waitFor((r) => r.guests > 0, { timeoutMs: 120_000, note: "the first of the living walk in" });
  },
});
