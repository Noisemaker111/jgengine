import type { FanReadout, SessionSnapshot } from "../../race/session";
import { fanById } from "../../race/route";
import { PALETTE } from "./theme";

function stageColor(fan: FanReadout): string {
  if (fan.stage === "on") return PALETTE.skyTeal;
  if (fan.stage === "off") return `${PALETTE.cloudWhite}55`;
  return PALETTE.windsockOrange;
}

function stageLabel(fan: FanReadout): string {
  if (fan.stage === "on") return "ON";
  if (fan.stage === "off") return "OFF";
  return fan.stage === "up" ? "SPOOL" : "WIND DN";
}

export function FanBoard({ snapshot }: { snapshot: SessionSnapshot }) {
  return (
    <div
      className="flex w-[190px] flex-col gap-1 rounded-lg border px-3 py-2"
      style={{ borderColor: `${PALETTE.citySlate}55`, backgroundColor: "#0f1d1ee6" }}
    >
      <span className="text-[9px] font-bold uppercase tracking-[0.3em]" style={{ color: `${PALETTE.cloudWhite}77` }}>
        Fan schedule
      </span>
      {snapshot.fans.map((fan) => {
        const color = stageColor(fan);
        const canyon = fanById(fan.id).canyon;
        const label = fan.id.replace("fan-", "").toUpperCase();
        return (
          <div key={fan.id} className="flex items-center gap-2">
            <span className="w-7 font-mono text-[10px] font-bold" style={{ color: PALETTE.cloudWhite }}>
              {label}
            </span>
            <span className="w-2 text-[10px]" style={{ color: `${PALETTE.cloudWhite}66` }} title={`Canyon ${canyon}`}>
              {fan.direction === -1 ? "⟲" : ""}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: `${PALETTE.citySlate}44` }}>
              <span className="block h-full rounded-full" style={{ width: `${fan.power * 100}%`, backgroundColor: color }} />
            </span>
            <span className="w-14 text-right font-mono text-[9px] font-bold tabular-nums" style={{ color }}>
              {stageLabel(fan)} {Math.ceil(fan.secondsToNextStage)}s
            </span>
          </div>
        );
      })}
    </div>
  );
}
