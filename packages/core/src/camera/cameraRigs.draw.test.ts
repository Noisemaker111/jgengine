import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// No React renderer runs in shell tests, so this pins the wiring; applyRtsCenter's math is covered in rigMath.test.ts.
describe("RtsRig pan jump", () => {
  test("drains ctx.camera.panTo each frame through the bounded center step", () => {
    const source = readFileSync(new URL("./cameraRigs.draw.tsx", import.meta.url), "utf8");
    const rig = source.slice(source.indexOf("export function rtsRigDraw"), source.indexOf("export function shoulderRigDraw"));
    expect(rig).toContain("applyRtsCenter(center, env.ctx.camera.takePanTo(), config?.bounds);");
  });
});
