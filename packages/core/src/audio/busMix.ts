import { busVolumeSettingId } from "@jgengine/core/settings/settingsModel";

export const MASTER_MUTE_SETTING_ID = "sound.muted";

export function busMuteSettingId(busId: string): string {
  return `${busVolumeSettingId(busId)}.muted`;
}
