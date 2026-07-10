import { describe, expect, test } from "bun:test";
import { START_BANK } from "./config";
import { PachinkoStore } from "./store";

describe("store bridge", () => {
  test("hold then release launches exactly one ball", () => {
    const store = new PachinkoStore("hold");
    store.setPointerHeld(true);
    store.tick(0.25, false);
    expect(store.getState().charging).toBe(true);
    expect(store.getState().power).toBeGreaterThan(0);
    store.setPointerHeld(false);
    store.tick(1 / 120, false);
    expect(store.sim.launched).toBe(1);
  });

  test("keyboard hold charges and releasing fires", () => {
    const store = new PachinkoStore("key");
    store.tick(0.3, true);
    store.tick(1 / 120, false);
    expect(store.sim.launched).toBe(1);
  });

  test("auto-fire launches balls over time", () => {
    const store = new PachinkoStore("auto");
    store.toggleAutoFire();
    expect(store.getState().autoFire).toBe(true);
    for (let i = 0; i < 180; i += 1) store.tick(1 / 60, false);
    expect(store.sim.launched).toBeGreaterThanOrEqual(2);
  });

  test("running dry flags broke and rebuy restores the bank", () => {
    const store = new PachinkoStore("broke");
    store.sim.bank = 0;
    store.tick(1 / 60, false);
    expect(store.getState().broke).toBe(true);
    store.rebuy();
    expect(store.getState().broke).toBe(false);
    expect(store.getState().bank).toBe(START_BANK);
  });

  test("best bank is recorded and surfaced in the snapshot", () => {
    const store = new PachinkoStore("best");
    store.sim.bank = 500;
    store.tick(1 / 120, false);
    expect(store.getState().bestBank).toBe(500);
  });

  test("snapshot reference is stable while idle and changes on activity", () => {
    const store = new PachinkoStore("idle");
    store.tick(1 / 120, false);
    const a = store.getState();
    store.tick(1 / 120, false);
    expect(store.getState()).toBe(a);
    store.setPointerHeld(true);
    store.tick(1 / 120, false);
    expect(store.getState()).not.toBe(a);
  });
});
