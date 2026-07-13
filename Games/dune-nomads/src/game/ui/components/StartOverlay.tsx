import { SettingsTrigger } from "@jgengine/react";

import { HudPanel } from "@/components/ui/hud-panel";
import { KeybindBadge } from "@/components/ui/keybind-badge";
import { TitleScreen } from "@/components/ui/title-screen";

import { RIVAL_PERSONALITY } from "../../run/deps";
import { START_SCREEN_PROVERBS } from "../../proverbs";

const CONTROLS: readonly [string, string][] = [
  ["W / S", "Urge the caravan faster / ease off"],
  ["A / D", "Steer"],
  ["E", "Dock at an oasis"],
  ["M", "Expand the sand chart"],
  ["R", "Restart"],
];

export function StartOverlay({ onStart }: { onStart: () => void }) {
  return (
    <div data-jg-menu className="contents">
      <TitleScreen
        title="Dune Nomads"
        subtitle="A caravan crossing to Meridaan"
        entries={[{ id: "begin", label: "Begin the Crossing", keybind: "Enter" }]}
        selectedId="begin"
        onActivate={onStart}
      />
      <div className="pointer-events-auto absolute right-4 top-4">
        <SettingsTrigger className="flex h-9 w-9 items-center justify-center border border-[var(--jg-edge)] bg-[var(--jg-surface)] text-[var(--jg-accent)] transition-colors hover:bg-[var(--jg-surface-deep)]" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center">
        <div className="pointer-events-auto">
          <HudPanel title="The Rules of the Sand" width={420}>
            <div className="flex flex-col gap-2.5">
              <p className="m-0 text-[12px] italic" style={{ color: "var(--jg-text-dim)" }}>
                “{START_SCREEN_PROVERBS[0]}” Ride the lee ridges, drink deep at the oases, and beat the{" "}
                {RIVAL_PERSONALITY.label} caravan to Meridaan before your skins run dry.
              </p>
              <div className="flex flex-col gap-1.5">
                {CONTROLS.map(([key, label]) => (
                  <div key={key} className="flex items-center gap-2.5">
                    <KeybindBadge label={key} size="sm" />
                    <span className="text-[11px]" style={{ color: "var(--jg-text)" }}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </HudPanel>
        </div>
      </div>
    </div>
  );
}
