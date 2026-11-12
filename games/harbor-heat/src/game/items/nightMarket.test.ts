import { describe, expect, test } from "bun:test";
import { getGenerator, runGenerator } from "@jgengine/core/generator/generator";
import { marketGunById, NIGHT_MARKET_LOOT } from "./nightMarket";

describe("night market guns", () => {
  test("a market id rebuilds the gun it rolled before the generator (fixed-seed fingerprint)", () => {
    const gun = marketGunById("market.2.7:1");
    expect(gun?.label).toBe("Dockside Ported Boardwalk 12g");
    expect(gun?.fireIntervalMs).toBe(1247);
    expect(gun?.weapon?.damage).toBe(60);
  });

  test("each shelf slot is that day's seeded roll, and a day's shelf differs from the next", () => {
    expect(getGenerator("harbor-heat.night-market")?.output).toBe(NIGHT_MARKET_LOOT.output);
    const shelf = runGenerator(NIGHT_MARKET_LOOT, { seed: "harbor-market:4", level: 3, count: 3 });
    expect(shelf.map((item) => item.name)).toEqual([0, 1, 2].map((index) => marketGunById(`market.4.3:${index}`)?.label));
    expect(runGenerator(NIGHT_MARKET_LOOT, { seed: "harbor-market:5", level: 3, count: 3 })).not.toEqual(shelf);
  });
});
