import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { GameCursor } from "./gameCursor";
import { gameFontStacks } from "./gameFonts";
import { KitFramesPreview } from "./kitFramesPreview";
import { KIT_MATERIALS, kitCutPath, kitFrameVars, type KitCut, type KitMaterial } from "./kitFrame";
import { GameSlider, snapSliderValue } from "./gameSlider";
import { HudFade } from "./hudLayout";
import { KitButton, KitPanel } from "./uiKitRoot";

const CUTS: readonly KitCut[] = ["box", "chamfer", "notch", "slant", "tab", "banner", "shield", "ticket", "torn", "hex"];

describe("kitCutPath", () => {
  test("every cut but box is a polygon sized by depth", () => {
    for (const cut of CUTS) {
      const path = kitCutPath(cut, 10);
      if (cut === "box") expect(path).toBe("none");
      else {
        expect(path.startsWith("polygon(")).toBe(true);
        expect(path).not.toBe(kitCutPath(cut, 20));
      }
    }
  });

  test("the torn foot is the same every call, so a panel never re-tears", () => {
    expect(kitCutPath("torn", 12)).toBe(kitCutPath("torn", 12));
  });
});

describe("material KitPanel and KitButton", () => {
  test("a panel carries its material, cut and face, with no browser border or radius", () => {
    const html = renderToStaticMarkup(<KitPanel material="wood" cut="banner">Wave 4</KitPanel>);
    expect(html).toContain('data-jg-frame="wood"');
    expect(html).toContain('data-cut="banner"');
    expect(html).toContain("data-jg-frame-face");
    expect(html).toContain("Wave 4");
    expect(html).not.toContain("data-interactive");
    expect(html).not.toContain("border-radius");
  });

  test("a material button is a pressable game button with type=button", () => {
    const html = renderToStaticMarkup(
      <KitButton material="enamel" cut="hex" tint="#1f6feb">
        Open the park
      </KitButton>,
    );
    expect(html.startsWith("<button")).toBe(true);
    expect(html).toContain('type="button"');
    expect(html).toContain("data-interactive");
    expect(html).toContain("--jg-gf-base:#1f6feb");
  });

  test("every material has a base, ink, edge and a texture layer", () => {
    for (const [name, look] of Object.entries(KIT_MATERIALS) as [KitMaterial, (typeof KIT_MATERIALS)[KitMaterial]][]) {
      expect(look.base.length, name).toBeGreaterThan(0);
      expect(look.ink.length, name).toBeGreaterThan(0);
      expect(look.edge.length, name).toBeGreaterThan(0);
      expect(look.layers, name).toMatch(/url\(|gradient\(/);
    }
  });

  test("the rim is a clipped backing plate, never a filter, and can be turned off", () => {
    const rim = kitFrameVars({ material: "steel", cut: "chamfer", depth: 14, edge: "#fff", edgeWidth: 2 }) as Record<string, string>;
    expect(rim["--jg-gf-rim"]).toBe("#fff");
    expect(rim["--jg-gf-rim-w"]).toBe("2px");
    // The face's corners shrink by the rim's diagonal so a 45-degree rim stays as thick as a straight one.
    expect(rim["--jg-gf-face-cut"]).not.toBe(rim["--jg-gf-cut"]);
    expect(Object.keys(rim).some((key) => key.includes("filter"))).toBe(false);
    const bare = kitFrameVars({ material: "steel", edge: "none" }) as Record<string, string>;
    expect(bare["--jg-gf-rim"]).toBe("transparent");
    expect(bare["--jg-gf-rim-w"]).toBe("0px");
  });

  test("kitFrameVars installs the frame stylesheet once, so a hand-dressed element works with no material panel mounted", () => {
    const added: Array<{ id: string; textContent: string }> = [];
    const fake = {
      getElementById: (id: string) => added.find((node) => node.id === id) ?? null,
      createElement: () => ({ id: "", textContent: "" }),
      head: { appendChild: (node: { id: string; textContent: string }) => { added.push(node); } },
    };
    const saved = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = fake;
    try {
      kitFrameVars({ material: "brass", cut: "notch" });
      kitFrameVars({ material: "wood" });
    } finally {
      (globalThis as { document?: unknown }).document = saved;
    }
    expect(added.length).toBe(1);
    expect(added[0]!.id).toBe("jg-kit-frame-styles");
    expect(added[0]!.textContent).toContain("[data-jg-frame]");
  });

  test("a glow replaces the cast shadow, and shadow={false} drops it", () => {
    const lit = renderToStaticMarkup(<KitPanel material="steel" glow="#ffd23f">Charged</KitPanel>);
    expect(lit).toContain("data-glow");
    expect(lit).not.toContain("data-shadow");
    expect(renderToStaticMarkup(<KitPanel material="steel">Plain</KitPanel>)).toContain("data-shadow");
    expect(renderToStaticMarkup(<KitPanel material="steel" shadow={false}>Flat</KitPanel>)).not.toContain("data-shadow");
  });
});

describe("GameSlider", () => {
  test("snaps to its step and clamps without float noise", () => {
    expect(snapSliderValue(0.3049, 0, 1, 0.1)).toBe(0.3);
    expect(snapSliderValue(1.7, 0, 1, 0.1)).toBe(1);
    expect(snapSliderValue(-2, 0, 1, 0.1)).toBe(0);
    expect(snapSliderValue(37, 0, 100, 5)).toBe(35);
  });

  test("is a labelled role=slider, never a range input", () => {
    const html = renderToStaticMarkup(<GameSlider label="Volume" value={0.7} onChange={() => {}} valueText="70%" />);
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-label="Volume"');
    expect(html).toContain('aria-valuetext="70%"');
    expect(html).not.toContain("<input");
  });

  test("pips light up to the value", () => {
    const html = renderToStaticMarkup(<GameSlider label="Power" variant="pips" pips={10} value={0.4} onChange={() => {}} />);
    expect(html.match(/<i data-lit=""/g)?.length).toBe(4);
    expect(html.match(/<i/g)?.length).toBe(10);
  });
});

describe("gameFontStacks", () => {
  test("puts the game's faces first with installed fallbacks; numeric follows display", () => {
    const stacks = gameFontStacks({ display: { family: "Bangers", src: "/b.ttf" }, body: { family: "Barlow", src: "/w.ttf" } });
    expect(stacks.fontDisplay.startsWith('"Bangers", ')).toBe(true);
    expect(stacks.fontBody.startsWith('"Barlow", ')).toBe(true);
    expect(stacks.fontNumeric).toBe(stacks.fontDisplay);
    expect(stacks.fontBody).toContain("sans-serif");
  });
});

describe("HudFade and GameCursor", () => {
  test("a HUD group starts awake at full strength", () => {
    const html = renderToStaticMarkup(
      <HudFade watch={[100]}>
        <span>HP</span>
      </HudFade>,
    );
    expect(html).toContain('data-jg-hud-fade="awake"');
    expect(html).toContain("opacity:1");
  });

  test("the cursor renders hidden until it has a target", () => {
    const html = renderToStaticMarkup(<GameCursor variant="chevron" />);
    expect(html).toContain('data-jg-game-cursor="chevron"');
    expect(html).toContain('data-hidden=""');
  });
});

describe("KitFramesPreview", () => {
  test("the contact sheet shows every material and no browser range input", () => {
    const html = renderToStaticMarkup(<KitFramesPreview />);
    for (const material of Object.keys(KIT_MATERIALS)) expect(html).toContain(`data-jg-frame="${material}"`);
    expect(html.match(/role="slider"/g)?.length).toBe(2);
    expect(html).not.toContain('type="range"');
  });
});
