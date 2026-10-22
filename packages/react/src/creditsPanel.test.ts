import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { CreditsDocument } from "@jgengine/core/game/credits";
import { CreditsPanel } from "./creditsPanel";

const DOCUMENT: CreditsDocument = {
  title: "Credits",
  sections: [
    { heading: "Engine", entries: [{ label: "JGengine", detail: "menus, saves" }] },
    { heading: "Art", entries: [{ label: "KayKit", href: "https://kaylousberg.itch.io" }] },
  ],
  notice: "Ships with the demo.",
};

describe("CreditsPanel", () => {
  test("renders the credits sections, the notice and a focusable back affordance", () => {
    const html = renderToStaticMarkup(createElement(CreditsPanel, { document: DOCUMENT, onBack: () => undefined }));
    expect(html).toContain('data-credits-panel=""');
    expect(html).toContain('data-credits-scroll=""');
    expect(html).toContain("JGengine");
    expect(html).toContain("menus, saves");
    expect(html).toContain("KayKit");
    expect(html).toContain("https://kaylousberg.itch.io");
    expect(html).toContain("Ships with the demo.");
    expect(html).toContain('data-jg-menu-item="back"');
    expect(html).toContain("Back");
    expect(html).toContain("Esc back");
  });

  test("closed renders nothing", () => {
    const html = renderToStaticMarkup(createElement(CreditsPanel, { document: DOCUMENT, onBack: () => undefined, open: false }));
    expect(html).toBe("");
  });
});
