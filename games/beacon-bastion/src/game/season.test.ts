import { describe, expect, test } from "bun:test";

import { MAP_IDS, MAPS } from "../maps";
import { campaign, freshCampaign, readCampaign } from "./campaign";
import { districtOpen, districtStars, nextDistrict, recordDistrict, seasonProgress } from "./season";
import { beaconRunner } from "./testing";
import { pendingArrival, travelTo } from "./travel";

describe("the season", () => {
  test("districts open in order: Main Street first, each next one once the one before is held", () => {
    const state = freshCampaign();
    expect(MAP_IDS[0]).toBe("main-street");
    expect(districtOpen(state, "main-street")).toBe(true);
    expect(districtOpen(state, "downtown")).toBe(false);
    expect(districtOpen(state, "school")).toBe(false);
    const held = { ...state, districts: { "main-street": 2 } };
    expect(districtOpen(held, "downtown")).toBe(true);
    expect(districtOpen(held, "school")).toBe(false);
    expect(nextDistrict(held, "main-street")).toBe("downtown");
    expect(seasonProgress(held)).toEqual({ held: 1, total: MAP_IDS.length });
  });

  test("a district keeps its best stars and a lost day records nothing", () => {
    const runner = beaconRunner("season");
    recordDistrict(runner.ctx, "main-street", 0);
    expect(districtStars(campaign.read(runner.ctx), "main-street")).toBe(0);
    recordDistrict(runner.ctx, "main-street", 2);
    recordDistrict(runner.ctx, "main-street", 1);
    expect(districtStars(campaign.read(runner.ctx), "main-street")).toBe(2);
  });

  test("the season rides on the saved campaign and survives a round trip", () => {
    const stored = JSON.parse(JSON.stringify({ ...freshCampaign(), districts: { "main-street": 3, downtown: 1, bogus: "x" } }));
    expect(readCampaign(stored)?.districts).toEqual({ "main-street": 3, downtown: 1 });
    expect(readCampaign({ difficulty: "fulltime" })?.districts).toEqual({});
  });

  test("a trip to a locked district or the current one is refused and leaves nothing pending", async () => {
    const runner = beaconRunner("travel");
    expect(await travelTo(runner.ctx, "downtown")).toBe(false);
    expect(await travelTo(runner.ctx, "main-street")).toBe(false);
    expect(pendingArrival()).toBe(null);
  });

  test("every district has a label and a detail the season map shows; only the School rings a recess bell", () => {
    for (const id of MAP_IDS) expect(MAPS[id].label.length).toBeGreaterThan(0);
    expect(MAPS.school.recess?.every).toBeGreaterThan(MAPS.school.recess!.seconds);
    expect(MAPS["main-street"].recess).toBeUndefined();
  });
});
