import { describe, expect, test } from "bun:test";

import { parsePlaygroundQuery } from "./playground";

describe("playground query controls", () => {
  test("reproduces the website capture controls deterministically", () => {
    expect(
      parsePlaygroundQuery(
        "?seed=vice-isle&fill=1&inspect=1&capture=1&junction=5&cameraRadius=38&cameraPitch=78&sidewalkWidth=2.5&markingWidth=0.2",
      ),
    ).toMatchObject({
      dials: {
        seed: "vice-isle",
        blockFill: 1,
        focusJunction: 5,
        cameraRadius: 38,
        cameraPitch: 78,
        sidewalkWidth: 2.5,
        laneMarkingWidth: 0.2,
      },
      inspect: true,
      capture: true,
    });
  });

  test("selects circuit mode and clamps camera controls to the UI range", () => {
    expect(parsePlaygroundQuery("?mode=circuit&cameraRadius=-5&cameraPitch=180")).toMatchObject({
      mode: "circuit",
      dials: { cameraRadius: 12, cameraPitch: 85 },
    });
  });
});
