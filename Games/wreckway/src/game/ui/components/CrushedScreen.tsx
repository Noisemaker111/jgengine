import { formatDuration } from "@jgengine/core/format/duration";
import { actionLabel } from "@jgengine/core/input/actionBindings";
import { DeathScreenView } from "@/components/ui/death-screen-view";

import { keybinds } from "../../keybinds";
import { PART_SLOTS } from "../../parts/catalog";
import type { SessionSnapshot } from "../../run/session";
import { PartIcon } from "./PartIcon";

interface CrushedScreenProps {
  snapshot: SessionSnapshot;
  onRestart: () => void;
}

/**
 * Defeat overlay — shipped `DeathScreenView` + wreckway's part strip (game content).
 */
export function CrushedScreen({ snapshot, onRestart }: CrushedScreenProps) {
  const outcome = snapshot.outcome;
  if (outcome === null) return null;
  const subtitle = `Caught in ${outcome.zoneLabel.toLowerCase()} after ${formatDuration(outcome.time, { decimals: 1 })}. Build: ${outcome.partsOnExit}/4 slots.`;
  return (
    <>
      <DeathScreenView
        title="CRUSHED"
        subtitle={subtitle}
        respawnLabel="RESTART"
        respawnKeybind={actionLabel(keybinds, "restart") ?? "R"}
        onRespawn={onRestart}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-[22%] z-10 flex justify-center gap-2">
        {PART_SLOTS.map((slot) => (
          <div
            key={slot}
            className="flex h-11 w-11 items-center justify-center rounded border border-[var(--jg-edge-bright)] bg-[var(--jg-surface)]"
          >
            <PartIcon partId={snapshot.installed[slot]?.id ?? null} className="h-8 w-8" />
          </div>
        ))}
      </div>
    </>
  );
}
