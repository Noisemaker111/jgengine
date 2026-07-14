import { SettingsTrigger } from "@jgengine/react";
import { useStore } from "@jgengine/react/store";
import { KeybindBadge } from "@/components/ui/keybind-badge";
import { CountdownPips } from "@/components/ui/match-timer";

import { runStore } from "../race/run";
import { beginPointerDrag, endPointerDrag, updatePointerDrag } from "../drone/pointerInput";
import { ringsForCourse } from "../race/courses";
import { BatteryColumn } from "./components/BatteryColumn";
import { DroneMinimap, type MinimapPad, type MinimapRing } from "./components/DroneMinimap";
import { PadChargeOverlay } from "./components/PadChargeOverlay";
import { RingProgress } from "./components/RingProgress";
import { RunEndScreen } from "./components/RunEndScreen";
import { StartScreen } from "./components/StartScreen";
import { TelemetryStrip } from "./components/TelemetryStrip";
import { voltNeonVars } from "./theme";

function FlightHud() {
  const state = useStore(runStore);
  const rings = ringsForCourse(state.courseId);
  const nextRing = rings[state.ringIndex] ?? null;

  const minimapRings: readonly MinimapRing[] = rings.map((ring, index) => ({
    id: ring.id,
    x: ring.x,
    z: ring.z,
    state: index < state.ringIndex ? "done" : index === state.ringIndex ? "next" : "pending",
  }));
  const minimapPads: readonly MinimapPad[] = state.telemetry.nearestPadId
    ? [{ id: state.telemetry.nearestPadId, x: state.telemetry.position[0], z: state.telemetry.position[2], charging: state.telemetry.charging }]
    : [];

  return (
    <div
      className="pointer-events-none absolute inset-0"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        beginPointerDrag(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => updatePointerDrag(event.clientX, event.clientY)}
      onPointerUp={() => endPointerDrag()}
      onPointerCancel={() => endPointerDrag()}
      style={{ pointerEvents: "auto" }}
    >
      <div className="absolute top-5 left-1/2 -translate-x-1/2">
        <RingProgress
          ringIndex={state.ringIndex}
          ringTotal={state.ringTotal}
          dronePosition={state.telemetry.position}
          droneHeading={state.telemetry.heading}
          nextRingPosition={nextRing !== null ? [nextRing.x, 0, nextRing.z] : null}
        />
      </div>

      <div className="absolute top-5 right-5 flex flex-col items-end gap-2">
        <SettingsTrigger className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#3a4048] bg-[#20242b]/90 text-[#9ef01a] transition-colors hover:bg-[#2a2f37]/90" />
        <BatteryColumn
          cells={state.telemetry.batteryCells}
          drawRate={state.telemetry.drawRate}
          rangeMeters={state.telemetry.rangeMeters}
          nearestPadDistance={state.telemetry.nearestPadDistance}
        />
      </div>

      <div className="absolute top-36 right-5">
        <DroneMinimap
          center={[state.telemetry.position[0], state.telemetry.position[2]]}
          heading={state.telemetry.heading}
          rings={minimapRings}
          pads={minimapPads}
          rangeMeters={state.telemetry.rangeMeters}
          windVector={state.telemetry.windVector}
          gustActive={state.telemetry.gustActive}
        />
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        {state.telemetry.charging ? (
          <PadChargeOverlay chargeFraction={state.telemetry.chargeFraction} />
        ) : (
          <TelemetryStrip
            speed={state.telemetry.speed}
            altitude={state.telemetry.altitude}
            windSpeed={state.telemetry.windSpeed}
            gustActive={state.telemetry.gustActive}
          />
        )}
      </div>

      {!state.telemetry.charging && (
        <div className="absolute bottom-6 right-5 flex items-center gap-2">
          <KeybindBadge label="E" size="sm" />
          <span className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--jg-text-dim)" }}>
            {state.telemetry.nearestPadDistance !== null && state.telemetry.nearestPadDistance < 6
              ? "charge"
              : "land on pad to charge"}
          </span>
        </div>
      )}
    </div>
  );
}

function HudLayer() {
  const state = useStore(runStore);

  if (state.phase === "menu") return <StartScreen courseId={state.courseId} />;

  if (state.phase === "countdown") {
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6">
        <CountdownPips value={state.countdown} />
        <span className="text-[12px] font-bold uppercase tracking-[0.28em]" style={{ color: "var(--jg-text-dim)" }}>
          {state.courseId.toUpperCase()} — RING 1/{state.ringTotal}
        </span>
      </div>
    );
  }

  if (state.phase === "finished" || state.phase === "dnf") {
    return <RunEndScreen state={state} />;
  }

  return <FlightHud />;
}

export function GameUI() {
  return (
    <div style={{ ...voltNeonVars, display: "contents" }}>
      <HudLayer />
    </div>
  );
}
