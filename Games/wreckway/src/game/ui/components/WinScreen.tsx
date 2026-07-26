import { formatDistance } from "@jgengine/core/format/distance";
import { formatDuration } from "@jgengine/core/format/duration";
import { actionLabel } from "@jgengine/core/input/actionBindings";
import { ResultsScreen } from "@/components/ui/results-screen";

import { keybinds } from "../../keybinds";
import { PART_SLOTS } from "../../parts/catalog";
import type { SessionSnapshot } from "../../run/session";
import { PartIcon } from "./PartIcon";

interface WinScreenProps {
  snapshot: SessionSnapshot;
  onRestart: () => void;
}

/**
 * Victory overlay — composes the shipped `ResultsScreen` building block and
 * wreckway's part strip (game-owned content) rather than a hand-rolled full overlay.
 */
export function WinScreen({ snapshot, onRestart }: WinScreenProps) {
  const outcome = snapshot.outcome;
  if (outcome === null) return null;
  return (
    <>
      <ResultsScreen
        outcome="victory"
        title="OUT OF THE YARD"
        lines={[
          { label: "TIME", value: formatDuration(outcome.time, { decimals: 1 }), accent: true },
          { label: "PARTS ON EXIT", value: `${outcome.partsOnExit}/4` },
          { label: "NEAR MISSES", value: outcome.nearMisses },
          { label: "CLOSEST CALL", value: formatDistance(outcome.closestGap) },
        ]}
        entries={[
          {
            id: "restart",
            label: "RUN IT AGAIN",
            keybind: actionLabel(keybinds, "restart") ?? "R",
          },
        ]}
        selectedId="restart"
        onActivate={() => onRestart()}
      />
      {/* Game-owned build readout — not a generic results field. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[18%] z-10 flex justify-center gap-2">
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
