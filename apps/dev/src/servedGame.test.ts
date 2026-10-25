import { describe, expect, test } from "bun:test";

import { engineCopySources, servedGameFrom } from "./servedGame";

describe("engineCopySources", () => {
  const paths = [
    "../../../games/deepward/src/index.tsx",
    "../../../games/deepward/src/ui/Hud.tsx",
    "../../../games/harbor-heat/src/index.tsx",
  ];

  test("a served game imports none of the engine's copy, so its stale style.css never loads", () => {
    expect(engineCopySources(paths, "deepward", servedGameFrom("C:/lane/deepward"))).toEqual([]);
  });

  test("an in-repo game scans its own sources only", () => {
    expect(engineCopySources(paths, "deepward", null)).toEqual(paths.slice(0, 2));
    expect(engineCopySources(paths, "deepward", servedGameFrom("C:/lane/harbor-heat"))).toEqual(paths.slice(0, 2));
  });
});

describe("servedGameFrom", () => {
  test("reads the folder name as the game id and normalises the path for /@fs/", () => {
    expect(servedGameFrom("C:\\games\\lane\\harbor-heat")).toEqual({ id: "harbor-heat", root: "C:/games/lane/harbor-heat" });
    expect(servedGameFrom("C:/games/lane/ember-command/")!.id).toBe("ember-command");
  });

  test("serves nothing when the flag was not passed", () => {
    expect(servedGameFrom(undefined)).toBeNull();
    expect(servedGameFrom("")).toBeNull();
    expect(servedGameFrom("   ")).toBeNull();
  });
});
