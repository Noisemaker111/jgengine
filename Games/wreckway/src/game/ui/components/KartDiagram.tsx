import { PART_SLOTS, type WreckwayPartDef } from "../../parts/catalog";
import type { SessionSnapshot } from "../../run/session";
import { PartIcon } from "./PartIcon";

const SLOT_TITLES: Record<string, string> = {
  engine: "ENGINE",
  front: "FRONT",
  wheels: "WHEELS",
  frame: "FRAME",
};

function statDelta(part: WreckwayPartDef | null): string {
  if (part === null) return "unbolted";
  const bits: string[] = [];
  if (part.stats.topSpeed !== 0) bits.push(`SPD ${part.stats.topSpeed > 0 ? "+" : ""}${part.stats.topSpeed}`);
  if (part.stats.turnRate !== 0) bits.push(`HDL ${part.stats.turnRate > 0 ? "+" : ""}${part.stats.turnRate.toFixed(1)}`);
  if (part.stats.jumpPower > 0) bits.push("JUMP");
  if (part.stats.plow > 0) bits.push("PLOW");
  if (part.stats.armor > 0) bits.push("ARMOR");
  return bits.length === 0 ? "neutral" : bits.join(" · ");
}

export function KartDiagram({ snapshot }: { snapshot: SessionSnapshot }) {
  return (
    <div className="flex w-44 flex-col gap-2 rounded border border-[#8d99a6]/40 bg-[#1c1a17]/85 p-2.5 sm:w-52">
      <p className="text-[10px] font-black tracking-[0.2em] text-[#f0c419]">YOUR BUILD</p>
      {PART_SLOTS.map((slot) => {
        const part = snapshot.installed[slot];
        return (
          <div key={slot} className="flex items-center gap-2 rounded border border-[#5a5650]/50 bg-[#241f19] px-2 py-1.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#1c1a17]">
              <PartIcon partId={part?.id ?? null} className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-bold tracking-wide text-[#8d99a6]">{SLOT_TITLES[slot]}</p>
              <p className="truncate text-xs font-semibold text-[#fef3e0]">{part?.label ?? "— empty —"}</p>
              <p className="truncate text-[10px] text-[#c9b8a4]">{statDelta(part)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
