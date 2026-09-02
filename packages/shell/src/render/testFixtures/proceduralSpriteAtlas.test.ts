import { describe, expect, test } from "bun:test";
import { drawProceduralSpriteAtlas } from "./proceduralSpriteAtlas";

describe("procedural sprite atlas fixture", () => {
  test("draws a deterministic two-frame atlas", () => {
    const calls: string[] = [];
    const context = {
      fillStyle: "",
      clearRect: () => calls.push("clear"),
      fillRect: (x: number, y: number, width: number, height: number) => calls.push(`rect:${x},${y},${width},${height}`),
      beginPath: () => calls.push("path"),
      arc: () => calls.push("arc"),
      fill: () => calls.push("fill"),
    };
    const atlas = drawProceduralSpriteAtlas({
      width: 0,
      height: 0,
      getContext: () => context,
      toDataURL: () => "data:image/png;base64,fixture",
    });
    expect(atlas.size).toEqual([64, 32]);
    expect(atlas.animations.idle.frames).toEqual(["idle0", "idle1"]);
    expect(calls.filter((call) => call === "arc")).toHaveLength(2);
  });
});
