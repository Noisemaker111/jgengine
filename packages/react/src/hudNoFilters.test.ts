import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createPromptRegistry } from "@jgengine/core/interaction/promptRegistry";
import { keybind, proximityPrompt } from "@jgengine/core/interaction/proximityPrompt";

import { InteractionPrompt } from "./interactionPrompt";
import { WaypointMarkers } from "./waypointMarkers";

/**
 * Over a live 3D canvas, an element with a CSS `filter` or `backdrop-filter` is re-rendered every
 * frame. A HUD built from twenty drop-shadow frames took a game from 57 fps to 5, and six took another
 * from 60 to 32. The kits, the game-UI blocks and the engine's HUD primitives draw rims, shadows and
 * glows as plates and overlays instead; this guard keeps it that way.
 */
const SRC = import.meta.dir;

const KIT_FILES = readdirSync(SRC).filter((name) => /^uiKit[A-Z]\w*\.tsx$/.test(name) && !/Preview|\.test\./.test(name));

/** Kits, game-UI blocks and HUD primitives: no `filter` (other than `none`) and no `backdrop-filter`. */
const NO_FILTER = [
  ...KIT_FILES,
  "uiKit.ts",
  "kitFrame.tsx",
  "gameCursor.tsx",
  "gameSlider.tsx",
  "hudLayout.tsx",
  "gameMenu.tsx",
  "gameMenuSaves.tsx",
  "actionHud.tsx",
  "selectionHud.tsx",
  "notices.tsx",
  "hudFrame.tsx",
  "interactionPrompt.tsx",
  "map.tsx",
  "menuScreen.tsx",
  "waypointMarkers.tsx",
];

/** The engine stylesheet keeps a hover brighten on HUD buttons, but never a backdrop blur. */
const NO_BACKDROP = ["engineStyles.ts", "styles.css"];

// A property assignment, CSS (`filter: drop-shadow(…)`) or a style object (`filter: "blur(2px)"`); `none` resets are fine.
const FILTER = /(?<![\w-])filter\s*:(?!\s*["'`]?none\b)/g;
const BACKDROP = /(?:backdrop-filter|[bB]ackdropFilter)\s*:/g;

function offenders(file: string, pattern: RegExp): string[] {
  const text = readFileSync(join(SRC, file), "utf8");
  return text
    .split("\n")
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => {
      pattern.lastIndex = 0;
      return pattern.test(line);
    })
    .map(({ line, index }) => `${file}:${index + 1}: ${line.trim().slice(0, 120)}`);
}

describe("HUD elements never use CSS filters", () => {
  test("the scan covers every built-in kit", () => {
    expect(KIT_FILES.length).toBeGreaterThanOrEqual(9);
  });

  test("kits, game-UI blocks and HUD primitives use no filter or backdrop-filter", () => {
    const found = NO_FILTER.flatMap((file) => [...offenders(file, FILTER), ...offenders(file, BACKDROP)]);
    expect(found).toEqual([]);
  });

  test("the engine stylesheet has no backdrop blur", () => {
    expect(NO_BACKDROP.flatMap((file) => offenders(file, BACKDROP))).toEqual([]);
  });

  test("the guard catches both CSS and style-object forms", () => {
    const hits = (text: string, pattern: RegExp) => {
      pattern.lastIndex = 0;
      return pattern.test(text);
    };
    expect(hits(".x { filter: drop-shadow(0 2px 0 #000); }", FILTER)).toBe(true);
    expect(hits('  filter: "blur(2px)",', FILTER)).toBe(true);
    expect(hits(".x { filter: none; }", FILTER)).toBe(false);
    expect(hits("attributeFilter: [\"aria-current\"]", FILTER)).toBe(false);
    expect(hits("<filter id='n'>", FILTER)).toBe(false);
    expect(hits('  backdropFilter: "blur(6px)",', BACKDROP)).toBe(true);
    expect(hits("-webkit-backdrop-filter: blur(3px);", BACKDROP)).toBe(true);
  });
});

describe("HUD overlays render without filters", () => {
  test("the interaction prompt has no backdrop blur", () => {
    const registry = createPromptRegistry();
    registry.register({ id: "chest", position: { x: 0, z: 0 }, prompt: proximityPrompt({ radius: 3, display: keybind("open", "Open") }) });
    registry.resolve({ x: 0, z: 1 });
    const html = renderToStaticMarkup(createElement(InteractionPrompt, { registry }));
    expect(html).toContain('data-interaction-prompt="chest"');
    expect(html).not.toContain("filter");
  });

  test("waypoint pins and edge arrows have no glow filter", () => {
    const html = renderToStaticMarkup(
      createElement(WaypointMarkers, {
        entries: [
          { id: "camp", position: [0, 0, 0], kind: "objective", label: "Camp" },
          { id: "cache", position: [9, 0, 0], kind: "loot" },
        ],
        project: (position) => (position[0] === 0 ? { x: 400, y: 300 } : { x: 2400, y: 300 }),
        viewport: { width: 800, height: 600 },
      }),
    );
    expect(html).toContain("Camp");
    expect(html).toContain("rotate(");
    expect(html).not.toContain("filter");
  });
});
