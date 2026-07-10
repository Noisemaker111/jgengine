import { useGame } from "@jgengine/react/hooks";

import type { CourseDef } from "../../world/courses";
import type { SessionState } from "../../session/sessionState";
import { panelClass, primaryButtonClass, secondaryButtonClass } from "../theme";

const MEDAL_LABEL: Record<NonNullable<SessionState["medal"]>, string> = {
  gold: "Gold Medal",
  silver: "Silver Medal",
  bronze: "Bronze Medal",
  none: "Route Complete",
};

const MEDAL_COLOR: Record<NonNullable<SessionState["medal"]>, string> = {
  gold: "#ffd166",
  silver: "#d7dde3",
  bronze: "#c98a4b",
  none: "#f4efe6",
};

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

export function ResultsScreen({ course, session }: { course: CourseDef; session: SessionState }) {
  const { commands } = useGame();
  const medal = session.medal ?? "none";
  const finish = session.finishSeconds ?? 0;
  const delta = finish - course.parSeconds;

  return (
    <div className="pointer-events-auto flex h-full w-full items-center justify-center bg-[#2b2118]/70 px-4">
      <div className={`${panelClass} w-full max-w-md text-center`}>
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#b08d57]">{course.name}</p>
        <h2 className="mt-1 text-2xl font-black" style={{ color: MEDAL_COLOR[medal] }}>
          {MEDAL_LABEL[medal]}
        </h2>

        <div className="mt-4 grid grid-cols-2 gap-3 text-left text-sm">
          <div className="rounded-lg border border-[#b08d57]/30 bg-[#2b2118]/40 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-[#f4efe6]/60">Finish time</p>
            <p className="text-lg font-bold text-[#f4efe6]">{formatSeconds(finish)}</p>
            <p className={`text-xs font-bold ${delta <= 0 ? "text-[#7dd3a8]" : "text-[#f28b6b]"}`}>
              {delta <= 0 ? "-" : "+"}
              {Math.abs(delta).toFixed(1)}s vs par
            </p>
          </div>
          <div className="rounded-lg border border-[#b08d57]/30 bg-[#2b2118]/40 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-[#f4efe6]/60">Longest flight</p>
            <p className="text-lg font-bold text-[#f4efe6]">{session.longestFlightDistance.toFixed(1)}m</p>
          </div>
          <div className="rounded-lg border border-[#b08d57]/30 bg-[#2b2118]/40 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-[#f4efe6]/60">Truest streak</p>
            <p className="text-lg font-bold text-[#f4efe6]">{session.bestStreak}</p>
          </div>
          <div className="rounded-lg border border-[#b08d57]/30 bg-[#2b2118]/40 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-[#f4efe6]/60">True swings</p>
            <p className="text-lg font-bold text-[#f4efe6]">
              {session.trueSwingReleases}/{session.totalReleases}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-3">
          <button type="button" className={secondaryButtonClass} onClick={() => commands.run("restartCourse", {})}>
            Retry (R)
          </button>
          <button type="button" className={primaryButtonClass} onClick={() => commands.run("returnToMenu", {})}>
            Course select
          </button>
        </div>
      </div>
    </div>
  );
}
