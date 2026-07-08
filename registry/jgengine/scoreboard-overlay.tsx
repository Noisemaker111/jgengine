import { HudLabel } from "@/components/ui/hud-label";
import { HudPanel } from "@/components/ui/hud-panel";

export interface ScoreboardColumn {
  key: string;
  header: string;
  width?: number;
  align?: "left" | "right";
}

export interface ScoreboardRow {
  id: string;
  values: Record<string, string | number>;
  highlight?: boolean;
  teamColor?: string;
}

function looksNumeric(value: string | number): boolean {
  if (typeof value === "number") return true;
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

export function ScoreboardOverlay({
  title,
  columns,
  rows,
  open = true,
  width = 560,
  className,
}: {
  title?: string;
  columns: readonly ScoreboardColumn[];
  rows: readonly ScoreboardRow[];
  open?: boolean;
  width?: number;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div
      className={`pointer-events-auto fixed inset-0 flex items-center justify-center ${className ?? ""}`}
      data-jg="scoreboard-overlay"
      style={{ background: "rgba(0,0,0,0.55)" }}
    >
      <HudPanel title={title} width={width}>
        <div className="flex flex-col">
          <div className="mb-1 flex pb-1.5" style={{ borderBottom: "1px solid var(--jg-edge)" }}>
            {columns.map((column) => (
              <div
                key={column.key}
                style={{
                  width: column.width,
                  flex: column.width === undefined ? 1 : "0 0 auto",
                  textAlign: column.align ?? "left",
                }}
              >
                <HudLabel>{column.header}</HudLabel>
              </div>
            ))}
          </div>
          {rows.map((row, index) => {
            const alt = index % 2 === 1;
            const edge =
              row.highlight === true
                ? "2px solid var(--jg-accent)"
                : row.teamColor !== undefined
                  ? `3px solid ${row.teamColor}`
                  : "2px solid transparent";
            return (
              <div
                key={row.id}
                data-jg="scoreboard-row"
                className="box-border flex items-center py-[5px] pl-1.5"
                style={{
                  borderLeft: edge,
                  background:
                    row.highlight === true
                      ? "color-mix(in srgb, var(--jg-accent) 10%, transparent)"
                      : alt
                        ? "rgba(255,255,255,0.025)"
                        : "transparent",
                }}
              >
                {columns.map((column) => {
                  const value = row.values[column.key];
                  const numeric = value !== undefined && looksNumeric(value);
                  return (
                    <div
                      key={column.key}
                      className={`text-xs ${numeric ? "font-mono" : ""}`}
                      style={{
                        width: column.width,
                        flex: column.width === undefined ? 1 : "0 0 auto",
                        textAlign: column.align ?? (numeric ? "right" : "left"),
                        color: "var(--jg-text)",
                      }}
                    >
                      {value}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </HudPanel>
    </div>
  );
}
