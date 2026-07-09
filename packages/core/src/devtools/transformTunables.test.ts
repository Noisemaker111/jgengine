import { describe, expect, test } from "bun:test";

import { createDevtools } from "./devtools";
import { transformTunableExports, tunableModuleTable, tunableDiscoveryPlugin } from "./transformTunables";

describe("transformTunableExports", () => {
  test("rewrites primitive const exports to live bindings and appends registration", () => {
    const source = [
      'import { other } from "./other";',
      "export const WORLD_RADIUS = 12;",
      "export const GRAVITY = -22.5;",
      "export const HARDCORE = false;",
      'export const SKY = "#87ceeb";',
      "export const NAME = \"voxel\";",
      "export const TABLE = { a: 1 };",
      "const local = 3;",
    ].join("\n");
    const result = transformTunableExports(source, "game/worldgen");
    expect(result.bound).toEqual(["WORLD_RADIUS", "GRAVITY", "HARDCORE", "SKY"]);
    expect(result.code).toContain("export let WORLD_RADIUS = 12;");
    expect(result.code).toContain("export let GRAVITY = -22.5;");
    expect(result.code).toContain('export let SKY = "#87ceeb";');
    expect(result.code).toContain("export const NAME = \"voxel\";");
    expect(result.code).toContain("export const TABLE = { a: 1 };");
    expect(result.code).toContain('__jg_devtools.discover.bind("game/worldgen", "WORLD_RADIUS"');
  });

  test("returns input unchanged when nothing matches", () => {
    const source = "export const TABLE = { a: 1 };\n";
    const result = transformTunableExports(source, "x");
    expect(result.code).toBe(source);
    expect(result.bound).toEqual([]);
  });

  test("bound accessors round trip through the discovery registry", () => {
    const dev = createDevtools();
    let REACH = 6;
    dev.discover.bind("game/loop", "REACH", {
      initial: REACH,
      get: () => REACH,
      set: (value) => {
        REACH = value as number;
      },
    });
    dev.discover.enable("game/loop/REACH");
    dev.controls.get("game/loop/REACH")!.write(11);
    expect(REACH).toBe(11);
    dev.discover.disable("game/loop/REACH");
    expect(REACH).toBe(6);
  });
});

describe("tunableModuleTable", () => {
  test("derives table names from game source paths only", () => {
    expect(tunableModuleTable("/repo/Games/voxel-mine/src/game/worldgen.ts")).toBe("game/worldgen");
    expect(tunableModuleTable("/repo/Games/voxel-mine/src/loop.ts")).toBe("loop");
    expect(tunableModuleTable("/repo/Games/voxel-mine/src/main.tsx")).toBeNull();
    expect(tunableModuleTable("/repo/Games/voxel-mine/src/game/handlers.test.ts")).toBeNull();
    expect(tunableModuleTable("/repo/packages/core/src/devtools/devtools.ts")).toBeNull();
  });
});

describe("tunableDiscoveryPlugin", () => {
  test("transforms matching modules and skips the rest", () => {
    const plugin = tunableDiscoveryPlugin();
    const hit = plugin.transform("export const SPEED = 4;", "/repo/Games/demo/src/game/tuning.ts");
    expect(hit?.code).toContain("export let SPEED = 4;");
    expect(plugin.transform("export const SPEED = 4;", "/repo/packages/core/src/x.ts")).toBeNull();
    expect(plugin.transform("const SPEED = 4;", "/repo/Games/demo/src/game/tuning.ts")).toBeNull();
  });
});
