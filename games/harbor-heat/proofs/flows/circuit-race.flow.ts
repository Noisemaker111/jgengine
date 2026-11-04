import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  state: "race-heights",
  browser: true,
  async run(f) {
    // arrival: on the Palm Heights Climb's start line, the race running against the circuit's own rival
    await f.waitFor((p) => p.racing === 1 && p.rivalOnScene === 1, { timeoutMs: 15000, note: "the start-line race began at the circuit's start, its rival on the road" });
    await f.see(/racing lani park/i, { timeoutMs: 5000 });
    await f.wait(1200);
    await f.shot("circuit-start");
    // getting out of the car gives the race up, and the notice says why
    await f.expectPage("(window.__jgengineAgent.handle({ method: 'run_command', name: 'exitVehicle', input: {} }), true)", "the racer steps out of the car mid-race");
    await f.waitFor((p) => p.raceForfeit === 1 && p.rivalOnScene === 0, { timeoutMs: 5000, note: "leaving the car forfeits the race and the rival leaves the road" });
    await f.see(/left the car, so the race is forfeit/i, { timeoutMs: 4000 });
    await f.shot("circuit-forfeit");
  },
});
