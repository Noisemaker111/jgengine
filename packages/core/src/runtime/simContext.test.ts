import { expect, test } from "bun:test";
import { createEntityStore } from "../scene/entityStore";
import { createSimClock } from "../time/simClock";
import { createSimContext } from "./simContext";

test("fixed steps own scaled time once, including pause, restore and prediction", () => {
  const time = createSimClock({ config: { scale: 2 } });
  const sim = createSimContext({ config: { hz: 10 }, entities: createEntityStore(), time });
  const deltas: number[] = [];
  sim.advance(0.25, (_dt, _tick, gameDt) => deltas.push(gameDt));
  expect(deltas).toEqual([0.2, 0.2]);
  expect(time.now()).toBeCloseTo(0.4);
  const state = sim.snapshot();
  const clock = time.snapshot();
  time.pause();
  sim.advance(0.1, (_dt, _tick, gameDt) => expect(gameDt).toBe(0));
  expect(time.now()).toBeCloseTo(0.4);
  sim.restore(state);
  time.hydrate(clock);
  sim.advance(0.1, (_dt, _tick, gameDt) => expect(gameDt).toBe(0), { advanceTime: false });
  expect(time.now()).toBeCloseTo(0.4);
  sim.advance(0.1, (_dt, _tick, gameDt) => expect(gameDt).toBe(0.2));
  expect(time.now()).toBeCloseTo(0.6);
});
