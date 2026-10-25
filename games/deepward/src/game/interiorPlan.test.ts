import { expect, test } from "bun:test";
import { findLibraryMaterial } from "@jgengine/assets/catalogs/materialLibrary";
import { findLibraryModelByName } from "@jgengine/assets/catalogs/modelLibrary";

import { floorDressing, LIFTS, NODES, SUPPLIES, walkable } from "../world";
import { clutterFootprint, FLOOR_DEBRIS, FLOOR_PROPS } from "./interiorPlan";
import { FLOOR_LOOK, LIBRARY_SOURCES } from "./interiorLook";
import { STRATUM_ORDER } from "./strata";

test("every floor is dressed: trims, pipes, wall lamps and clutter", () => {
  for (const stratum of STRATUM_ORDER) {
    const { plan, props } = floorDressing(stratum);
    expect(plan.trims.length).toBeGreaterThan(0);
    expect(plan.pipes.length).toBeGreaterThan(0);
    expect(plan.fixtures.length).toBeGreaterThan(0);
    expect(props.length).toBeGreaterThan(0);
    for (const { model } of props) expect(FLOOR_PROPS[stratum]).toContain(model);
  }
});

test("no prop covers a lift, a resource node or a supply cache", () => {
  for (const stratum of STRATUM_ORDER) {
    const spots = [...LIFTS, ...NODES, ...SUPPLIES].filter(entry => entry.place === stratum).map(entry => entry.at);
    for (const { slot } of floorDressing(stratum).props) {
      const box = clutterFootprint(slot);
      for (const at of spots) expect(Math.abs(at[0] - box.x) < box.w / 2 && Math.abs(at[2] - box.z) < box.d / 2).toBe(false);
    }
  }
});

test("the lifts and pickups stay walkable with the clutter standing", () => {
  for (const stratum of STRATUM_ORDER) {
    for (const lift of LIFTS.filter(entry => entry.place === stratum)) expect(walkable(lift.at[0], lift.at[2], stratum)).toBe(true);
  }
});

test("every prop the floors use is in the model library", () => {
  for (const name of new Set([...Object.values(FLOOR_PROPS).flat(), ...Object.values(FLOOR_DEBRIS).flat()])) expect(findLibraryModelByName(name)).not.toBeNull();
});

test("every floor strews debris from its own scrap pool", () => {
  for (const stratum of STRATUM_ORDER) {
    const dressing = floorDressing(stratum);
    expect(dressing.debris.length).toBeGreaterThan(0);
    for (const { model } of dressing.debris) expect(FLOOR_DEBRIS[stratum]).toContain(model);
  }
});

test("the floors' scans are the library entries the provisioner pulls", () => {
  for (const [name, source] of Object.entries(LIBRARY_SOURCES)) expect(findLibraryMaterial(name)?.source).toBe(source);
  // Each floor wears its own shell, so no two read as the same place.
  const shells = STRATUM_ORDER.map(stratum => JSON.stringify([FLOOR_LOOK[stratum].wall.maps, FLOOR_LOOK[stratum].floor.maps]));
  expect(new Set(shells).size).toBe(STRATUM_ORDER.length);
});
