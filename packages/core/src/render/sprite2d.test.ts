import { describe, expect, test } from "bun:test";
import { createSpriteClipPlayer, SortingLayers, sortingOrder } from "./sprite2d";

const atlas = { image: "sprites.png", size: [32, 16] as [number, number], frames: { idle0: { x: 0, y: 0, w: 16, h: 16 }, idle1: { x: 16, y: 0, w: 16, h: 16 } }, animations: { idle: { frames: ["idle0", "idle1"], fps: 2 }, once: { frames: ["idle0", "idle1"], fps: 2, loop: false } } };

describe("sprite clip player", () => {
  test("advances, snapshots, restores, and retunes", () => {
    const player = createSpriteClipPlayer(atlas);
    expect(player.frame()).toEqual(atlas.frames.idle0);
    player.advance(0.5);
    expect(player.frame()).toEqual(atlas.frames.idle1);
    const saved = player.snapshot();
    player.retune({ speed: 2 }); player.advance(0.5);
    player.restore(saved);
    expect(player.snapshot()).toEqual(saved);
  });
  test("stops non-looping clips at their final frame", () => {
    const player = createSpriteClipPlayer(atlas); player.play("once"); player.advance(1.1);
    expect(player.snapshot()).toMatchObject({ frameIndex: 1, done: true });
  });
  test("orders declared layers and rejects unknown names", () => {
    expect(sortingOrder(SortingLayers, "actors", 2)).toBe(4);
    expect(() => sortingOrder(SortingLayers, "missing")).toThrow();
  });
});
