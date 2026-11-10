import { expect, test } from "bun:test";
import { createElement, jsx } from "./element";

test("3D intrinsic wrappers cannot silently become HTML elements", () => {
  expect(() => createElement("group", { position: [0, -1.42, 0] })).toThrow("useEngineDraw");
  expect(() => jsx("mesh", {})).toThrow("useEngineDraw");
  expect(() => createElement("perspectiveCamera", {})).toThrow("useEngineDraw");
  expect(createElement("g", {}).type).toBe("g");
  expect(createElement("game-panel", {}).type).toBe("game-panel");
});
