import { busVolumeSettingId } from "@jgengine/core/settings/settingsModel";

/** Persisted mute for the whole mix, next to `sound.master`. */
export const MASTER_MUTE_SETTING_ID = "sound.muted";

/** Persisted mute for one bus, next to its `busVolumeSettingId(busId)` volume. */
export function busMuteSettingId(busId: string): string {
  return `${busVolumeSettingId(busId)}.muted`;
}
