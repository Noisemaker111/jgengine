import { createElement } from "react";

import type { GamePreviewComponent } from "./preview";
import { HudChromePreview } from "@jgengine/core/hud/hudChromePreview.view";
import { HudAutoLayoutPreview } from "@jgengine/core/hud/hudPanelLayoutPreview.view";
import { HudThemePreview } from "@jgengine/core/hud/hudThemePreview.view";
import { IconsPreview } from "@jgengine/core/ui/icons/iconsPreview.view";
import { KitFramesPreview } from "@jgengine/core/ui/kit/kitFramesPreview.view";
import { StreetGeometryPreview } from "@jgengine/core/roads/streetGeometryPreview.view";
import { SpriteClipPreview } from "@jgengine/core/render/spriteClipPreview.view";
import { TileLayerPreview } from "@jgengine/core/render/tileLayerPreview.view";
import { HudSkinPreview } from "@jgengine/core/hud/hudSkinPreview.view";
import { ScrollRailPreview } from "@jgengine/core/ui/scrollRailPreview.view";
import { UI_KITS, type UiKitName } from "@jgengine/core/ui/kit/uiKits.view";
import { UiKitMenuPreview, UiKitPreview, UiKitsPreview } from "@jgengine/core/ui/kit/uiKitsPreview.view";

/**
 * One entry in the engine preview-fixture registry: a deterministic, engine-level
 * preview component keyed by a stable id.
 */
export interface PreviewFixture {
  /** Stable id used on the `?fixture=` capture route and `bun run shoot --fixture <name>`. */
  readonly name: string;
  /** One-line description of what the deterministic fixture renders. */
  readonly description: string;
  /** The real exported preview component, rendered from static values (screenshots identically). */
  readonly component: GamePreviewComponent;
}

/**
 * Registry of deterministic, engine-level preview fixtures — the *real* exported
 * `@jgengine/react` components (`HudThemePreview`, `IconsPreview`, …) that render
 * identically every time from static values, so they can be screenshotted as regression evidence
 * without booting a game.
 *
 * The dev runner's fixtures route (`?fixture=<name>`) and `bun run shoot --fixture <name>` mount
 * these by name; `bun run shoot --list` (or `--fixture` with no name) prints the registered set.
 * Register any additional deterministic preview component here — the route and `shoot` pick it up
 * with no further wiring. Genre-agnostic: there is no hardcoded fixture set beyond what this record
 * declares.
 */
export const PREVIEW_FIXTURES: Record<string, PreviewFixture> = {
  HudAutoLayoutPreview: {
    name: "HudAutoLayoutPreview",
    description: "Five HUD panels crowding two top corners, placed without overlap at any screen size.",
    component: HudAutoLayoutPreview,
  },
  ScrollRailPreview: { name: "ScrollRailPreview", description: "Reachable caller-owned settings categories in shared scrolling chrome.", component: ScrollRailPreview },
  HudChromePreview: {
    name: "HudChromePreview",
    description: "Shared HUD chrome under the default root theme: frame, vitals, action bar, window, dialogs, buttons.",
    component: HudChromePreview,
  },
  HudThemePreview: {
    name: "HudThemePreview",
    description: "Every HudTheme genre preset × kit meters + a themed frame + a slot row.",
    component: HudThemePreview,
  },
  IconsPreview: {
    name: "IconsPreview",
    description: "IconTreatment school-gradient row plus a treated-icon hotbar with badges.",
    component: IconsPreview,
  },
  StreetGeometryPreview: {
    name: "StreetGeometryPreview",
    description: "Close-up welded road meshes for turns, unequal crossings, and five-way junctions.",
    component: StreetGeometryPreview,
  },
  SpriteClipPreview: {
    name: "SpriteClipPreview",
    description: "A procedurally drawn two-frame atlas driven by the core sprite clip player.",
    component: SpriteClipPreview,
  },
  TileLayerPreview: {
    name: "TileLayerPreview",
    description: "A procedural 3x3 atlas-backed tile layer preview.",
    component: TileLayerPreview,
  },
  HudSkinPreview: { name: "HudSkinPreview", description: "Two procedural HUD skins applied to frames and inventory slots.", component: HudSkinPreview },
  UiKitsPreview: { name: "UiKitsPreview", description: "Contact sheet: all eight built-in UI kits, every part each, over a game-like backdrop.", component: UiKitsPreview },
  KitFramesPreview: {
    name: "KitFramesPreview",
    description: "Game-UI blocks: every frame material and cut, game buttons with each cursor style, and drawn sliders.",
    component: KitFramesPreview,
  },
  ...kitFixtures(),
};

function kitFixtures(): Record<string, PreviewFixture> {
  const fixtures: Record<string, PreviewFixture> = {};
  for (const name of Object.keys(UI_KITS) as UiKitName[]) {
    const kit = UI_KITS[name];
    const id = `UiKit-${name}`;
    fixtures[id] = { name: id, description: `The ${kit.name} UI kit, large: every part, a dialog and a strip.`, component: ({ className }) => createElement(UiKitPreview, { kit, className }) };
    const menu = `UiKitMenu-${name}`;
    fixtures[menu] = { name: menu, description: `The ${kit.name} UI kit's pause menu hosting the engine settings pane.`, component: ({ className }) => createElement(UiKitMenuPreview, { kit, className }) };
    for (const pane of ["continue", "saves"] as const) {
      const id = `UiKitMenu-${name}-${pane}`;
      fixtures[id] = { name: id, description: `The ${kit.name} UI kit's pause menu hosting the engine ${pane} pane.`, component: ({ className }) => createElement(UiKitMenuPreview, { kit, pane, className }) };
    }
  }
  return fixtures;
}

/** Sorted list of registered fixture names, for discovery/listing. */
export function previewFixtureNames(): string[] {
  return Object.keys(PREVIEW_FIXTURES).sort();
}

/** Resolve a fixture by name, or `undefined` when it is not registered. */
export function resolvePreviewFixture(name: string): PreviewFixture | undefined {
  return PREVIEW_FIXTURES[name];
}
