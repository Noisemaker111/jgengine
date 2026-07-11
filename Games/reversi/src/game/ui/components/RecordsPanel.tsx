import { useGame } from "@jgengine/react/hooks";

import type { AiLevel } from "../../ai";
import type { AppState } from "../../state";
import { COLORS } from "../theme";

const ROWS: readonly { id: AiLevel; name: string }[] = [
  { id: "novice", name: "Novice" },
  { id: "club", name: "Club" },
  { id: "master", name: "Master" },
];

export function RecordsPanel({ app }: { app: AppState }): React.ReactElement {
  const { commands } = useGame();
  const r = app.records;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "200px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.subtext }}>
          Records vs AI
        </span>
        <button
          type="button"
          onClick={() => commands.run("resetRecords", {})}
          style={{ fontSize: "10px", color: COLORS.subtext, background: "none", border: "none", cursor: "pointer" }}
        >
          reset
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "4px 10px", alignItems: "center" }}>
        <span style={{ fontSize: "10px", color: COLORS.subtext }} />
        <span style={{ fontSize: "10px", color: COLORS.subtext, textAlign: "right" }}>W · L · D</span>
        <span style={{ fontSize: "10px", color: COLORS.subtext, textAlign: "right" }}>Best +</span>
        {ROWS.map((row) => {
          const best = r.bestMargin[row.id];
          return (
            <RecordRow
              key={row.id}
              name={row.name}
              wld={`${r.wins[row.id]}·${r.losses[row.id]}·${r.draws[row.id]}`}
              best={best === undefined ? "—" : `+${best}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function RecordRow({ name, wld, best }: { name: string; wld: string; best: string }): React.ReactElement {
  return (
    <>
      <span style={{ fontSize: "12px", fontWeight: 600, color: COLORS.text }}>{name}</span>
      <span style={{ fontSize: "12px", color: COLORS.text, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{wld}</span>
      <span style={{ fontSize: "12px", color: COLORS.brassHi, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{best}</span>
    </>
  );
}
