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

// #2885: the editor's Step button played the clock for one render frame. A frame shorter than one
// fixed step ran no simulation step, so the step was spent and time never moved.
test("a paused step moves time by exactly one fixed step, whatever the frame lengths", () => {
  const time = createSimClock();
  const sim = createSimContext({ config: { hz: 60 }, entities: createEntityStore(), time });
  time.pause();
  time.step();
  const gameDts: number[] = [];
  const body = (_dt: number, _tick: number, gameDt: number) => gameDts.push(gameDt);
  sim.advance(0.008, body);
  expect(time.now()).toBe(0);
  sim.advance(0.01, body);
  sim.advance(0.05, body);
  expect(gameDts.filter((dt) => dt > 0)).toEqual([1 / 60]);
  expect(time.now()).toBeCloseTo(1 / 60);
  expect(time.isPaused()).toBe(true);
  time.step(3);
  sim.advance(0.05, body);
  expect(time.now()).toBeCloseTo(4 / 60);
});

test("a step run ahead advances the clock and interpolation history once, and the frame that owes it does not rerun it", () => {
  const time = createSimClock();
  const entities = createEntityStore();
  const sim = createSimContext({ config: { hz: 60 }, entities, time });
  const ran: number[] = [];
  sim.advance(0.015, () => ran.push(sim.tick()));
  expect(sim.stepAhead((_dt, tick, gameDt) => ran.push(tick + gameDt))).toBe(true);
  expect(ran).toEqual([1 + 1 / 60]);
  expect(time.now()).toBeCloseTo(1 / 60, 9);
  sim.advance(0.003, () => ran.push(-1));
  expect(ran).toEqual([1 + 1 / 60]);
  expect(time.now()).toBeCloseTo(1 / 60, 9);
  expect(() => sim.advance(0.02, () => sim.stepAhead(() => {}))).toThrow("cannot run inside a step");
});
