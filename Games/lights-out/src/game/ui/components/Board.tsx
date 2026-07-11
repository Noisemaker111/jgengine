import { CELLS, isLit } from "../../logic/board";
import { cellStyle, steelFrameStyle } from "../theme";

export function Board({
  board,
  hintCell,
  onCell,
}: {
  board: number;
  hintCell: number | null;
  onCell: (cell: number) => void;
}) {
  const cells = [];
  for (let cell = 0; cell < CELLS; cell += 1) {
    const lit = isLit(board, cell);
    cells.push(
      <button
        key={cell}
        type="button"
        aria-label={`Cell ${cell + 1}${lit ? " lit" : ""}`}
        aria-pressed={lit}
        onClick={() => onCell(cell)}
        className="appearance-none p-0"
        style={cellStyle(lit, hintCell === cell)}
      />,
    );
  }
  return (
    <div style={{ width: "min(86vw, 26rem)", borderRadius: 22, padding: "5.2%", ...steelFrameStyle }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "5.2%" }}>{cells}</div>
    </div>
  );
}
