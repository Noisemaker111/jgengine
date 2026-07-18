import { describe, expect, test } from "bun:test";

import {
  escapePathSegment,
  formatColor,
  joinTunablePath,
  normalizeColorValue,
  parseColor,
  splitTunablePath,
  unescapePathSegment,
  vecLength,
} from "./tunableSchema";

describe("parseColor", () => {
  test("expands #rgb shorthand into a lowercase 6-digit rgb", () => {
    expect(parseColor("#abc")).toEqual({
      hex: "#aabbcc",
      rgb: "#aabbcc",
      alpha: 1,
      hasAlpha: false,
    });
  });

  test("lowercases a 6-digit color and reports no alpha", () => {
    expect(parseColor("#AABBCC")).toEqual({
      hex: "#aabbcc",
      rgb: "#aabbcc",
      alpha: 1,
      hasAlpha: false,
    });
  });

  test("parses an 8-digit color into rgb plus an alpha channel", () => {
    const parsed = parseColor("#aabbccdd");
    expect(parsed).not.toBeNull();
    expect(parsed!.rgb).toBe("#aabbcc");
    expect(parsed!.hex).toBe("#aabbccdd");
    expect(parsed!.hasAlpha).toBe(true);
    expect(parsed!.alpha).toBeCloseTo(221 / 255, 10);
  });

  test("treats fully opaque 8-digit alpha as alpha 1", () => {
    const parsed = parseColor("#ff0000ff");
    expect(parsed).not.toBeNull();
    expect(parsed!.rgb).toBe("#ff0000");
    expect(parsed!.hex).toBe("#ff0000ff");
    expect(parsed!.hasAlpha).toBe(true);
    expect(parsed!.alpha).toBe(1);
  });

  test("returns null for non-string and malformed input", () => {
    expect(parseColor("red")).toBeNull();
    expect(parseColor("#ggg")).toBeNull();
    expect(parseColor("#12345")).toBeNull();
    expect(parseColor("aabbcc")).toBeNull();
    expect(parseColor(123)).toBeNull();
    expect(parseColor(null)).toBeNull();
    expect(parseColor(undefined)).toBeNull();
  });
});

describe("formatColor", () => {
  test("returns the bare rgb hex when alpha is not requested", () => {
    expect(formatColor("#aabbcc", 1, false)).toBe("#aabbcc");
  });

  test("appends an ff alpha byte for fully opaque colors", () => {
    expect(formatColor("#aabbcc", 1, true)).toBe("#aabbccff");
  });

  test("rounds fractional alpha to the nearest byte", () => {
    // Math.round(0.5 * 255) === 128 === 0x80
    expect(formatColor("#aabbcc", 0.5, true)).toBe("#aabbcc80");
    expect(formatColor("#aabbcc", 0, true)).toBe("#aabbcc00");
  });

  test("clamps out-of-range alpha before encoding", () => {
    expect(formatColor("#aabbcc", 2, true)).toBe("#aabbccff");
    expect(formatColor("#aabbcc", -1, true)).toBe("#aabbcc00");
  });

  test("strips an incoming alpha channel and applies the supplied alpha", () => {
    expect(formatColor("#aabbccdd", 1, true)).toBe("#aabbccff");
    expect(formatColor("#aabbccdd", 1, false)).toBe("#aabbcc");
  });

  test("returns null when the rgb input is not a valid color", () => {
    expect(formatColor("notacolor", 1, false)).toBeNull();
    expect(formatColor("#12", 1, true)).toBeNull();
  });
});

describe("normalizeColorValue", () => {
  test("returns the plain rgb for an opaque color with no forced alpha", () => {
    expect(normalizeColorValue("#abc")).toBe("#aabbcc");
    expect(normalizeColorValue("#AABBCC")).toBe("#aabbcc");
  });

  test("preserves an existing alpha channel", () => {
    expect(normalizeColorValue("#aabbccdd")).toBe("#aabbccdd");
  });

  test("keeps the alpha channel even when forceAlpha is false", () => {
    expect(normalizeColorValue("#aabbccdd", false)).toBe("#aabbccdd");
  });

  test("forces an alpha channel onto an opaque color when requested", () => {
    expect(normalizeColorValue("#aabbcc", true)).toBe("#aabbccff");
    expect(normalizeColorValue("#abc", true)).toBe("#aabbccff");
  });

  test("returns null for invalid color input", () => {
    expect(normalizeColorValue("nope")).toBeNull();
    expect(normalizeColorValue(42)).toBeNull();
    expect(normalizeColorValue(null, true)).toBeNull();
  });
});

describe("color parse <-> format round-trips", () => {
  test("opaque colors round-trip through parse and format", () => {
    for (const input of ["#abc", "#AABBCC", "#123456", "#ff8800"]) {
      const parsed = parseColor(input);
      expect(parsed).not.toBeNull();
      expect(formatColor(parsed!.rgb, parsed!.alpha, false)).toBe(parsed!.rgb);
    }
  });

  test("alpha colors round-trip back to the same 8-digit hex", () => {
    for (const input of ["#aabbccdd", "#ff0000ff", "#00000000", "#12345680"]) {
      const parsed = parseColor(input);
      expect(parsed).not.toBeNull();
      expect(formatColor(parsed!.rgb, parsed!.alpha, true)).toBe(parsed!.hex);
    }
  });
});

describe("escapePathSegment <-> unescapePathSegment", () => {
  test("escapes backslashes and dots", () => {
    expect(escapePathSegment("a.b")).toBe("a\\.b");
    expect(escapePathSegment("a\\b")).toBe("a\\\\b");
  });

  test("unescape reverses escape (identity round-trip)", () => {
    for (const segment of ["plain", "a.b", "a\\b", "a\\.b", ".", "\\", "a.b.c", "..\\.."]) {
      expect(unescapePathSegment(escapePathSegment(segment))).toBe(segment);
    }
  });

  test("a segment with no special characters is untouched", () => {
    expect(escapePathSegment("hello")).toBe("hello");
    expect(unescapePathSegment("hello")).toBe("hello");
  });
});

describe("joinTunablePath <-> splitTunablePath", () => {
  test("join omits the separator when the parent is empty", () => {
    expect(joinTunablePath("", "root")).toBe("root");
    expect(joinTunablePath("parent", "child")).toBe("parent.child");
  });

  test("join escapes dots in the segment so split recovers them", () => {
    const path = joinTunablePath("parent", "a.b");
    expect(path).toBe("parent.a\\.b");
    expect(splitTunablePath(path)).toEqual(["parent", "a.b"]);
  });

  test("folding join over segments splits back to the originals", () => {
    const cases: string[][] = [
      ["a", "b", "c"],
      ["a", "b.c", "d"],
      ["a\\b", "c"],
      ["with.dot", "with\\slash", "plain"],
      ["one"],
    ];
    for (const segments of cases) {
      const path = segments.reduce((acc, seg) => joinTunablePath(acc, seg), "");
      expect(splitTunablePath(path)).toEqual(segments);
    }
  });

  test("split of a single unescaped segment returns it verbatim", () => {
    expect(splitTunablePath("solo")).toEqual(["solo"]);
  });
});

describe("vecLength", () => {
  test("maps each vector kind to its component count", () => {
    expect(vecLength("vec2")).toBe(2);
    expect(vecLength("vec3")).toBe(3);
    expect(vecLength("vec4")).toBe(4);
  });
});
