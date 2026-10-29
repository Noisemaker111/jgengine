import { describe, expect, test } from "bun:test";

import type { ModelConfig } from "../game/playableGame";
import { modelForLook, modelLooks } from "./modelLook";

const survivor: ModelConfig = {
  url: "/models/man.glb",
  targetHeight: 1.8,
  worn: { cloth_shirt: { region: "torso", material: { color: "#a3845a" } } },
  looks: { woman: { url: "/models/woman.glb", targetHeight: 1.7 } },
};

describe("model looks", () => {
  test("a look swaps the body and keeps the worn table", () => {
    const drawn = modelForLook(survivor, "woman");
    expect(drawn.url).toBe("/models/woman.glb");
    expect(drawn.targetHeight).toBe(1.7);
    expect(drawn.worn).toBe(survivor.worn);
    expect(drawn.looks).toBeUndefined();
  });

  test("no look, or one the model lacks, draws the model itself", () => {
    expect(modelForLook(survivor, undefined)).toBe(survivor);
    expect(modelForLook(survivor, "giant")).toBe(survivor);
  });

  test("modelLooks lists the model then every look", () => {
    expect(modelLooks(survivor).map((model) => model.url)).toEqual(["/models/man.glb", "/models/woman.glb"]);
  });
});
