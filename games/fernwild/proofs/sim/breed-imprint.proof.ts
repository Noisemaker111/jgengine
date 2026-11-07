import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";
import { raptorPair } from "./scenarios";

// A baby asks for care as it grows, and each care given raises its imprint. Setup breeds a raptor pair,
// hatches the egg by a campfire with breeding sped up, then slows breeding to 200x (a request every 144 s)
// and leaves the survivor raw meat, a raptor's favourite. Play answers two requests: a cuddle or a feed
// with E, or a walk of 30 m with it whistled to heel.
export default defineProof(game, {
  proves: ["breeding.raise-imprint"],
  setup(s) {
    raptorPair(s);
    s.waitFor((p) => p.eggs >= 1, { timeoutMs: 80_000 });
    s.command("cheat", { give: { campfire: 1, wood: 10, raw_meat: 10 }, toHotbar: ["campfire"], breedingSpeed: 1000 });
    s.press("Digit1");
    s.hold("mouse0", { until: (p) => p.fuel >= 0, ms: 80, timeoutMs: 3000 });
    for (let wood = 0; wood < 4; wood += 1) s.press("KeyE");
    s.waitFor((p) => p.babies >= 1, { timeoutMs: 30_000 });
    s.command("cheat", { breedingSpeed: 200 });
  },
  async play(p) {
    await p.expect((r) => r.babyImprint === 0, "the newborn has no imprint yet");
    for (let care = 0; care < 2; care += 1) {
      await p.waitFor((r) => r.babyWants === 1, { timeoutMs: 200_000, note: "the baby asks for care" });
      const before = (await p.probe()).babyImprint;
      // Walk up to it, face it, then E: a cuddle or a feed.
      for (let step = 0; step < 60 && (await p.probe()).babyDist > 2.2; step += 1) {
        await p.heading((await p.probe()).babyYaw);
        await p.hold("KeyW", { ms: 100 });
      }
      if ((await p.probe()).babyDist < 1.2) await p.hold("KeyS", { until: (r) => r.babyDist >= 1.5, timeoutMs: 2000 });
      await p.heading((await p.probe()).babyYaw);
      await p.press("KeyE");
      if ((await p.probe()).babyImprint === before) {
        // No E for it: it wants a walk. Whistle it to heel and walk on.
        await p.press("KeyT");
        await p.heading((await p.probe()).babyYaw + Math.PI);
        await p.hold("KeyW", { until: (r) => r.babyImprint > before, timeoutMs: 30_000 });
      }
      await p.expect((r) => r.babyImprint > before, "the care raises its imprint");
    }
    await p.expect((r) => r.babyMatured > 0, "and it keeps growing");
  },
});
