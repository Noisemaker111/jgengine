import { describe, expect, it } from "bun:test";

import type { GameCaptureView } from "@jgengine/core/game/playableGame";

import { describeViews, resolveCaptureView } from "./captureView";

const views: Record<string, GameCaptureView> = {
  street: { description: "The main road.", look: "@marker:street", lookFrom: "30,12", settleMs: 4000 },
  lobby: { state: "lobby" },
};

function shot(result: ReturnType<typeof resolveCaptureView>) {
  if (result.kind !== "view") throw new Error(`expected a view, got ${JSON.stringify(result)}`);
  return result;
}

describe("resolveCaptureView", () => {
  it("is inert without ?shot=", () => {
    expect(resolveCaptureView({ views, viewName: null, explicit: {} }).kind).toBe("none");
  });

  it("applies every field a shot declares", () => {
    expect(shot(resolveCaptureView({ views, viewName: "street", explicit: {} })).overrides).toEqual({
      look: "@marker:street",
      lookFrom: "30,12",
      settleMs: 4000,
    });
  });

  it("lets an explicit param win over the shot's value", () => {
    const { overrides } = shot(
      resolveCaptureView({ views, viewName: "street", explicit: { lookFrom: "8,3" } }),
    );
    expect(overrides.lookFrom).toBe("8,3");
    expect(overrides.look).toBe("@marker:street");
  });

  it("carries staging fields, not just framing", () => {
    expect(shot(resolveCaptureView({ views, viewName: "lobby", explicit: {} })).overrides).toEqual({
      state: "lobby",
    });
  });

  it("fails an unknown name listing what is declared", () => {
    expect(resolveCaptureView({ views, viewName: "streets", explicit: {} })).toEqual({
      kind: "error",
      message: expect.stringContaining("declared views: lobby; street — The main road."),
    });
  });

  it("says so when the game declares none", () => {
    expect(resolveCaptureView({ views: undefined, viewName: "street", explicit: {} })).toEqual({
      kind: "error",
      message: expect.stringContaining("declares no capture.views"),
    });
  });
});

describe("describeViews", () => {
  it("sorts by name and appends descriptions where present", () => {
    expect(describeViews(views)).toEqual(["lobby", "street — The main road."]);
  });

  it("is empty for a game with no shots", () => {
    expect(describeViews(undefined)).toEqual([]);
  });
});
