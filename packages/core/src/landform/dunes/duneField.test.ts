import { describe, expect, test } from "bun:test";
import { fitPowerLaw } from "../validation/geomorphicLaws";
import { createDuneField, duneSlopeAngle, type DuneField, type WindMode } from "./duneField";

function ridge(cols: number, rows: number, height: number, at: number): number[] {
  const slabs: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = col - at;
      slabs.push(Math.max(0, Math.round(x < 0 ? height + x / 4 : height - x)));
    }
  }
  return slabs;
}

function pile(cols: number, rows: number, height: number, radius: number, col: number, row: number): number[] {
  const slabs: number[] = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) slabs.push(Math.max(0, Math.round(height * (1 - Math.hypot(c - col, r - row) / radius))));
  return slabs;
}

// Column of the highest five-column band of sand, summed down the rows.
function crestColumn(field: DuneField): number {
  const { cols } = field.grid;
  const slabs = field.slabs();
  const column = new Float64Array(cols);
  for (let i = 0; i < slabs.length; i += 1) column[i % cols] = (column[i % cols] ?? 0) + (slabs[i] ?? 0);
  let best = 0;
  let bestSum = -1;
  for (let c = 0; c < cols; c += 1) {
    let sum = 0;
    for (let k = -2; k <= 2; k += 1) sum += column[(c + k + cols) % cols] ?? 0;
    if (sum > bestSum) {
      bestSum = sum;
      best = c;
    }
  }
  return best;
}

function wrapped(delta: number, side: number): number {
  if (delta > side / 2) return delta - side;
  if (delta < -side / 2) return delta + side;
  return delta;
}

// Mass centre of the sand on a wrapping axis, as a cell coordinate.
function circularCentre(field: DuneField, axis: "col" | "row"): number {
  const { cols, rows } = field.grid;
  const side = axis === "col" ? cols : rows;
  const slabs = field.slabs();
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < slabs.length; i += 1) {
    const at = axis === "col" ? i % cols : Math.floor(i / cols);
    const angle = (2 * Math.PI * at) / side;
    sx += (slabs[i] ?? 0) * Math.cos(angle);
    sy += (slabs[i] ?? 0) * Math.sin(angle);
  }
  return (Math.atan2(sy, sx) / (2 * Math.PI)) * side;
}

function tallest(field: DuneField): number {
  let top = 0;
  for (const h of field.slabs()) if (h > top) top = h;
  return top;
}

// Crest trend (degrees clockwise from north, 0–180) and how strongly one trend dominates (0 none, 1 all).
function crestTrend(field: DuneField): { bearing: number; coherence: number } {
  const { cols, rows } = field.grid;
  const s = field.slabs();
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const gx = ((s[r * cols + ((c + 1) % cols)] ?? 0) - (s[r * cols + ((c - 1 + cols) % cols)] ?? 0)) / 2;
      const gy = ((s[((r + 1) % rows) * cols + c] ?? 0) - (s[((r - 1 + rows) % rows) * cols + c] ?? 0)) / 2;
      xx += gx * gx;
      yy += gy * gy;
      xy += gx * gy;
    }
  }
  const gradient = (0.5 * Math.atan2(2 * xy, xx - yy) * 180) / Math.PI;
  const bearing = (((gradient + 180) % 180) + 180) % 180;
  return { bearing, coherence: Math.sqrt((xx - yy) ** 2 + 4 * xy * xy) / (xx + yy) };
}

