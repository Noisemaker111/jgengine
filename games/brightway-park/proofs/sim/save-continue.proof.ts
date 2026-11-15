import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { click } from "./scenarios";

// The proprietor lays a path, builds the carousel and connects it, then saves from the pause board.
// Quitting and opening the game again lands on the title; Continue brings the same haunt back, not an
// empty lot.
export default defineProof(game, {
  proves: ["save.continue"],
  async play(p) {
    await p.expect((r) => r.rides === 0, "a new haunt starts on the empty lot");
    await p.press("Digit6");
    for (const z of [44, 40, 36, 32]) await p.act("park.pointer", click(0, z));
    await p.press("Digit1");
    await p.act("park.pointer", click(4, 36));
    await p.act("build.connect", {});
    const built = await p.expect((r) => r.rides === 1 && r.structures > 6, "the carousel stands, joined to the path");
    await p.act("park.save");
    await p.restart("title");
    await p.expect((r) => r.onTitle === 1, "a new session opens on the title");
    await p.act("start");
    await p.expect((r) => r.onTitle === 0 && r.rides === 1 && r.structures === built.structures, "Continue brings back the same haunt: the carousel and every path");
  },
});
