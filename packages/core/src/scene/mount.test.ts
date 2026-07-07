import { describe, expect, test } from "bun:test";

import { createMountController } from "./mount";

describe("MountController control transfer", () => {
  test("mounting transfers camera + input to the driven entity, dismount returns them", () => {
    const mc = createMountController();
    mc.register({ id: "horse", kit: { kind: "ground", moveSpeed: 9 } });
    expect(mc.cameraTarget("hero")).toBe("hero");
    expect(mc.driveTarget("hero")).toBe("hero");

    const res = mc.mount("hero", "horse");
    expect(res.ok).toBe(true);
    expect(mc.cameraTarget("hero")).toBe("horse");
    expect(mc.driveTarget("hero")).toBe("horse");
    expect(mc.driver("horse")).toBe("hero");
    expect(mc.kitOf("horse")?.moveSpeed).toBe(9);

    expect(mc.dismount("hero")).toBe("horse");
    expect(mc.cameraTarget("hero")).toBe("hero");
    expect(mc.driver("horse")).toBeNull();
  });

  test("unknown mount and taken seat are rejected", () => {
    const mc = createMountController();
    mc.register({ id: "boat", kit: { kind: "boat" } });
    const bad = mc.mount("a", "ghost");
    expect(bad.ok).toBe(false);
    mc.mount("a", "boat");
    const taken = mc.mount("b", "boat", "driver");
    expect(taken.ok).toBe(false);
    if (!taken.ok) expect(taken.reason).toBe("seat_taken");
  });

  test("multi-seat: one driver steers, passengers ride but do not drive", () => {
    const mc = createMountController();
    mc.register({
      id: "ship",
      kit: { kind: "boat" },
      seats: [
        { id: "helm", offset: [0, 1, 2], control: true },
        { id: "deck1", offset: [1, 1, -1] },
        { id: "deck2", offset: [-1, 1, -1] },
      ],
    });
    mc.mount("captain", "ship", "helm");
    mc.mount("mate", "ship", "deck1");

    expect(mc.driver("ship")).toBe("captain");
    expect(mc.driveTarget("captain")).toBe("ship");
    expect(mc.driveTarget("mate")).toBeNull();
    expect(mc.cameraTarget("mate")).toBe("ship");
    expect(mc.occupants("ship").map((o) => o.riderId).sort()).toEqual(["captain", "mate"]);
    expect(mc.seatOffset("mate")).toEqual([1, 1, -1]);
  });

  test("re-mounting auto-vacates the previous seat", () => {
    const mc = createMountController();
    mc.register({ id: "car", kit: { kind: "ground" } });
    mc.register({ id: "jet", kit: { kind: "flying" } });
    mc.mount("p", "car");
    mc.mount("p", "jet");
    expect(mc.driver("car")).toBeNull();
    expect(mc.driver("jet")).toBe("p");
  });
});
