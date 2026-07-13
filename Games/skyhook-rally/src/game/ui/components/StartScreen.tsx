import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useGame } from "@jgengine/react/hooks";

import { keybinds } from "../../keybinds";
import type { CourseDef } from "../../world/courses";
import type { SessionState } from "../../session/sessionState";
import { panelClass, primaryButtonClass } from "../theme";

const KEY_LEGEND: readonly [string, string][] = [
  [actionLabel(keybinds, "hook") ?? "LMB", "Fire / release hook"],
  [actionLabel(keybinds, "steerLeft") ?? "A", "Steer left"],
  [actionLabel(keybinds, "steerRight") ?? "D", "Steer right"],
  [actionLabel(keybinds, "pitchUp") ?? "W", "Nose up"],
  [actionLabel(keybinds, "pitchDown") ?? "S", "Nose down"],
  [actionLabel(keybinds, "restartCourse") ?? "R", "Restart course"],
  ["Mouse", "Look / aim"],
];

export function StartScreen({ courses, session }: { courses: readonly CourseDef[]; session: SessionState }) {
  const { commands } = useGame();

  return (
    <div data-jg-menu className="pointer-events-auto flex h-full w-full items-center justify-center bg-gradient-to-b from-[#f7c59f]/25 via-transparent to-[#2b2118]/60 px-4">
      <div className={`${panelClass} w-full max-w-xl`}>
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#b08d57]">Sunrise Brass Archipelago</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-[#f4efe6]">Skyhook Rally</h1>
        <p className="mt-2 text-sm text-[#f4efe6]/85">
          Swing pylon to pylon on the brass hook, release at the apex bell, and beat the marshal&apos;s par before the
          mail route goes cold. Fall into the clouds and you&apos;re back at your last checkpoint.
        </p>

        <div className="mt-4 grid gap-2">
          {courses.map((course, index) => {
            const selected = session.selectedCourseId === course.id;
            return (
              <button
                key={course.id}
                type="button"
                onClick={() => commands.run(`selectCourse${index + 1}`, {})}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition ${
                  selected
                    ? "border-[#2e8b8b] bg-[#2e8b8b]/25"
                    : "border-[#b08d57]/40 bg-[#2b2118]/40 hover:border-[#b08d57]"
                }`}
              >
                <span>
                  <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded border border-[#f4efe6]/40 text-[11px] font-bold">
                    {index + 1}
                  </span>
                  <span className="font-bold text-[#f4efe6]">{course.name}</span>
                  <span className="ml-2 text-xs text-[#f4efe6]/60">{course.checkpoints.length} rings</span>
                </span>
                <span className="text-xs font-bold text-[#facc8a]">par {course.parSeconds}s</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-[#b08d57]/30 bg-[#2b2118]/40 p-3 text-xs">
          {KEY_LEGEND.map(([key, label]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="inline-flex min-w-[2.2em] items-center justify-center rounded border border-[#f4efe6]/40 bg-[#f4efe6]/10 px-1.5 py-0.5 font-bold text-[#f4efe6]">
                {key}
              </span>
              <span className="text-[#f4efe6]/80">{label}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs text-[#f4efe6]/60">Press Enter or click Start</span>
          <button type="button" className={primaryButtonClass} onClick={() => commands.run("startRun", {})}>
            Start run
          </button>
        </div>
      </div>
    </div>
  );
}
