import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createMarkerSet } from "@jgengine/core/world/markers";
import { resolveActionCollection } from "@jgengine/core/ui/actionModel";

import { ActionBar, ActionButton } from "./actionHud";
import { Minimap } from "./map";

/**
 * #1034 acceptance: one HudTheme drives bars + frames + action slots + minimap ring. The bars/frames
 * are covered elsewhere; this proves the action slots and the minimap ring read the theme tokens
 * (with the built-in look as the fallback, so a bare game is unchanged).
 */

describe("ActionButton / ActionBar read the theme tokens", () => {
  const [resolved] = resolveActionCollection([{ id: "a", label: "Cast", hotkey: "Q" }]);

  test("the action slot reads --jg-slot-* with fallbacks", () => {
    const html = renderToStaticMarkup(createElement(ActionButton, { action: resolved! }));
    expect(html).toContain("var(--jg-slot-bg");
    expect(html).toContain("var(--jg-slot-border");
    expect(html).toContain("var(--jg-slot-radius");
  });

  test("the action bar panel reads --jg-frame-*", () => {
    const html = renderToStaticMarkup(createElement(ActionBar, { defs: [{ id: "a", hotkey: "Q" }] }));
    expect(html).toContain("var(--jg-frame-bg");
    expect(html).toContain("var(--jg-frame-border");
  });
});

describe("Minimap ring reads the theme token", () => {
  test("the ring border reads --jg-ring with a fallback", () => {
    const html = renderToStaticMarkup(
      createElement(Minimap, { markers: createMarkerSet(() => 0), center: [0, 0], worldRadius: 100 }),
    );
    expect(html).toContain("var(--jg-ring");
  });
});
