import type { Puzzle } from "../../logic/types";
import { LINE, PAPER, TEAL } from "../theme";

interface ThumbProps {
  puzzle: Puzzle;
  solved: boolean;
  px?: number;
}

// Solved puzzles reveal their colored picture as a reward; unsolved ones stay a
// blank graph-paper tile so the menu never spoils the answer.
export function Thumb({ puzzle, solved, px = 62 }: ThumbProps) {
  const size = puzzle.size;
  const cell = px / size;

  if (!solved) {
    return (
      <div
        style={{
          width: px,
          height: px,
          borderRadius: 8,
          background: PAPER,
          backgroundImage: `repeating-linear-gradient(0deg, ${LINE} 0 1px, transparent 1px ${cell}px), repeating-linear-gradient(90deg, ${LINE} 0 1px, transparent 1px ${cell}px)`,
          border: `1px solid ${LINE}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#b9ab86",
          fontSize: px * 0.42,
          fontWeight: 800,
        }}
      >
        ?
      </div>
    );
  }

  return (
    <div
      style={{
        width: px,
        height: px,
        borderRadius: 8,
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: `repeat(${size}, 1fr)`,
        gridTemplateRows: `repeat(${size}, 1fr)`,
        background: PAPER,
        border: `1px solid ${LINE}`,
      }}
    >
      {puzzle.solution.map((row, r) =>
        row.map((filled, c) => (
          <div
            key={`${r}-${c}`}
            style={{ background: filled ? (puzzle.colors[r][c] ?? TEAL) : "transparent" }}
          />
        )),
      )}
    </div>
  );
}
