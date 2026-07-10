import type { ReactNode } from "react";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { GUARD_DEFS } from "../../entities/guards";
import { CAMERA_DEFS } from "../../entities/cameras";
import { DOOR_DEFS } from "../../entities/doors";
import { guardPhaseAt, guardPositionAt } from "../../schedule/guardSchedule";
import { doorStateAt } from "../../schedule/doorSchedule";
import { mansionClockAt, RUN_SECONDS } from "../../schedule/mansionClock";
import { elapsedSecondsFor, type HeistState } from "../../state/heistState";
import type { HeistUiState } from "../../uiState";
import { roomAt } from "../../mansion/floorPlan";

export function SchedulePanel(): ReactNode {
  const { commands } = useGame();
  const data = useGameStore((ctx) => {
    const heist = ctx.game.store.get("heist") as HeistState | undefined;
    const ui = ctx.game.store.get("ui") as HeistUiState | undefined;
    if (heist === undefined || ui === undefined) return null;
    if (!ui.scheduleOpen) return null;
    const liveElapsed = elapsedSecondsFor(heist, ctx.time.now());
    const t = ui.scrubT ?? liveElapsed;
    return { t, scrubbing: ui.scrubT !== null, liveElapsed };
  });
  if (data === null) return null;
  const { t, scrubbing } = data;
  const clock = mansionClockAt(t);

  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-lg border-2 border-[#c9a227] bg-gradient-to-b from-[#1d2b4a] to-[#0b0f1c] p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-serif text-xs uppercase tracking-[0.3em] text-[#c9a227]">The Published Timetable</p>
            <h2 className="font-serif text-2xl font-bold text-[#f2e3c2]">{clock.label}{scrubbing ? " — preview" : ""}</h2>
          </div>
          <button
            type="button"
            onClick={() => commands.run("ui.schedule", {})}
            className="rounded border border-[#c9a227]/60 bg-black/30 px-3 py-1.5 text-xs uppercase tracking-wide text-[#e5d9c3]"
          >
            Close · Tab
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="w-10 text-right text-[10px] text-[#c9a227]">0:00</span>
          <input
            type="range"
            min={0}
            max={RUN_SECONDS}
            step={1}
            value={t}
            onChange={(event) => commands.run("ui.setScrub", { t: Number(event.target.value) })}
            className="h-1.5 flex-1 accent-[#c9a227]"
          />
          <span className="w-10 text-[10px] text-[#c9a227]">5:00</span>
          {scrubbing ? (
            <button
              type="button"
              onClick={() => commands.run("ui.setScrub", { t: null })}
              className="whitespace-nowrap rounded border border-[#c9a227]/60 bg-black/30 px-2 py-1 text-[10px] uppercase text-[#e5d9c3]"
            >
              Live
            </button>
          ) : null}
        </div>

        <Section title="Guards">
          {GUARD_DEFS.map((guard) => {
            const pose = guardPositionAt(guard, t);
            const room = roomAt(pose.position[0], pose.position[2]);
            const phase = Math.round(guardPhaseAt(guard, t) * 100);
            return (
              <Row key={guard.id}>
                <span className="text-[#f2e3c2]">{guard.name}</span>
                <span className="text-[#a9b6d6]">{room?.name ?? "in transit"}</span>
                <span className="text-[#c9a227]">{guard.loopSeconds}s loop · {phase}%</span>
              </Row>
            );
          })}
        </Section>

        <Section title="Doors">
          {DOOR_DEFS.map((door) => {
            const state = doorStateAt(door, t);
            const next = state.changesAt === null ? "holds" : `${state.locked ? "opens" : "bolts"} ${mansionClockAt(state.changesAt).label}`;
            return (
              <Row key={door.id}>
                <span className="text-[#f2e3c2]">{door.name}</span>
                <span className={state.locked ? "text-[#e77878]" : "text-[#8fe08f]"}>{state.locked ? "Locked" : "Open"}</span>
                <span className="text-[#c9a227]">{next}</span>
              </Row>
            );
          })}
        </Section>

        <Section title="Sentry-Eyes">
          {CAMERA_DEFS.map((camera) => (
            <Row key={camera.id}>
              <span className="text-[#f2e3c2]">{camera.name}</span>
              <span className="text-[#a9b6d6]">{camera.roomName}</span>
              <span className="text-[#c9a227]">{camera.periodSeconds}s sweep</span>
            </Row>
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <div className="mt-4">
      <p className="border-b border-[#c9a227]/40 pb-1 font-serif text-sm uppercase tracking-wide text-[#c9a227]">{title}</p>
      <div className="mt-1 flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Row({ children }: { children: ReactNode }): ReactNode {
  return <div className="grid grid-cols-3 gap-2 rounded px-2 py-1 text-sm odd:bg-black/15">{children}</div>;
}
