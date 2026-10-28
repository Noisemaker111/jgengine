import { describe, expect, test } from "bun:test";
import { landformTopology } from "../grid/landformGrid";
import { dInfinityArea } from "./dInfinity";
import { createFlowRouter } from "./flowRouting";

function bowl(cols: number, rows: number, cellSize: number): Float64Array {
  // A closed depression 20 m deep inside a rim, which spills south to the outlet row at 5 m.
  const height = new Float64Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const dx = (col - (cols - 1) / 2) * cellSize;
      const dz = (row - (rows - 1) / 2) * cellSize;
      const r = Math.sqrt(dx * dx + dz * dz);
      height[row * cols + col] = r < 600 ? -20 + (r / 600) * 30 : 10;
    }
  }
  const spill = Math.floor(cols / 2);
  for (let row = Math.floor(rows / 2) + 6; row < rows; row += 1) height[row * cols + spill] = 5;
  return height;
}

describe("flow routing", () => {
  test("Priority-Flood fills a closed depression flat to its spill height and drains it through the outlet", () => {
    const topology = landformTopology({ cols: 21, rows: 21, cellSize: 100, outlets: ["south"] });
    const height = bowl(21, 21, 100);
    const router = createFlowRouter(topology);
    router.route(height, Number.NEGATIVE_INFINITY);
    const centre = 10 * 21 + 10;
    expect(router.water[centre]).toBe(5);
    let lakeCells = 0;
    for (let i = 0; i < height.length; i += 1) {
      if ((router.water[i] ?? 0) > (height[i] ?? 0)) {
        lakeCells += 1;
        expect(router.water[i]).toBe(5);
      }
    }
    expect(lakeCells).toBeGreaterThan(30);
    // Every cell drains to an outlet: the outlets together collect the whole map.
    let collected = 0;
    for (let i = 0; i < height.length; i += 1) if (router.receiver[i] === i) collected += router.area[i] ?? 0;
    expect(collected).toBeCloseTo(21 * 21 * 100 * 100, 6);
    // Receivers always come before their donors in the stack.
    const position = new Int32Array(height.length);
    router.stack.forEach((cell, at) => {
      position[cell] = at;
    });
    for (let i = 0; i < height.length; i += 1) expect(position[router.receiver[i] ?? i] ?? 0).toBeLessThanOrEqual(position[i] ?? 0);
  });

  test("the sea floods outlets below sea level and every low cell joined to them", () => {
    const topology = landformTopology({ cols: 10, rows: 10, cellSize: 10 });
    const height = new Float64Array(100).map((_, i) => (i % 10) - 4);
    const router = createFlowRouter(topology);
    router.route(height, 0);
    for (let i = 0; i < 100; i += 1) expect(router.water[i]).toBe(Math.max(0, height[i] ?? 0));
  });

  test("D∞ carries every cell's water straight down an inclined plane at any angle", () => {
    // A plane falling 30° south of east, outlets on the downslope edges: all water from a column
    // crosses into the next, so a cell in column c drains exactly c + 1 cells.
    const cols = 60;
    const rows = 60;
    const topology = landformTopology({ cols, rows, cellSize: 1, outlets: ["east", "south"] });
    const angle = Math.PI / 6;
    const surface = new Float64Array(cols * rows);
    for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) surface[row * cols + col] = -(col * Math.cos(angle) + row * Math.sin(angle));
    const router = createFlowRouter(topology);
    router.route(surface, Number.NEGATIVE_INFINITY);
    const area = dInfinityArea(topology, router.drain, router.receiver);
    for (let row = 30; row < 59; row += 1) for (const col of [5, 20, 28]) expect(area[row * cols + col]).toBeCloseTo(col + 1, 9);
  });

  test("on a cone D∞ matches the radial catchment r/2 within 12% RMS, where D8 is off by half", () => {
    // Water spreading off a cone drains a sector: specific catchment area a = r/2 (Tarboton 1997).
    const side = 101;
    const centre = 50;
    const topology = landformTopology({ cols: side, rows: side, cellSize: 1 });
    const surface = new Float64Array(side * side);
    for (let row = 0; row < side; row += 1) for (let col = 0; col < side; col += 1) surface[row * side + col] = 100 - Math.hypot(col - centre, row - centre);
    const router = createFlowRouter(topology);
    router.route(surface, Number.NEGATIVE_INFINITY);
    const dinf = dInfinityArea(topology, router.drain, router.receiver);
    let dinfSquares = 0;
    let d8Squares = 0;
    let count = 0;
    for (let row = 0; row < side; row += 1) {
      for (let col = 0; col < side; col += 1) {
        const r = Math.hypot(col - centre, row - centre);
        if (r < 15 || r > 40) continue;
        const i = row * side + col;
        dinfSquares += ((dinf[i] ?? 0) / (r / 2) - 1) ** 2;
        d8Squares += ((router.area[i] ?? 0) / (r / 2) - 1) ** 2;
        count += 1;
      }
    }
    expect(Math.sqrt(dinfSquares / count)).toBeLessThan(0.12);
    expect(Math.sqrt(d8Squares / count)).toBeGreaterThan(0.4);
  });
});
