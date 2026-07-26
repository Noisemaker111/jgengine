import { afterEach, describe, expect, it } from "bun:test";

import { defineBuildingKit } from "@jgengine/core/world/buildingKit";

import {
  clearBuildingKits,
  getBuildingKit,
  listBuildingKits,
  registerBuildingKit,
} from "./buildingKitRegistry";

const kit = (id: string) => defineBuildingKit({ id, parts: { wall: [`${id}.glb`] } });

afterEach(() => clearBuildingKits());

describe("buildingKitRegistry", () => {
  it("returns a registered kit by its own id", () => {
    registerBuildingKit(kit("downtown"));
    expect(getBuildingKit("downtown")?.id).toBe("downtown");
  });

  it("treats an unset or unknown name as no kit, so a scene falls back to blocks", () => {
    registerBuildingKit(kit("downtown"));
    expect(getBuildingKit("")).toBeUndefined();
    expect(getBuildingKit(undefined)).toBeUndefined();
    expect(getBuildingKit("missing")).toBeUndefined();
  });

  it("replaces a kit re-registered under the same name", () => {
    registerBuildingKit(kit("downtown"));
    registerBuildingKit(defineBuildingKit({ id: "downtown", parts: { wall: ["other.glb"] } }));
    expect(getBuildingKit("downtown")?.parts.wall).toEqual([{ model: "other.glb" }]);
    expect(listBuildingKits()).toEqual(["downtown"]);
  });

  it("lists every registered id in a stable order", () => {
    registerBuildingKit(kit("suburb"));
    registerBuildingKit(kit("downtown"));
    expect(listBuildingKits()).toEqual(["downtown", "suburb"]);
  });
});
