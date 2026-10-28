import { describe, expect, test } from "bun:test";
import { libraryIconUrl } from "@jgengine/assets/library/libraryIcons";

import { ITEMS } from "../data/items";
import { itemIconCredits, itemIconKey } from "./itemIcons";

describe("item icons", () => {
  test("every item draws a game-icons.net icon that resolves", () => {
    for (const item of ITEMS) {
      const key = itemIconKey(item.id);
      expect(key, item.id).not.toBeNull();
      expect(libraryIconUrl(key ?? "")).toStartWith("/sprites/gameicons-icons/");
    }
  });

  test("the credits name each icon artist", () => {
    const credits = itemIconCredits().join("\n");
    expect(credits).toContain("Delapouite");
    expect(credits).toContain("Lorc");
  });
});
