import type { ProofSetup } from "@jgengine/core/suite/suiteProof";

import type { ParkProbe } from "../../src/game/parkProbe";

/** A click on the lot at ground point (x, z), as the park's pointer command receives it from the canvas. */
export const click = (x: number, z: number) => ({ point: [x, 0, z], entity: null, object: null });

/** The path tool (key 6), then four cells north of the gate plaza: the first scenario's first step. */
export function layPath(s: ProofSetup<ParkProbe>): void {
  s.press("Digit6");
  for (const z of [44, 40, 36, 32]) s.command("park.pointer", click(0, z));
  s.waitFor((p) => p.taught >= 1, { timeoutMs: 3000 });
}

/** A path in from the gate and a connected carousel beside it, the gate still shut. */
export function carouselBuilt(s: ProofSetup<ParkProbe>): void {
  layPath(s);
  s.press("Digit1");
  s.command("park.pointer", click(4, 36));
  s.command("build.connect", {});
  s.waitFor((p) => p.rides === 1, { timeoutMs: 3000 });
}

/** {@link carouselBuilt} with the gate open. */
export function parkOpen(s: ProofSetup<ParkProbe>): void {
  carouselBuilt(s);
  s.command("brightway.act", { action: "open_gate" });
  s.waitFor((p) => p.gateOpen === 1, { timeoutMs: 1000 });
}
