import { describe, expect, test } from "bun:test";

import { entityModels, scatterModels } from "./models";

describe("tower-guard models", () => {
  test("ships no external-model dependency — entities render on engine primitives until art is re-homed", () => {
    expect(Object.keys(entityModels)).toHaveLength(0);
    expect(Object.keys(scatterModels)).toHaveLength(0);
  });
});
