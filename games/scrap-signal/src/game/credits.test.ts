import { describe, expect, test } from "bun:test";

import { SCRAP_CREDITS } from "./credits";

describe("scrap-signal credits", () => {
  test("credit every model and material pack the game ships", () => {
    const labels = SCRAP_CREDITS.sections.flatMap((section) => section.entries.map((entry) => `${entry.label} ${entry.detail ?? ""}`)).join("\n");
    expect(labels).toMatch(/Quaternius/i);
    expect(labels).toMatch(/KayKit/i);
    expect(labels).toMatch(/ambientCG/i);
  });
});
