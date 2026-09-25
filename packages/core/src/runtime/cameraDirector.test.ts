import { describe, expect, test } from "bun:test";

import { createCameraDirector, nextChaseView } from "./cameraDirector";

describe("camera director FOV kicks", () => {
  test("sums kicks until drained, then reads zero", () => {
    const director = createCameraDirector();
    director.kickFov(4);
    director.kickFov(2.5);
    director.kickFov(Number.NaN);
    expect(director.takeFovKick()).toBe(6.5);
    expect(director.takeFovKick()).toBe(0);
  });

  test("carries a view switch through chase tuning", () => {
    const director = createCameraDirector();
    director.setChaseTuning({ distance: 8, view: "hood" });
    director.setChaseTuning({ ...director.chaseTuning(), view: nextChaseView(director.chaseTuning()?.view ?? "chase") });
    expect(director.chaseTuning()).toEqual({ distance: 8, view: "cockpit" });
  });
});

describe("nextChaseView", () => {
  test("cycles chase → hood → cockpit → chase by default", () => {
    expect(nextChaseView("chase")).toBe("hood");
    expect(nextChaseView("hood")).toBe("cockpit");
    expect(nextChaseView("cockpit")).toBe("chase");
  });

  test("restarts a custom cycle from a view outside it", () => {
    expect(nextChaseView("rear", ["chase", "cockpit"])).toBe("chase");
    expect(nextChaseView("chase", [])).toBe("chase");
  });
});
