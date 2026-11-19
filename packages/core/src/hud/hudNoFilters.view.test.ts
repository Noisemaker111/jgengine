import { describe, expect, test } from "bun:test";
import { createElement } from "@jgengine/core/ui/jsx";
import { renderToStaticMarkup } from "@jgengine/core/ui/jsx/markup";

import { createPromptRegistry } from "@jgengine/core/interaction/promptRegistry";
import { keybind, proximityPrompt } from "@jgengine/core/interaction/proximityPrompt";

import { InteractionPrompt } from "@jgengine/core/interaction/interactionPrompt.view";
import { WaypointMarkers } from "@jgengine/core/map/waypointMarkers.view";

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
