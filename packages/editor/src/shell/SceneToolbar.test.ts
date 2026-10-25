import { expect, test } from "bun:test";

import { ADD_VOLUME_ENTRIES } from "./SceneToolbar";

test("the add menu offers no second vegetation volume: grass is authored as a grass field", () => {
  expect(ADD_VOLUME_ENTRIES.length).toBeGreaterThan(0);
  for (const entry of ADD_VOLUME_ENTRIES) {
    expect(entry.label.toLowerCase()).not.toContain("vegetation");
  }
});
