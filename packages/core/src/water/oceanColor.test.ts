import { describe, expect, test } from "bun:test";
import { ocean } from "@jgengine/core/world/features";

import { createOceanConfig } from "./OceanConfig.draw";
import { oceanColor } from "./oceanColor";

describe("ocean palette", () => {
  test("a plain ocean only sets the shallow tone, so the shell's sea defaults stay", () => {
    expect(oceanColor(ocean({ color: "#123456" }))).toEqual({ shallow: "#123456" });
  });

  test("a palette recolors the deep, crest and foam and dims the sky mirror", () => {
    const slag = ocean({ color: "#ff5414", palette: { deep: "#5a0d00", crest: "#ffb347", foam: "#ffd27a", fresnel: 0.1 } });
    expect(slag.palette).toEqual({ deep: "#5a0d00", crest: "#ffb347", foam: "#ffd27a", fresnel: 0.1 });
    const resolved = createOceanConfig({ color: oceanColor(slag) });
    expect(resolved.color.shallow).toBe("#ff5414");
    expect(resolved.color.deep).toBe("#5a0d00");
    expect(resolved.color.crest).toBe("#ffb347");
    expect(resolved.color.foam).toBe("#ffd27a");
    expect(resolved.color.fresnelStrength).toBe(0.1);
  });

  test("a partial palette keeps the other defaults", () => {
    const sludge = createOceanConfig({ color: oceanColor(ocean({ color: "#4a7a1a", palette: { deep: "#13240a" } })) });
    const sea = createOceanConfig({});
    expect(sludge.color.deep).toBe("#13240a");
    expect(sludge.color.foam).toBe(sea.color.foam);
  });
});
