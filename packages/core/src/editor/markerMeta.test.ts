import { describe, expect, test } from "bun:test";

import { metaNumber, metaText, requireMetaText } from "./markerMeta";

const home = { id: "home", meta: { grid: 14, cell: "2", label: "Camp", junk: "wide", flag: true } };

describe("marker meta", () => {
  test("numbers read as numbers, a numeric text too, and a missing key gives the fallback", () => {
    expect(metaNumber(home, "grid", 30)).toBe(14);
    expect(metaNumber(home, "cell", 1)).toBe(2);
    expect(metaNumber(home, "missing", 30)).toBe(30);
    expect(metaNumber({ id: "bare" }, "grid", 30)).toBe(30);
  });

  test("a value that is not a number fails, naming the object and key", () => {
    expect(() => metaNumber(home, "junk", 30)).toThrow('home: meta.junk must be a number, not "wide"');
    expect(() => metaNumber(home, "flag", 30)).toThrow("home: meta.flag must be a number, not true");
  });

  test("text reads as text, is undefined when missing, and fails on anything else", () => {
    expect(metaText(home, "label")).toBe("Camp");
    expect(metaText(home, "missing")).toBeUndefined();
    expect(() => metaText(home, "grid")).toThrow("home: meta.grid must be text, not 14");
    expect(requireMetaText(home, "label")).toBe("Camp");
    expect(() => requireMetaText(home, "missing")).toThrow("home: meta.missing must be text");
  });
});
