import { describe, expect, test } from "bun:test";

import { tuneControlLabels } from "./TunePanel.view";

describe("TunePanel labels", () => {
  test("the number field answers to the control name and the range to `<name> slider`", () => {
    expect(tuneControlLabels("city/sidewalkWidth")).toEqual({ range: "city/sidewalkWidth slider", number: "city/sidewalkWidth" });
  });
});
