import { describe, expect, test } from "bun:test";
import { fromAseprite, fromTexturePacker } from "./spriteAtlas";

describe("sprite atlas adapters", () => {
  test("converts Aseprite hash and tags", () => {
    const atlas = fromAseprite({ frames: { idle0: { frame: { x: 0, y: 0, w: 8, h: 8 } }, idle1: { frame: { x: 8, y: 0, w: 8, h: 8 } } }, meta: { image: "hero.png", size: { w: 16, h: 8 }, frameTags: [{ name: "idle", from: 0, to: 1 }] } });
    expect(atlas.image).toBe("hero.png"); expect(atlas.animations.idle.frames).toEqual(["idle0", "idle1"]);
  });
  test("converts TexturePacker array and preserves pivots", () => {
    const atlas = fromTexturePacker({ frames: [{ filename: "hero", frame: { x: 1, y: 2, w: 8, h: 9 }, pivot: { x: 0.5, y: 1 } }], meta: { image: "atlas.png", size: { w: 32, h: 32 } } });
    expect(atlas.frames.hero).toEqual({ x: 1, y: 2, w: 8, h: 9 });
    expect(atlas.animations.default.frames).toEqual(["hero"]);
  });
});
