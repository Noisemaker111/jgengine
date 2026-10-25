import { describe, expect, test } from "bun:test";
import { splitTrackedQuests } from "./Mission";

describe("splitTrackedQuests", () => {
  test("the first active quest gets the full card and the rest collapse to lines", () => {
    const { primary, others } = splitTrackedQuests(["main", "side", "extra"]);
    expect(primary).toBe("main");
    expect(others).toEqual(["side", "extra"]);
  });

  test("a single active quest has no collapsed lines", () => {
    expect(splitTrackedQuests(["only"])).toEqual({ primary: "only", others: [] });
  });

  test("no active quest leaves nothing to show", () => {
    expect(splitTrackedQuests<string>([])).toEqual({ primary: undefined, others: [] });
  });
});
