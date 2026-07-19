import type { GamePreviewComponent } from "./preview";
import { BarsPreview } from "./barsPreview";
import { HudThemePreview } from "./hudThemePreview";
import { IconsPreview } from "./iconsPreview";

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
 * `@jgengine/react` components (`HudThemePreview`, `BarsPreview`, `IconsPreview`, …) that render
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
  HudThemePreview: {
    name: "HudThemePreview",
    description: "Every HudTheme genre preset × atomic bars + a themed frame + a slot row.",
    component: HudThemePreview,
  },
  BarsPreview: {
    name: "BarsPreview",
    description: "Every atomic vitals bar rendered twice under different BarTokens blocks.",
    component: BarsPreview,
  },
  IconsPreview: {
    name: "IconsPreview",
    description: "IconTreatment school-gradient row plus a treated-icon hotbar with badges.",
    component: IconsPreview,
  },
};

/** Sorted list of registered fixture names, for discovery/listing. */
export function previewFixtureNames(): string[] {
  return Object.keys(PREVIEW_FIXTURES).sort();
}

/** Resolve a fixture by name, or `undefined` when it is not registered. */
export function resolvePreviewFixture(name: string): PreviewFixture | undefined {
  return PREVIEW_FIXTURES[name];
}
