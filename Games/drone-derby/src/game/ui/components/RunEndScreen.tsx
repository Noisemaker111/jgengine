import { ResultsScreen, type ResultLine } from "@/components/ui/results-screen";
import type { MenuEntry } from "@/components/ui/menu-list";

import { COURSES, COURSE_ORDER } from "../../race/courses";
import { requestCourse, requestRestart } from "../../drone/menuIntent";
import { formatRaceTime, type Medal, type RunState } from "../../race/run";

function medalLabel(medal: Medal): string {
  if (medal === "gold") return "GOLD";
  if (medal === "silver") return "SILVER";
  if (medal === "bronze") return "BRONZE";
  return "NO MEDAL";
}

const MENU_ENTRIES: readonly MenuEntry[] = [
  { id: "restart", label: "Restart", keybind: "R" },
  ...COURSE_ORDER.map((id, index) => ({ id: `course:${id}`, label: `${COURSES[id].name}`, keybind: String(index + 1) })),
];

export function RunEndScreen({ state }: { state: RunState }) {
  const course = COURSES[state.courseId];
  const isFinished = state.phase === "finished";

  const lines: ResultLine[] = isFinished
    ? [
        { label: "Course", value: course.name },
        { label: "Time", value: formatRaceTime(state.finishTime ?? 0), accent: true },
        { label: "Medal", value: medalLabel(state.medal), accent: state.medal !== "none" },
        { label: "Cells Used", value: `${state.cellsUsed}%` },
        { label: "Attempt", value: state.attempts },
      ]
    : [
        { label: "Course", value: course.name },
        {
          label: "DNF",
          value: state.dnfReason === "battery" ? "CELL DEPLETED" : "TIME CAP EXCEEDED",
          accent: true,
        },
        { label: "Elapsed", value: formatRaceTime(state.elapsed) },
        {
          label: "Where",
          value: state.dnfPosition
            ? `${Math.round(state.dnfPosition[0])}, ${Math.round(state.dnfPosition[1])}, ${Math.round(state.dnfPosition[2])}`
            : "—",
        },
        { label: "Attempt", value: state.attempts },
      ];

  return (
    <ResultsScreen
      outcome={isFinished ? "victory" : "defeat"}
      title={isFinished ? `${course.name} Complete` : "DNF"}
      lines={lines}
      entries={MENU_ENTRIES}
      onActivate={(id) => {
        if (id === "restart") requestRestart();
        else {
          const courseId = id.replace("course:", "");
          const match = COURSE_ORDER.find((entry) => entry === courseId);
          if (match !== undefined) requestCourse(match);
        }
      }}
    />
  );
}
