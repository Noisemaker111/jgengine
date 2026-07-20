import { describe, expect, test } from "bun:test";
import {
  DEFAULT_BLOCK_FILL,
  DEFAULT_LANDMARK_SHARE,
  LANDMARK_HARD_CAP,
  generateCity,
  resolveCityLotContent,
} from "./cityGenerator";
import { CITY_LANDMARK_CLASSES, CITY_LOT_CLASSES, type CityLandmarkClass, type CityLotClass } from "./cityContent";
import { isOnRoad, nearestOnPath } from "./roads";

describe("cityGenerator — plot-first city", () => {
  const city = generateCity({ seed: "spec-city", content: true }, 300, 300);

  test("one seed grows a populated city: streets, blocks, plots", () => {
    expect(city.network.mode).toBe("net");
    expect(city.network.streets.length).toBeGreaterThan(4);
    expect(city.plots.length).toBeGreaterThan(10);
    expect(city.lots.length).toBe(city.plots.length);
    expect(city.lotContent?.length).toBe(city.plots.length);
  });

  test("identical options generate the identical city", () => {
    const again = generateCity({ seed: "spec-city", content: true }, 300, 300);
    expect(again.network).toEqual(city.network);
    expect(again.plots).toEqual(city.plots);
    expect(again.lots).toEqual(city.lots);
    expect(again.lotContent).toEqual(city.lotContent);
    const other = generateCity({ seed: "other-city", content: true }, 300, 300);
    expect(other.plots).not.toEqual(city.plots);
  });

  test("every plot fronts a real street within reach — no orphan buildings", () => {
    for (const plot of city.plots) {
      const street = city.network.streets[plot.frontage.street];
      expect(street).toBeDefined();
      const mid: [number, number] = [
        (plot.frontage.a[0] + plot.frontage.b[0]) / 2,
        (plot.frontage.a[1] + plot.frontage.b[1]) / 2,
      ];
      const near = nearestOnPath(street!.points, mid[0], mid[1]);
      expect(near).not.toBeNull();
      // Frontage chord sits just behind the sidewalk band: curb half-width + sidewalk + a corner
      // allowance (ring insets bow outward at block corners).
      expect(near!.distance).toBeLessThanOrEqual(street!.width / 2 + 12);
    }
  });

  test("no building rect sits on any street ribbon", () => {
    for (const lot of city.lots) {
      const clear = city.network.streets.every(
        (street) => !isOnRoad(street.points, street.width, lot.center[0], lot.center[1]),
      );
      expect(clear).toBe(true);
    }
  });

  test("plots come in many sizes and tiers", () => {
    const tiers = new Set(city.plots.map((p) => p.tier));
    expect(tiers.size).toBeGreaterThanOrEqual(3);
    const widths = city.plots.map((p) => p.width);
    expect(Math.max(...widths) / Math.min(...widths)).toBeGreaterThan(2);
  });

  test("lanes carry no frontage by default", () => {
    for (const plot of city.plots) {
      expect(city.network.streets[plot.frontage.street]!.level).not.toBe("lane");
    }
  });

  test("plots stay inside the volume", () => {
    for (const plot of city.plots) {
      expect(Math.abs(plot.center[0])).toBeLessThanOrEqual(300);
      expect(Math.abs(plot.center[1])).toBeLessThanOrEqual(300);
    }
  });

  test("street overrides pass through to the network", () => {
    const circuitish = generateCity(
      { seed: "spec-city", streets: { loopiness: 1, connectivity: 0, branching: 0, deadEnds: 0 } },
      300,
      300,
    );
    expect(circuitish.network.mode).toBe("circuit");
  });
});

