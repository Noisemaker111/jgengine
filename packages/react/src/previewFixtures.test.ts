import { describe, expect, test } from "bun:test";

import { BarsPreview } from "./barsPreview";
import { HudThemePreview } from "./hudThemePreview";
import { IconsPreview } from "./iconsPreview";
import {
  PREVIEW_FIXTURES,
  previewFixtureNames,
  resolvePreviewFixture,
} from "./previewFixtures";

describe("previewFixtures registry", () => {
  test("names list is sorted and covers the registered fixtures", () => {
    const names = previewFixtureNames();
    expect(names).toEqual([...names].sort());
    expect(names).toContain("HudThemePreview");
    expect(names).toContain("BarsPreview");
    expect(names).toContain("IconsPreview");
  });

  test("each entry's name matches its registry key and carries a description", () => {
    for (const [key, fixture] of Object.entries(PREVIEW_FIXTURES)) {
      expect(fixture.name).toBe(key);
      expect(fixture.description.length).toBeGreaterThan(0);
      expect(typeof fixture.component).toBe("function");
    }
  });

  test("resolvePreviewFixture returns the real exported components by name", () => {
    expect(resolvePreviewFixture("HudThemePreview")?.component).toBe(HudThemePreview);
    expect(resolvePreviewFixture("BarsPreview")?.component).toBe(BarsPreview);
    expect(resolvePreviewFixture("IconsPreview")?.component).toBe(IconsPreview);
  });

  test("resolvePreviewFixture returns undefined for an unknown name", () => {
    expect(resolvePreviewFixture("NopePreview")).toBeUndefined();
    expect(resolvePreviewFixture("")).toBeUndefined();
  });
});
