import { describe, expect, test } from "bun:test";

import { SCRAP_CREDITS } from "./credits";

describe("scrap-signal credits", () => {
  test("credit every model and material pack the game ships", () => {
    const labels = SCRAP_CREDITS.sections.flatMap((section) => section.entries.map((entry) => `${entry.label} ${entry.detail ?? ""}`)).join("\n");
    for (const pack of ["Modular SciFi MegaKit", "Toon Shooter Game Kit", "Animated Mech Pack", "Animated LowPoly Robot", "Low Poly Desert Assets", "Stylized Nature MegaKit"]) expect(labels).toContain(`${pack} Quaternius`);
    expect(labels).toMatch(/ambientCG/i);
    expect(labels).toMatch(/Greg Zaal/);
  });
});
