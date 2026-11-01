import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { HUD_CORNER_WIDTH, HudSlots } from "./hudLayout.view";
import { KitCount, KitCounts, KitHint, KitVitalIcons, KitVitals, KitWaveClock } from "./kitHud.view";
import { KitButton, KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";

describe("kitHud blocks", () => {
  test("vital icons fill each glyph from the bottom and print numbers only on request", () => {
    const vitals = [
      { id: "health", label: "Health", icon: "/icons/heart.svg", value: 25, max: 100 },
      { id: "food", label: "Food", icon: "/icons/meat.svg", value: 80, max: 100, warn: true },
      { id: "heat", label: "Temperature", icon: "/icons/thermometer.svg", value: 0.6, max: 1, text: "24°C" },
    ];
    const quiet = renderToStaticMarkup(<KitVitalIcons vitals={vitals} />);
    expect(quiet).toContain('data-vital="health"');
    expect(quiet).toContain('aria-valuenow="25"');
    expect(quiet).toContain("inset(75% 0 0 0)");
    expect(quiet).not.toContain("25 / 100");
    expect(quiet.match(/data-low=""/g)?.length).toBe(1);
    const loud = renderToStaticMarkup(<KitVitalIcons vitals={vitals} readout />);
    expect(loud).toContain("25 / 100");
    expect(loud).toContain("24°C");
  });

  test("a count marks itself and shows its rate", () => {
    const html = renderToStaticMarkup(
      <KitCounts>
        <KitCount value={12} label="Wood" detail="+3/min" />
      </KitCounts>,
    );
    expect(html).toContain('data-count="Wood"');
    expect(html).toContain("12");
    expect(html).toContain("+3/min");
  });

  test("vitals draw a meter per vital and the labeled objective", () => {
    const html = renderToStaticMarkup(
      <KitVitals
        title="Hold the Line"
        vitals={[
          { label: "You", value: 20, max: 100, lowAt: 0.35 },
          { label: "Base", value: 90, max: 100, tone: "accent" },
        ]}
        objective={{ label: "Mara", title: "Build a wall", goal: "Press 1" }}
      />,
    );
    expect(html).toContain("data-kit-vitals");
    expect(html).toContain(`width:${HUD_CORNER_WIDTH}px`);
    expect(html.match(/role="meter"/g)?.length).toBe(2);
    expect(html).toContain("Mara");
    expect(html).toContain("Press 1");
  });

  test("the wave clock and hint strips render their text", () => {
    expect(renderToStaticMarkup(<KitWaveClock text="Night 2 in 30s" detail="N - call it early" alarm />)).toContain("data-wave-clock");
    expect(renderToStaticMarkup(<KitHint text="Placing a Farm" />)).toContain("Placing a Farm");
    expect(renderToStaticMarkup(<KitHint text={null} />)).not.toContain("Placing");
  });
});

describe("material kit parts", () => {
  test("a material panel and button draw the frame face", () => {
    const panel = renderToStaticMarkup(<KitPanel material="steel" cut="chamfer">Hull</KitPanel>);
    expect(panel).toContain("data-jg-frame");
    expect(panel).toContain('data-cut="chamfer"');
    const button = renderToStaticMarkup(<KitButton material="brass">Go</KitButton>);
    expect(button.startsWith("<button")).toBe(true);
    expect(button).toContain("data-jg-frame-face");
  });
});

describe("HudSlots", () => {
  test("draws a HUD canvas without a game around it", () => {
    const html = renderToStaticMarkup(<HudSlots storageKey="test" slots={{ topLeft: <span>corner</span> }} showDuring={undefined} />);
    expect(html).toContain("data-hud-canvas");
  });

  test("several panels share a slot, and the canvas takes the game's class in every phase", () => {
    const html = renderToStaticMarkup(
      <HudSlots
        storageKey="test"
        showDuring={null}
        className="my-hud"
        panels={{ topRight: [{ id: "keys", content: <span>keys</span>, order: -1 }, { id: "cash", content: <span>cash</span>, interactive: false }] }}
      />,
    );
    expect(html).toContain("data-hud-canvas");
    expect(html).toContain("my-hud");
  });
});
