import { actionLabel } from "@jgengine/core/input/actionBindings";
import { KeyHint } from "@jgengine/react";
import { useGame } from "@jgengine/react/hooks";

import { keybinds } from "../../keybinds";
import type { CourseDef } from "../../world/courses";
import { panelClass, primaryButtonClass, secondaryButtonClass } from "../theme";

export function LoseScreen({ course }: { course: CourseDef }) {
  const { commands } = useGame();

  return (
    <div className="pointer-events-auto flex h-full w-full items-center justify-center bg-[#2b2118]/75 px-4">
      <div className={`${panelClass} w-full max-w-md text-center`}>
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#b08d57]">{course.name}</p>
        <h2 className="mt-1 text-2xl font-black text-[#f28b6b]">Out of Time</h2>
        <p className="mt-2 text-sm text-[#f4efe6]/85">
          The mail route went cold — {course.totalTimeCapSeconds}s came and went. The marshal says try the line again.
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button type="button" className={secondaryButtonClass} onClick={() => commands.run("returnToMenu", {})}>
            Course select
          </button>
          <button type="button" className={primaryButtonClass} onClick={() => commands.run("restartCourse", {})}>
            Restart
            <KeyHint> ({actionLabel(keybinds, "restartCourse") ?? "R"})</KeyHint>
          </button>
        </div>
      </div>
    </div>
  );
}
