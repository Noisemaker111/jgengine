import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createI18n } from "../i18n/i18n";
import { LocaleRoot } from "../i18n/i18n.view";
import { localeDirection } from "../i18n/textDirection";
import { TextDirectionProvider, useTextDirection } from "../i18n/textDirection.view";
import { createSettingsStore } from "../settings/settingsModel";
import { SettingsProvider } from "../settings/settings.view";
import { HudSlots, hudSlotEdge, hudSlotPlacement, type HudSlot } from "./hudLayout.view";

const SLOTS: HudSlot[] = ["topLeft", "top", "topRight", "left", "right", "bottomLeft", "bottom", "bottomRight"];

function StartCorner() {
  const direction = useTextDirection();
  return <i data-start-corner={hudSlotPlacement("topLeft", direction).anchor} />;
}

describe("right-to-left HUD", () => {
  test("a right-to-left locale mirrors every slot, a left-to-right one keeps them", () => {
    for (const slot of SLOTS) expect(hudSlotEdge(slot, "ltr")).toBe(slot);
    expect(hudSlotEdge("topLeft", "rtl")).toBe("topRight");
    expect(hudSlotEdge("bottomRight", "rtl")).toBe("bottomLeft");
    expect(hudSlotEdge("left", "rtl")).toBe("right");
    expect(hudSlotEdge("top", "rtl")).toBe("top");
    for (const slot of SLOTS) expect(hudSlotEdge(hudSlotEdge(slot, "rtl"), "rtl")).toBe(slot);
    expect(localeDirection("ar")).toBe("rtl");
  });

  test("the start corner takes the right anchor and the same inset when the direction is rtl", () => {
    expect(hudSlotPlacement("topLeft", "ltr")).toEqual({ anchor: "top-left", inset: { x: 16, y: 16 } });
    expect(hudSlotPlacement("topLeft", "rtl")).toEqual({ anchor: "top-right", inset: { x: 16, y: 16 } });
    expect(hudSlotPlacement("bottomRight", "rtl").anchor).toBe("bottom-left");
    const hud = <HudSlots storageKey="rtl-test" showDuring={null} slots={{ topLeft: <span>vitals</span> }} />;
    for (const direction of ["ltr", "rtl"] as const) {
      expect(renderToStaticMarkup(<TextDirectionProvider direction={direction}>{hud}</TextDirectionProvider>)).toContain("data-hud-canvas");
    }
  });

  test("the locale root sets lang and dir from the player's locale setting", () => {
    const i18n = createI18n({ catalog: { en: {}, ar: {} }, locale: "en" });
    const store = createSettingsStore(null);
    store.set("language.locale", "ar");
    const html = renderToStaticMarkup(
      <SettingsProvider store={store}>
        <LocaleRoot i18n={i18n}>
          <StartCorner />
        </LocaleRoot>
      </SettingsProvider>,
    );
    expect(html).toContain('lang="ar"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('data-start-corner="top-right"');
  });
});
