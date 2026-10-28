import { describe, expect, test } from "bun:test";

import {
  createMmgState,
  KVLCC2_L7 as SHIP,
  KVLCC2_L7_PUBLISHED as PUBLISHED,
  KVLCC2_L7_SPEED as SPEED,
  mmgForces,
  mmgTrialBoat,
  runTurningCircle,
  runZigZag,
  selfPropulsionRevs,
  stepMmg,
  type MmgShip,
} from "./shipManoeuvring";

const DEG = Math.PI / 180;
const L = SHIP.length;

describe("MMG standard method on the KVLCC2 L7 model (Yasukawa & Yoshimura 2015)", () => {
  test("at self-propulsion revolutions and zero rudder the ship holds its approach speed and course", () => {
    const boat = mmgTrialBoat(SHIP, SPEED);
    for (let i = 0; i < 1200; i += 1) boat.step(0, 0.05);
    expect(Math.abs(boat.state.u / SPEED - 1)).toBeLessThan(1e-6);
    expect(Math.abs(boat.state.heading)).toBeLessThan(1e-9);
    expect(selfPropulsionRevs(SHIP, SPEED)).toBeGreaterThan(5);
  });

  test("35° turning circles: advance and tactical diameter within 3% of the paper's calculation and 7% of MARIN's free-running model", () => {
    for (const row of PUBLISHED.turning) {
      const turn = runTurningCircle(mmgTrialBoat(SHIP, SPEED), row.rudder * DEG, SPEED, 0.05, 600);
      const advance = turn.advance / L;
      const tactical = turn.tacticalDiameter / L;
      expect(Math.abs(advance / row.advance.calculated - 1)).toBeLessThan(0.03);
      expect(Math.abs(tactical / row.tacticalDiameter.calculated - 1)).toBeLessThan(0.03);
      expect(Math.abs(advance / row.advance.measured - 1)).toBeLessThan(0.07);
      expect(Math.abs(tactical / row.tacticalDiameter.measured - 1)).toBeLessThan(0.07);
      expect(turn.steadyDiameter).toBeLessThan(turn.tacticalDiameter);
      expect(turn.speedLoss).toBeGreaterThan(0.25);
      expect(turn.speedLoss).toBeLessThan(0.5);
    }
  });

  test("10/10 and 20/20 zig-zags: every overshoot within 1.5° of the paper's calculation, and the 10/10 ones below the tank's", () => {
    for (const row of PUBLISHED.zigZag) {
      const zig = runZigZag(mmgTrialBoat(SHIP, SPEED), row.rudder * DEG, 0.05, 600, row.overshoots.calculated.length);
      row.overshoots.calculated.forEach((calculated, i) => {
        const overshoot = (zig.overshoots[i] ?? Number.NaN) / DEG;
        expect(Math.abs(overshoot - calculated)).toBeLessThan(1.5);
        if (Math.abs(row.rudder) === 10) expect(overshoot).toBeLessThan(row.overshoots.measured[i] ?? 0);
      });
    }
  });

  test("halving the time step moves the turning indices by under 0.5%", () => {
    const coarse = runTurningCircle(mmgTrialBoat(SHIP, SPEED), 35 * DEG, SPEED, 0.1, 600);
    const fine = runTurningCircle(mmgTrialBoat(SHIP, SPEED), 35 * DEG, SPEED, 0.05, 600);
    expect(Math.abs(coarse.tacticalDiameter / fine.tacticalDiameter - 1)).toBeLessThan(5e-3);
    expect(Math.abs(coarse.advance / fine.advance - 1)).toBeLessThan(5e-3);
  });

  test("positive rudder turns to starboard and the rudder slews at the ship's rate", () => {
    const state = createMmgState(SPEED);
    const revs = selfPropulsionRevs(SHIP, SPEED);
    stepMmg(SHIP, state, 35 * DEG, revs, 1);
    expect(state.steer).toBeCloseTo(SHIP.steerRate, 10);
    for (let i = 0; i < 400; i += 1) stepMmg(SHIP, state, 35 * DEG, revs, 0.05);
    expect(state.r).toBeGreaterThan(0);
    expect(state.y).toBeGreaterThan(0);
  });
});

describe("vectored thrust (outboard or waterjet nozzle)", () => {
  const { rudder: _rudder, ...rest } = SHIP;
  const vectored: MmgShip = { ...rest, name: "KVLCC2 hull, swung thrust" };

  test("swings the whole thrust: side force T·sin δ at the propeller, turning to starboard for positive δ", () => {
    const revs = selfPropulsionRevs(SHIP, SPEED);
    const state = { ...createMmgState(0), steer: 30 * DEG };
    const forces = mmgForces(vectored, state, revs);
    expect(forces.steering[1]).toBeCloseTo(-forces.thrust * Math.sin(30 * DEG), 6);
    expect(forces.steering[2]).toBeCloseTo(-SHIP.propeller.position * L * forces.thrust * Math.sin(30 * DEG), 6);
    expect(forces.rudderNormal).toBe(0);
    for (let i = 0; i < 60; i += 1) stepMmg(vectored, state, 30 * DEG, revs, 0.05);
    expect(state.r).toBeGreaterThan(0);
  });
});
