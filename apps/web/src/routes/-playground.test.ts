import { describe, expect, test } from "bun:test";

import { parsePlaygroundQuery } from "./playground";

describe("playground query controls", () => {
  test("parses all generation and inspection controls deterministically", () => {
    const search = "?seed=vice-isle&size=300&gridness=.4&connectivity=.5&branching=.6&winding=.2&segmentLength=75&boulevards=.3&lotW=14&lotD=16&setback=4&spacing=3.5&variety=.8&fill=.9&landmarks=.1&elevation=.25&trackDensity=.7&sidewalks=false&sidewalkWidth=2.5&markings=off&markingWidth=.2&markingOffset=-.5&markingDash=6&markingGap=3&junction=5&cameraRadius=90&cameraPitch=50&cameraYaw=-35&inspect=1&capture=true&mode=city&view=3d";
    const parsed = parsePlaygroundQuery(search);
    expect(parsed).toEqual(parsePlaygroundQuery(search));
    expect(parsed).toMatchObject({
      dials: {
        seed: "vice-isle",
        size: 300,
        spacing: 3.5,
        variety: 0.8,
        blockFill: 0.9,
        sidewalks: false,
        laneMarkings: false,
        focusJunction: 5,
        cameraRadius: 90,
        cameraPitch: 50,
        cameraYaw: -35,
        sidewalkWidth: 2.5,
        laneMarkingWidth: 0.2,
      },
      mode: "city",
      view: "3d",
      inspect: true,
      capture: true,
    });
  });

  test("clamps generation, junction, and camera controls to safe ranges", () => {
    expect(parsePlaygroundQuery("?mode=circuit&size=999&gridness=-2&spacing=99&variety=-1&junction=-8&cameraRadius=-5&cameraPitch=180")).toMatchObject({
      mode: "circuit",
      dials: { size: 400, gridness: 0, spacing: 8, variety: 0, focusJunction: -1, cameraRadius: 12, cameraPitch: 85 },
    });
  });

  test("parses and clamps an explicit camera independently of junction framing", () => {
    expect(parsePlaygroundQuery("?cam=-12.5,44,999,5").cam).toEqual({ x: -12.5, z: 44, radius: 180, pitch: 25, yaw: 45 });
    expect(parsePlaygroundQuery("?cam=9999,-9999,80").cam).toEqual({ x: 1000, z: -1000, radius: 80, pitch: 45, yaw: 45 });
    expect(parsePlaygroundQuery("?cam=1,2,nope,40").cam).toBeNull();
  });

  test("leaves focused evidence defaults wider and less top-down", () => {
    expect(parsePlaygroundQuery("?junction=0").dials).toMatchObject({
      focusJunction: 0,
      cameraRadius: 120,
      cameraPitch: 45,
      cameraYaw: 45,
    });
  });
});
