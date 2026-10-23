/**
 * The game's own settings rows, reduced to what a harness can name and check.
 *
 * `bun run perf --set <id>` writes a settings-storage value before the game boots, and an id the
 * game never declared would sit unused and measure as free. Only the game knows its ids, so the
 * runner publishes them on `documentElement.dataset.jgSettings` (beside `jgViews`) and the harness
 * reads that declaration instead of keeping a second list.
 */
import type { GameSettingsConfig } from "@jgengine/core/settings/settingsModel";

/** One declared setting: its id, the kind of value it takes, and the bounds or options it offers. */
export interface DeclaredSetting {
  id: string;
  kind: string;
  options?: string[];
  min?: number;
  max?: number;
  default?: string | number | boolean;
}

export function describeDeclaredSettings(settings: GameSettingsConfig | false | undefined): DeclaredSetting[] {
  if (settings === false || settings === undefined) return [];
  return (settings.extra ?? []).map((def) => ({
    id: def.id,
    kind: def.kind,
    ...(def.options === undefined ? {} : { options: def.options.map((option) => option.value) }),
    ...(def.min === undefined ? {} : { min: def.min }),
    ...(def.max === undefined ? {} : { max: def.max }),
    default: def.default,
  }));
}