describe("slip faces and migration", () => {
  test("a dune migrates at a speed inversely proportional to its height (Bagnold 1941: c = q/H)", () => {
    const cols = 200;
    const rows = 6;
    const heights: number[] = [];
    const speeds: number[] = [];
    for (const start of [6, 9, 12, 18, 24, 36]) {
      const field = createDuneField({ grid: { cols, rows, cellSize: 1 }, seed: `ridge-${start}`, initial: { slabs: ridge(cols, rows, start, 40) } });
      field.step(400);
      let at = crestColumn(field);
      let moved = 0;
      for (let k = 0; k < 60; k += 1) {
        field.step(10);
        const next = crestColumn(field);
        moved += wrapped(next - at, cols);
        at = next;
      }
      heights.push(tallest(field));
      speeds.push(moved / 600);
    }
    const fit = fitPowerLaw(heights, speeds);
    expect(fit.exponent).toBeGreaterThan(-1.3);
    expect(fit.exponent).toBeLessThan(-0.8);
    expect(fit.r2).toBeGreaterThan(0.9);
  }, 30_000);

  test("lee faces stand at the 34° angle of repose, never steeper, and stoss slopes are gentler", () => {
    const cols = 200;
    const rows = 6;
    const field = createDuneField({ grid: { cols, rows, cellSize: 1 }, seed: "slip", initial: { slabs: ridge(cols, rows, 24, 40) } });
    field.step(600);
    const s = field.slabs();
    expect(duneSlopeAngle(field, 2)).toBeCloseTo(34, 9);
    const leeDrops: number[] = [];
    let stoss = 0;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const h = s[r * cols + c] ?? 0;
        // No drop to any side passes repose (two slabs over a cell).
        expect(Math.abs(h - (s[r * cols + ((c + 1) % cols)] ?? 0))).toBeLessThanOrEqual(2);
        expect(Math.abs(h - (s[((r + 1) % rows) * cols + c] ?? 0))).toBeLessThanOrEqual(2);
      }
      let crest = 0;
      for (let c = 0; c < cols; c += 1) if ((s[r * cols + c] ?? 0) > (s[r * cols + crest] ?? 0)) crest = c;
      const height = s[r * cols + crest] ?? 0;
      for (let c = crest; (s[r * cols + (c % cols)] ?? 0) > 0; c += 1) {
        const drop = (s[r * cols + (c % cols)] ?? 0) - (s[r * cols + ((c + 1) % cols)] ?? 0);
        if (drop > 0) leeDrops.push(drop);
      }
      let heel = crest;
      while ((s[r * cols + ((heel - 1 + cols) % cols)] ?? 0) > Math.round(0.15 * height)) heel -= 1;
      stoss += duneSlopeAngle(field, height - (s[r * cols + ((heel - 1 + cols) % cols)] ?? 0), crest - heel + 1);
    }
    leeDrops.sort((a, b) => a - b);
    const median = leeDrops[Math.floor(leeDrops.length / 2)] ?? 0;
    expect(duneSlopeAngle(field, median)).toBeCloseTo(34, 6);
    expect(stoss / rows).toBeLessThan(25);
  }, 30_000);
});

