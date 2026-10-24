import { describe, expect, test } from "bun:test";

import { servedGameFrom } from "./servedGame";

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
