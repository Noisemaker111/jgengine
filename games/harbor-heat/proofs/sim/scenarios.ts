import type { ProofSetup } from "@jgengine/core/suite/suiteProof";
import type { ProbeReadings } from "@jgengine/core/game/playableGame";

import { secondsAtHour } from "../../src/game/clock";
import { customerSpot, OVEN, shiftStore, SWAP_DOCKS } from "../../src/game/pizza/shift";

type Setup = ProofSetup<ProbeReadings>;

/** At the oven window. */
export function atOven(s: Setup): void {
  s.teleport({ x: OVEN[0], z: OVEN[1] });
}

/** Set the clock to `hour` of the current day. */
export function clockTo(s: Setup, hour: number): void {
  const clock = s.ctx.time.snapshot();
  const day = Math.floor(clock.now / secondsAtHour(24));
  s.ctx.time.hydrate({ ...clock, now: day * secondsAtHour(24) + secondsAtHour(hour) });
}

/** The doors open and the first call is on the board, the rider at the oven window. */
export function firstCall(s: Setup): void {
  atOven(s);
  s.command("shift.sleep");
  s.waitFor((p) => Number(p["board"]) > 0, { timeoutMs: 20_000, note: "the first order rings onto the board" });
}

/** The first call loaded into the bag at the oven window. */
export function loaded(s: Setup): void {
  firstCall(s);
  s.press("KeyE");
  s.waitFor((p) => Number(p["bag"]) > 0, { timeoutMs: 3000, note: "the box goes into the bag" });
}

/** Standing at the door of the first box in the bag. */
export function atDoor(s: Setup): void {
  loaded(s);
  const order = shiftStore.read(s.ctx).bag[0];
  if (order === undefined) throw new Error("nothing in the bag");
  const spot = customerSpot(order.customerId);
  if (spot === null) throw new Error(`no door for ${order.customerId}`);
  s.teleport({ x: spot[0], z: spot[1] });
}

/** The port's swap dock. */
export function portDock(): readonly [number, number] {
  const dock = SWAP_DOCKS.find((d) => d.id === "swap_dock_port");
  if (dock === undefined) throw new Error("no port swap dock");
  return dock.position;
}