describe("dune types", () => {
  test("a pile of sand under one wind becomes a barchan: horns run downwind of a body that bulges upwind", () => {
    const cols = 160;
    const rows = 96;
    const field = createDuneField({ grid: { cols, rows, cellSize: 1 }, seed: "barchan", initial: { slabs: pile(cols, rows, 24, 18, 40, 48) } });
    field.step(400);
    const s = field.slabs();
    let top = 0;
    for (let i = 0; i < s.length; i += 1) if ((s[i] ?? 0) > (s[top] ?? 0)) top = i;
    // The dune body: cells of three slabs or more joined to the summit.
    const body = new Uint8Array(s.length);
    const queue = [top];
    body[top] = 1;
    while (queue.length > 0) {
      const i = queue.pop() ?? 0;
      const c = i % cols;
      const r = (i - c) / cols;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          const n = ((r + dr + rows) % rows) * cols + ((c + dc + cols) % cols);
          if (body[n] !== 1 && (s[n] ?? 0) >= 3) {
            body[n] = 1;
            queue.push(n);
          }
        }
      }
    }
    const topCol = top % cols;
    const topRow = (top - topCol) / cols;
    const spans: { toe: number; heel: number }[] = [];
    for (let k = -rows / 2; k < rows / 2; k += 1) {
      const r = (topRow + k + rows) % rows;
      let toe = -Infinity;
      let heel = Infinity;
      for (let j = -cols / 2; j < cols / 2; j += 1) {
        if (body[r * cols + ((topCol + j + cols) % cols)] !== 1) continue;
        toe = Math.max(toe, j);
        heel = Math.min(heel, j);
      }
      if (toe > -Infinity) spans.push({ toe, heel });
    }
    const quarter = Math.floor(spans.length / 4);
    const flanks = [...spans.slice(0, quarter), ...spans.slice(spans.length - quarter)];
    const middle = spans.slice(quarter, spans.length - quarter);
    const mean = (list: typeof spans, key: "toe" | "heel"): number => list.reduce((sum, span) => sum + span[key], 0) / list.length;
    expect(mean(flanks, "toe") - mean(middle, "toe")).toBeGreaterThan(3);
    expect(mean(flanks, "heel") - mean(middle, "heel")).toBeGreaterThan(4);
    let bare = 0;
    for (const h of s) if (h === 0) bare += 1;
    expect(bare / s.length).toBeGreaterThan(0.5);
  }, 30_000);

  test("abundant sand under one wind grows transverse ridges, crests across the wind", () => {
    const field = createDuneField({ grid: { cols: 64, rows: 64, cellSize: 1 }, seed: "transverse", initial: { sand: 1.5 } });
    field.step(600);
    const trend = crestTrend(field);
    expect(Math.min(trend.bearing, 180 - trend.bearing)).toBeLessThan(10);
    expect(trend.coherence).toBeGreaterThan(0.6);
  }, 30_000);

  test("two winds 120° apart grow linear dunes along their resultant (Rubin & Hunter 1987)", () => {
    const wind: WindMode[] = [
      { toward: 30, share: 1 },
      { toward: 150, share: 1 },
    ];
    const field = createDuneField({ grid: { cols: 64, rows: 64, cellSize: 1 }, seed: "linear", initial: { sand: 1.5 }, params: { wind } });
    field.step(600);
    const trend = crestTrend(field);
    expect(Math.abs(trend.bearing - 90)).toBeLessThan(10);
    expect(trend.coherence).toBeGreaterThan(0.5);
  }, 30_000);

  test("winds from three sides hold a star dune in place with no one crest trend, while one wind carries it off", () => {
    const side = 128;
    const start = pile(side, side, 30, 20, 64, 64);
    const star = createDuneField({ grid: { cols: side, rows: side, cellSize: 1 }, seed: "star", initial: { slabs: start }, params: { windPeriod: 20, wind: [{ toward: 0, share: 1 }, { toward: 120, share: 1 }, { toward: 240, share: 1 }] } });
    const single = createDuneField({ grid: { cols: side, rows: side, cellSize: 1 }, seed: "star", initial: { slabs: start } });
    const before = { col: circularCentre(star, "col"), row: circularCentre(star, "row") };
    star.step(600);
    single.step(600);
    expect(Math.hypot(wrapped(circularCentre(star, "col") - before.col, side), wrapped(circularCentre(star, "row") - before.row, side))).toBeLessThan(4);
    expect(wrapped(circularCentre(single, "col") - before.col, side)).toBeGreaterThan(20);
    expect(crestTrend(star).coherence).toBeLessThan(0.3);
  }, 30_000);
});

describe("state", () => {
  test("sand is conserved, and snapshot, restore and reset replay the same field", () => {
    const options = { grid: { cols: 48, rows: 40, cellSize: 2 }, seed: "state", initial: { sand: 1 }, params: { wind: [{ toward: 70, share: 2 }, { toward: 200, share: 1 }] } };
    const field = createDuneField(options);
    const total = (): number => field.slabs().reduce((sum, h) => sum + h, 0);
    const mass = total();
    field.step(20);
    const saved = JSON.parse(JSON.stringify(field.snapshot())) as ReturnType<DuneField["snapshot"]>;
    field.step(15);
    const later = field.hash();
    expect(total()).toBe(mass);
    field.restore(saved);
    field.step(15);
    expect(field.hash()).toBe(later);
    field.reset();
    const fresh = createDuneField(options);
    field.step(10);
    fresh.step(10);
    expect(field.hash()).toBe(fresh.hash());
    const thickness = field.thickness();
    expect(thickness[3]).toBeCloseTo((field.slabs()[3] ?? 0) * field.slabThickness, 12);
  });

  test("retuning the wind turns the dunes", () => {
    const field = createDuneField({ grid: { cols: 64, rows: 64, cellSize: 1 }, seed: "turn", initial: { sand: 1.5 } });
    field.step(300);
    field.retune({ wind: [{ toward: 180, share: 1 }] });
    expect(field.params().wind[0]?.toward).toBe(180);
    field.step(600);
    const trend = crestTrend(field);
    expect(Math.abs(trend.bearing - 90)).toBeLessThan(15);
    expect(() => field.retune({ hop: 0 })).toThrow();
  }, 30_000);
});
