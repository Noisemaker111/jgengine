import { describe, expect, test } from "bun:test";

import type { Pylon } from "../world/archipelago";
import { pickHookTarget } from "./hookTarget";

function pylon(id: string, x: number, y: number, z: number): Pylon {
  return { id, isletId: id, base: { x, y: 0, z }, ringY: y, height: y, standalone: false };
}

const ORIGIN = { x: 0, y: 0, z: 0 };
const FORWARD = { x: 0, y: 0, z: 1 };
const MAX_LENGTH = 40;
const CONE_COS = Math.cos((40 * Math.PI) / 180);

describe("pickHookTarget", () => {
  test("picks the nearest pylon within range and inside the view cone", () => {
    const pylons = [pylon("far", 0, 0, 30), pylon("near", 2, 0, 10), pylon("mid", -1, 0, 18)];
    const target = pickHookTarget(ORIGIN, FORWARD, pylons, MAX_LENGTH, CONE_COS);
    expect(target?.id).toBe("near");
  });

  test("excludes a pylon beyond maxLength even if it is directly ahead", () => {
    const pylons = [pylon("too-far", 0, 0, 100)];
    expect(pickHookTarget(ORIGIN, FORWARD, pylons, MAX_LENGTH, CONE_COS)).toBeNull();
  });

  test("excludes a closer pylon outside the forward view cone", () => {
    const behind = pylon("behind", 0, 0, -5);
    const ahead = pylon("ahead", 0, 0, 20);
    const target = pickHookTarget(ORIGIN, FORWARD, [behind, ahead], MAX_LENGTH, CONE_COS);
    expect(target?.id).toBe("ahead");
  });

  test("returns null when nothing is in range", () => {
    expect(pickHookTarget(ORIGIN, FORWARD, [], MAX_LENGTH, CONE_COS)).toBeNull();
  });
});
