import { describe, expect, test } from "bun:test";

import { localeDirection } from "./textDirection";

describe("localeDirection", () => {
  test("Arabic, Hebrew, Persian and Urdu run right to left", () => {
    for (const tag of ["ar", "ar-EG", "he", "he-IL", "fa", "ur", "ur-PK"]) expect(localeDirection(tag)).toBe("rtl");
  });

  test("other languages and unparseable tags run left to right", () => {
    for (const tag of ["en", "ja", "pl", "zh-Hans", "x", "not a tag!"]) expect(localeDirection(tag)).toBe("ltr");
  });

  test("a script subtag decides", () => {
    expect(localeDirection("az-Arab")).toBe("rtl");
    expect(localeDirection("ar-Latn")).toBe("ltr");
  });
});
