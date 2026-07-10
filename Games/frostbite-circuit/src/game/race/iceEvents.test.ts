import { describe, expect, test } from "bun:test";

import { buildIceWorld } from "../ice/build";
import { bannersFromChanges, lapFlavorLine, radioLinesFromChanges, sinkRadioLine } from "./iceEvents";

describe("radio + corner banner copy", () => {
  test("a cracked transition produces a reactive corner banner", () => {
    const banners = bannersFromChanges([{ cx: 0, cz: 0, corridor: "inner", corner: 2, from: "solid", to: "cracked" }], 10);
    expect(banners).toHaveLength(1);
    expect(banners[0]!.message).toContain("CORNER 2");
    expect(banners[0]!.message).toContain("INNER");
    expect(banners[0]!.message).toContain("CRACKED");
  });

  test("an open transition names the corridor as gone", () => {
    const banners = bannersFromChanges([{ cx: 0, cz: 0, corridor: "outer", corner: 4, from: "cracked", to: "open" }], 10);
    expect(banners[0]!.message).toContain("OUTER");
    expect(banners[0]!.message).toContain("OPEN WATER");
    expect(banners[0]!.severity).toBe("open");
  });

  test("radio lines narrate dying corridors distinctly from freshly-open ones", () => {
    const cracked = radioLinesFromChanges([{ cx: 0, cz: 0, corridor: "mid", corner: 1, from: "solid", to: "cracked" }], 5);
    const open = radioLinesFromChanges([{ cx: 0, cz: 0, corridor: "mid", corner: 1, from: "cracked", to: "open" }], 5);
    expect(cracked[0]!.message).toMatch(/won't take that line twice/i);
    expect(open[0]!.message).toMatch(/black water/i);
  });

  test("sink line names the racer and corner", () => {
    const line = sinkRadioLine("Borealis", 3, 12);
    expect(line.message).toContain("Borealis");
    expect(line.message).toContain("3");
  });

  test("lap flavor references the current lap and degrades in tone as ice thins", () => {
    const world = buildIceWorld();
    const early = lapFlavorLine(2, 5, world, 0);
    expect(early.message).toContain("2");

    const final = lapFlavorLine(5, 5, world, 0);
    expect(final.message.toLowerCase()).toContain("final lap");
  });
});
