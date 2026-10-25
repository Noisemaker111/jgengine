import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { GameCursor } from "./gameCursor";
import { gameFontStacks } from "./gameFonts";
import { GameFramesPreview } from "./gameFramesPreview";
import { GAME_MATERIALS, GameFrame, gameCutPath, gameFrameVars, type GameCut, type GameMaterial } from "./gameFrame";
import { GameSlider, snapSliderValue } from "./gameSlider";
import { HudFade } from "./hudFade";

const CUTS: readonly GameCut[] = ["box", "chamfer", "notch", "slant", "tab", "banner", "shield", "ticket", "torn", "hex"];

describe("gameCutPath", () => {
  test("every cut but box is a polygon sized by depth", () => {
    for (const cut of CUTS) {
      const path = gameCutPath(cut, 10);
      if (cut === "box") expect(path).toBe("none");
      else {
        expect(path.startsWith("polygon(")).toBe(true);
        expect(path).not.toBe(gameCutPath(cut, 20));
      }
    }
  });

  test("the torn foot is the same every call, so a panel never re-tears", () => {
    expect(gameCutPath("torn", 12)).toBe(gameCutPath("torn", 12));
  });
});

describe("GameFrame", () => {
  test("a panel carries its material, cut and face, with no browser border or radius", () => {
    const html = renderToStaticMarkup(<GameFrame material="wood" cut="banner">Wave 4</GameFrame>);
    expect(html).toContain('data-jg-frame="wood"');
    expect(html).toContain('data-cut="banner"');
    expect(html).toContain("data-jg-frame-face");
    expect(html).toContain("Wave 4");
    expect(html).not.toContain("data-interactive");
    expect(html).not.toContain("border-radius");
  });

  test("as a button it is a pressable game button with type=button", () => {
    const html = renderToStaticMarkup(
      <GameFrame as="button" material="enamel" cut="hex" tint="#1f6feb">
        Open the park
      </GameFrame>,
    );
    expect(html.startsWith("<button")).toBe(true);
    expect(html).toContain('type="button"');
    expect(html).toContain("data-interactive");
    expect(html).toContain("--jg-gf-base:#1f6feb");
  });

  test("every material has a base, ink, edge and a texture layer", () => {
    for (const [name, look] of Object.entries(GAME_MATERIALS) as [GameMaterial, (typeof GAME_MATERIALS)[GameMaterial]][]) {
      expect(look.base.length, name).toBeGreaterThan(0);
      expect(look.ink.length, name).toBeGreaterThan(0);
      expect(look.edge.length, name).toBeGreaterThan(0);
      expect(look.layers, name).toMatch(/url\(|gradient\(/);
    }
  });

  test("the rim is drawn as drop shadows and can be turned off", () => {
    const rim = gameFrameVars({ material: "steel", edge: "#fff", edgeWidth: 2, shadow: false }) as Record<string, string>;
    expect(rim["--jg-gf-filter"]!.match(/drop-shadow/g)?.length).toBe(8);
    const bare = gameFrameVars({ material: "steel", edge: "none", shadow: false }) as Record<string, string>;
    expect(bare["--jg-gf-filter"]).toBe("none");
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

describe("GameFramesPreview", () => {
  test("the contact sheet shows every material and no browser range input", () => {
    const html = renderToStaticMarkup(<GameFramesPreview />);
    for (const material of Object.keys(GAME_MATERIALS)) expect(html).toContain(`data-jg-frame="${material}"`);
    expect(html.match(/role="slider"/g)?.length).toBe(2);
    expect(html).not.toContain('type="range"');
  });
});
