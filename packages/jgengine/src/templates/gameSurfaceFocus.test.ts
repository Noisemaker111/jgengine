import { describe, expect, test } from "bun:test";
import { gameSurfaceCenter, mouseButtonForCode } from "./gameSurfaceFocus";

describe("mouseButtonForCode", () => {
  test("maps the shell's pointer binding codes to CDP buttons and masks", () => {
    expect(mouseButtonForCode("mouse0")).toEqual({ button: "left", buttons: 1 });
    expect(mouseButtonForCode("mouse1")).toEqual({ button: "middle", buttons: 4 });
    expect(mouseButtonForCode("mouse2")).toEqual({ button: "right", buttons: 2 });
  });

  test("leaves keyboard codes to the key path", () => {
    expect(mouseButtonForCode("KeyW")).toBeNull();
    expect(mouseButtonForCode("Space")).toBeNull();
  });

  test("serializes without module references, as drive.mjs embeds it", () => {
    const rebuilt = new Function(`return (${mouseButtonForCode.toString()})`)() as typeof mouseButtonForCode;
    expect(rebuilt("mouse2")).toEqual({ button: "right", buttons: 2 });
  });
});

describe("gameSurfaceCenter", () => {
  const doc = (rect: { left: number; top: number; width: number; height: number } | null) => ({
    querySelector: () => (rect === null ? null : { getBoundingClientRect: () => rect }),
  });

  test("returns the canvas centre in viewport pixels", () => {
    expect(gameSurfaceCenter(doc({ left: 0, top: 40, width: 1280, height: 640 }))).toEqual({ x: 640, y: 360 });
  });

  test("is null without a visible canvas", () => {
    expect(gameSurfaceCenter(doc(null))).toBeNull();
    expect(gameSurfaceCenter(doc({ left: 0, top: 0, width: 0, height: 0 }))).toBeNull();
  });
});
