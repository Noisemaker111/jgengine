import { SIZE_GROUPS, puzzlesInGroup } from "../../puzzles/catalog";
import { allBests } from "../../state/records";
import type { Commands } from "../hooks";
import { formatTime } from "../format";
import { GOOD, PAPER } from "../theme";
import { Thumb } from "./Thumb";

interface MenuProps {
  commands: Commands;
  completed: readonly string[];
  mistakesMode: boolean;
}

export function Menu({ commands, completed, mistakesMode }: MenuProps) {
  const bests = allBests();
  const done = new Set(completed);
  const solvedCount = done.size;

  return (
    <div
      style={{
        width: "min(880px, 94vw)",
        maxHeight: "88vh",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        padding: "26px 24px 30px",
        borderRadius: 20,
        background: "rgba(11, 15, 21, 0.9)",
        border: "1px solid rgba(148,163,184,0.16)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
      }}
    >
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", color: "#f1f5f9" }}>
            Nonogram
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#94a3b8" }}>
            Fill the grid from the row and column clues to reveal a hidden picture.
          </p>
        </div>
        <div style={{ textAlign: "right", color: "#cbd5e1", fontSize: 13 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: GOOD }}>{solvedCount}/20</div>
          <div>solved</div>
        </div>
      </header>

      <button
        onClick={() => commands.run("toggleMistakes", {})}
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          borderRadius: 999,
          border: "1px solid rgba(148,163,184,0.28)",
          background: mistakesMode ? "rgba(244,63,94,0.18)" : "rgba(148,163,184,0.12)",
          color: mistakesMode ? "#fda4af" : "#cbd5e1",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Mistakes mode: {mistakesMode ? "On — 3 strikes" : "Off — free play"}
      </button>

      {SIZE_GROUPS.map((group) => (
        <section key={group} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c8aa0" }}>
            {group}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12 }}>
            {puzzlesInGroup(group).map((puzzle) => {
              const solved = done.has(puzzle.id);
              const best = bests[puzzle.id];
              return (
                <button
                  key={puzzle.id}
                  onClick={() => commands.run("selectPuzzle", { id: puzzle.id })}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    padding: "12px 10px 10px",
                    borderRadius: 14,
                    border: solved ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(148,163,184,0.16)",
                    background: solved ? "rgba(34,197,94,0.08)" : "rgba(30,41,59,0.5)",
                    color: PAPER,
                    cursor: "pointer",
                  }}
                >
                  <Thumb puzzle={puzzle} solved={solved} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>
                    {solved ? puzzle.name : "? ? ?"}
                  </span>
                  <span style={{ fontSize: 12, color: solved ? GOOD : "#64748b", minHeight: 15 }}>
                    {best !== undefined ? `best ${formatTime(best)}` : solved ? "solved" : "unsolved"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <footer style={{ marginTop: 4, textAlign: "center", fontSize: 12, color: "#64748b" }}>
        Nonograms — Non Ishida &amp; Tetsuya Nishio (1987)
      </footer>
    </div>
  );
}
