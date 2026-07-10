import type { CourseDef } from "../../world/courses";
import type { SessionState } from "../../session/sessionState";
import { panelClass } from "../theme";

export function CheckpointTimer({ course, session, now }: { course: CourseDef; session: SessionState; now: number }) {
  const elapsed = Math.max(0, now - session.startedAt + session.penaltySeconds);
  const delta = elapsed - course.parSeconds;
  return (
    <div className={`${panelClass} flex items-center gap-4 px-5 py-2`}>
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-wide text-[#f4efe6]/60">Checkpoint</p>
        <p className="text-lg font-black leading-none text-[#f4efe6]">
          {session.checkpointsHit}/{session.totalCheckpoints}
        </p>
      </div>
      <div className="h-8 w-px bg-[#b08d57]/40" />
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-wide text-[#f4efe6]/60">Time</p>
        <p className="text-lg font-black leading-none text-[#f4efe6]">{elapsed.toFixed(1)}s</p>
      </div>
      <div className="h-8 w-px bg-[#b08d57]/40" />
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-wide text-[#f4efe6]/60">Par {course.parSeconds}s</p>
        <p className={`text-lg font-black leading-none ${delta <= 0 ? "text-[#7dd3a8]" : "text-[#f28b6b]"}`}>
          {delta <= 0 ? "-" : "+"}
          {Math.abs(delta).toFixed(1)}s
        </p>
      </div>
    </div>
  );
}
