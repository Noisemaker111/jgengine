import { describe, expect, test } from "bun:test";

import { buildCoasterCircuit, lapArithmetic, scoreCircuit, type TrackPoint } from "./circuit";

/** A closed rectangle of track pieces: `width` by `height` cells, on the 4-unit grid. */
function ring(width: number, height: number): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (let i = 0; i < width; i += 1) points.push([i * 4, 0, 0]);
  for (let i = 1; i < height; i += 1) points.push([(width - 1) * 4, 0, i * 4]);
  for (let i = width - 2; i >= 0; i -= 1) points.push([i * 4, 0, (height - 1) * 4]);
  for (let i = height - 2; i >= 1; i -= 1) points.push([0, 0, i * 4]);
  return points;
}

const STATION: readonly [number, number] = [-4, 0];

describe("brightway-park coaster circuit", () => {
  test("orders the authored pieces into one closed lap and measures it", () => {
    const circuit = buildCoasterCircuit(ring(6, 3), STATION);
    expect(circuit.closed).toBe(true);
    expect(circuit.pieces).toBe(2 * (6 + 3) - 4);
    expect(circuit.length).toBe(2 * (6 + 3) * 4 - 16);
    expect(circuit.corners).toBe(4);
    expect(circuit.lapSeconds).toBeGreaterThan(0);
    expect(circuit.excitement).toBeGreaterThan(0);
    // The lap is the ride: its duration is the rail length over the pace the track allows.
    expect(circuit.lapSeconds).toBeCloseTo(circuit.length / circuit.averageSpeed, 0);
  });

  test("altering the track changes the score and the lap", () => {
    const short = buildCoasterCircuit(ring(5, 2), STATION);
    const long = buildCoasterCircuit(ring(9, 4), STATION);
    expect(long.length).toBeGreaterThan(short.length);
    expect(long.corners).toBeGreaterThanOrEqual(short.corners);
    expect(long.excitement).toBeGreaterThan(short.excitement);
    expect(long.lapSeconds).toBeGreaterThan(short.lapSeconds);
  });

  test("a drop is worth speed and excitement, and corners cost pace", () => {
    const flat = lapArithmetic(60, 4, 0);
    const lifted = lapArithmetic(60, 4, 8);
    expect(lifted.averageSpeed).toBeGreaterThan(flat.averageSpeed);
    expect(lifted.lapSeconds).toBeLessThan(flat.lapSeconds);
    expect(scoreCircuit(80, 4, 8, 12).excitement).toBeGreaterThan(scoreCircuit(80, 4, 0, 8).excitement);
    expect(scoreCircuit(80, 12, 0, 8).excitement).toBeGreaterThan(scoreCircuit(80, 4, 0, 8).excitement);
  });

  test("an open run is not a circuit: no lap, no excitement", () => {
    const open: TrackPoint[] = [
      [0, 0, 0],
      [4, 0, 0],
      [8, 0, 0],
    ];
    const circuit = buildCoasterCircuit(open, STATION);
    expect(circuit.closed).toBe(false);
    expect(circuit.length).toBe(8);
    expect(circuit.lapSeconds).toBe(0);
    expect(circuit.excitement).toBe(0);
    expect(circuit.intensity).toBe(0);
  });

  test("no track, no ride", () => {
    const circuit = buildCoasterCircuit([], STATION);
    expect(circuit.closed).toBe(false);
    expect(circuit.lapSeconds).toBe(0);
    expect(circuit.excitement).toBe(0);
  });
});
