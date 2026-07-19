import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PhotoModeControls } from "./photoMode";
import { createPhotoModeStore } from "@jgengine/core/ui/photoMode";

describe("PhotoModeControls", () => {
  test("renders hide-HUD/exit and the capture button when onCapture is given", () => {
    const store = createPhotoModeStore({ active: true, hideHud: true });
    const html = renderToStaticMarkup(createElement(PhotoModeControls, { store, onCapture: () => {} }));
    expect(html).toContain("data-photo-mode-controls");
    expect(html).toContain("data-photo-hide-hud");
    expect(html).toContain("data-photo-capture");
    expect(html).toContain("data-photo-exit");
    expect(html).toContain("HUD hidden");
  });

  test("reflects hideHud=false and omits capture without onCapture", () => {
    const store = createPhotoModeStore({ active: true, hideHud: false });
    const html = renderToStaticMarkup(createElement(PhotoModeControls, { store }));
    expect(html).toContain("HUD shown");
    expect(html).not.toContain("data-photo-capture");
  });
});
