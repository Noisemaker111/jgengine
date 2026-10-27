import { describe, expect, test } from "bun:test";

import { withField } from "./withField";

interface Row {
  id: string;
  label?: string;
}

describe("withField", () => {
  test("sets a value without touching the original", () => {
    const row: Row = { id: "a" };
    expect(withField(row, "label", "Gate")).toEqual({ id: "a", label: "Gate" });
    expect(row).toEqual({ id: "a" });
  });

  test("undefined leaves the key out instead of storing undefined", () => {
    const cleared = withField<Row, "label">({ id: "a", label: "Gate" }, "label", undefined);
    expect("label" in cleared).toBe(false);
    expect(JSON.stringify(cleared)).toBe('{"id":"a"}');
  });
});
