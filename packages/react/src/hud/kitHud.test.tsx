import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { HUD_CORNER_WIDTH, HudSlots } from "./hudLayout";
import { KitActionBar, KitCount, KitCounts, KitHint, KitVitals, KitWaveClock } from "./kitHud";
import { KitButton, KitPanel } from "../uiKitRoot";

describe("kitHud blocks", () => {
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

  test("the action bar marks each button by kind and wraps the prompt above it", () => {
    const html = renderToStaticMarkup(
      <KitActionBar
        kind="build"
        actions={[{ id: "wall", label: "Wall", detail: "5 wood", glyph: "1", onActivate: () => {} }]}
        progress={[{ id: "farm", label: "Farm", value: 0.5 }]}
        prompt={<span>E to open</span>}
      />,
    );
    expect(html).toContain('data-build="wall"');
    expect(html).toContain("5 wood");
    expect(html).toContain("E to open");
    expect(html).toContain('role="meter"');
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
});
