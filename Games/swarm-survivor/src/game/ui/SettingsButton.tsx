import { SettingsTrigger } from "@jgengine/react";

export function SettingsButton() {
  return (
    <SettingsTrigger className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md border border-[var(--jg-edge-bright)] bg-[var(--jg-surface)]/85 text-[var(--jg-accent)] backdrop-blur transition-colors hover:bg-[var(--jg-edge)]" />
  );
}
