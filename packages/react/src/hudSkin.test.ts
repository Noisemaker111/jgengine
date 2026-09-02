import { describe, expect, test } from "bun:test";
import { hudSkinVars } from "./hudSkin";

describe("hudSkinVars", () => {
  test("emits material, bar, font, and cursor variables", () => {
    const vars = hudSkinVars({ frame: { image: "frame.png", slice: [1, 2, 3, 4], scale: 2, fill: true }, bar: { fill: "red", track: "black" }, cursor: "cursor.png" }) as Record<string, string>;
    expect(vars["--jg-frame-image"]).toBe("url(frame.png)");
    expect(vars["--jg-frame-slice"]).toBe("1 2 3 4");
    expect(vars["--jg-frame-fill"]).toBe("fill");
    expect(vars["--jg-bar-skin-fill"]).toBe("red");
    expect(vars["--jg-skin-cursor"]).toBe("url(cursor.png), auto");
  });
});
