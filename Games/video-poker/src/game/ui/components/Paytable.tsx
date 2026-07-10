import type { PayingCategory } from "../../paytable";
import { HAND_LABELS, MAX_BET, MIN_BET, PAYTABLE_ROWS, payColumn } from "../../paytable";

const BET_COLUMNS: readonly number[] = Array.from({ length: MAX_BET - MIN_BET + 1 }, (_unused, i) => MIN_BET + i);

export interface PaytableProps {
  bet: number;
  winRow: PayingCategory | null;
  compact: boolean;
}

export function Paytable({ bet, winRow, compact }: PaytableProps) {
  const cell = compact ? "px-1.5 py-0.5 text-[0.62rem]" : "px-2.5 py-1 text-sm";
  const labelCell = compact ? "px-1.5 py-0.5 text-[0.62rem]" : "px-2.5 py-1 text-sm";

  return (
    <div className="overflow-hidden rounded-md border border-amber-500/40 bg-black/55">
      <table className="w-full border-collapse font-mono text-[#8ef2a8]">
        <thead>
          <tr className="bg-amber-500/15 text-amber-200">
            <th className={`text-left font-bold uppercase tracking-wider ${labelCell}`}>Hand</th>
            {BET_COLUMNS.map((column) => (
              <th
                key={column}
                className={[
                  "text-right font-black tabular-nums",
                  cell,
                  column === bet ? "bg-amber-400/30 text-amber-100" : "",
                ].join(" ")}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PAYTABLE_ROWS.map((row) => {
            const isWin = row === winRow;
            return (
              <tr
                key={row}
                className={[
                  "border-t border-amber-500/10",
                  isWin ? "vp-flash font-bold text-amber-100" : "",
                ].join(" ")}
              >
                <td className={`whitespace-nowrap uppercase tracking-wide ${labelCell}`}>{HAND_LABELS[row]}</td>
                {BET_COLUMNS.map((column) => (
                  <td
                    key={column}
                    className={[
                      "text-right tabular-nums",
                      cell,
                      column === bet ? "bg-amber-400/15 font-bold text-amber-200" : "text-[#8ef2a8]",
                    ].join(" ")}
                  >
                    {payColumn(row, column)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
