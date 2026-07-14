import { describe, expect, test } from "bun:test";

import { createVehicleSeats } from "./vehicleSeat";

describe("VehicleSeats enter/exit", () => {
  test("entering resolves seat, camera target, drive target, and freezes the rider", () => {
    const seats = createVehicleSeats();
    seats.register({ id: "car_1", kit: { kind: "ground" } });

    const result = seats.enter("hero", "car_1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cameraTarget).toBe("car_1");
    expect(result.driveTarget).toBe("car_1");
    expect(result.riderMovementPatch).toEqual({ frozen: true });
    expect(seats.isSeated("hero")).toBe(true);
    expect(seats.driverOf("car_1")).toBe("hero");
  });

  test("exiting computes a side-door placement and unfreezes the rider", () => {
    const seats = createVehicleSeats();
    seats.register({ id: "car_1", kit: { kind: "ground" } });
    seats.enter("hero", "car_1");

    const result = seats.exit("hero", { position: [10, 0, 20], rotationY: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.vehicleId).toBe("car_1");
    expect(result.cameraTarget).toBe("hero");
    expect(result.riderMovementPatch).toEqual({ frozen: false });
    expect(result.placement.position[0]).toBeGreaterThan(10);
    expect(result.placement.position[2]).toBeCloseTo(20);
    expect(seats.isSeated("hero")).toBe(false);
  });

  test("left-side dismount steps out the other way", () => {
    const seats = createVehicleSeats();
    seats.register({ id: "car_1", kit: { kind: "ground" } });
    seats.enter("hero", "car_1");
    const result = seats.exit("hero", { position: [0, 0, 0], rotationY: 0 }, { side: "left" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.placement.position[0]).toBeLessThan(0);
  });

  test("exiting an unmounted rider fails", () => {
    const seats = createVehicleSeats();
    const result = seats.exit("ghost", { position: [0, 0, 0], rotationY: 0 });
    expect(result.ok).toBe(false);
  });

  test("a second rider cannot take an occupied control seat", () => {
    const seats = createVehicleSeats();
    seats.register({ id: "car_1", kit: { kind: "ground" } });
    seats.enter("hero", "car_1");
    const blocked = seats.enter("villain", "car_1");
    expect(blocked.ok).toBe(false);
  });
});