describe("cityGenerator — grand plots (landmarks are just big plots)", () => {
  test("grand plots resolve to landmark classes, ordinary plots to lot classes", () => {
    const city = generateCity({ seed: "grand-spec", content: { landmarks: 0.2 } }, 320, 320);
    const grand = (city.lotContent ?? []).filter((r) => r.landmark !== undefined);
    expect(grand.length).toBeGreaterThan(0);
    expect(grand.length).toBeLessThanOrEqual(LANDMARK_HARD_CAP);
    for (const entry of grand) {
      expect(CITY_LANDMARK_CLASSES).toContain(entry.class as CityLandmarkClass);
      expect(entry.class).toBe(entry.landmark!);
    }
    for (const entry of (city.lotContent ?? []).filter((r) => r.landmark === undefined)) {
      expect(CITY_LOT_CLASSES).toContain(entry.class as CityLotClass);
    }
    // Grand plots are geometry: block-scale frontage, never demoted below the large tier's floor.
    for (const plot of city.plots.filter((p) => p.tier === "grand")) {
      expect(plot.width).toBeGreaterThanOrEqual(24);
    }
  });

  test("landmarks: 0 yields a city with no grand plots", () => {
    const city = generateCity({ seed: "grand-spec", content: { landmarks: 0 } }, 320, 320);
    expect(city.plots.every((p) => p.tier !== "grand")).toBe(true);
    expect((city.lotContent ?? []).every((r) => r.landmark === undefined)).toBe(true);
  });

  test("landmarkClasses restricts what a grand plot may roll", () => {
    const city = generateCity(
      { seed: "grand-spec", content: { landmarks: 0.2, landmarkClasses: ["arena"] } },
      320,
      320,
    );
    for (const entry of (city.lotContent ?? []).filter((r) => r.landmark !== undefined)) {
      expect(entry.class).toBe("arena");
    }
  });
});

describe("cityGenerator — blockFill and parks", () => {
  test("higher fill packs more frontage; parks survive at full fill", () => {
    const loose = generateCity({ seed: "fill-spec", content: { blockFill: 0.15 } }, 300, 300);
    const dense = generateCity({ seed: "fill-spec", content: { blockFill: 1 } }, 300, 300);
    expect(dense.plots.length).toBeGreaterThan(loose.plots.length);
    expect(loose.parks.length).toBeGreaterThanOrEqual(dense.parks.length);
  });

  test("default fill matches the documented constant", () => {
    expect(DEFAULT_BLOCK_FILL).toBeCloseTo(0.45);
    expect(DEFAULT_LANDMARK_SHARE).toBeCloseTo(0.04);
  });
});

describe("cityGenerator — seed-unique silhouette", () => {
  const bbox = (seed: string, outline?: number): { w: number; h: number } => {
    const city = generateCity({ seed, streets: outline === undefined ? {} : { outline } }, 260, 260);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const s of city.network.streets) {
      for (const [x, z] of s.points) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
    }
    return { w: maxX - minX, h: maxZ - minZ };
  };

  test("outline 0 keeps the legacy full-rectangle footprint", () => {
    const full = bbox("shape-a", 0);
    expect(full.w).toBeGreaterThan(480);
    expect(full.h).toBeGreaterThan(480);
  });

  test("street networks stay connected under the default outline", () => {
    for (const seed of ["shape-a", "shape-b", "shape-c"]) {
      const city = generateCity({ seed }, 260, 260);
      const adj = new Map<number, number[]>();
      for (const e of city.network.edges) {
        (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push(e.b);
        (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push(e.a);
      }
      const nodes = [...adj.keys()];
      expect(nodes.length).toBeGreaterThan(4);
      const seen = new Set<number>([nodes[0]!]);
      const queue = [nodes[0]!];
      while (queue.length > 0) {
        for (const n of adj.get(queue.pop()!) ?? []) {
          if (!seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      expect(seen.size).toBe(nodes.length);
    }
  });
});

describe("resolveCityLotContent — legacy lots-only city", () => {
  test("resolves a hand-built {network, lots} pair without plots", () => {
    const city = generateCity({ seed: "legacy-spec" }, 260, 260);
    const bare = { network: city.network, lots: city.lots };
    const resolved = resolveCityLotContent(bare, { seed: "legacy-spec", halfExtents: [260, 260] });
    expect(resolved.length).toBe(city.lots.length);
    for (const entry of resolved) {
      expect(entry.landmark).toBeUndefined();
      expect(CITY_LOT_CLASSES).toContain(entry.class as CityLotClass);
      expect(entry.pieces.length).toBeGreaterThan(0);
      expect(entry.floors).toBeGreaterThanOrEqual(1);
    }
  });

  test("deterministic per seed", () => {
    const city = generateCity({ seed: "det-spec" }, 260, 260);
    const a = resolveCityLotContent(city, { seed: "det-spec", halfExtents: [260, 260] });
    const b = resolveCityLotContent(city, { seed: "det-spec", halfExtents: [260, 260] });
    expect(a).toEqual(b);
  });
});
