import type { DeathInfo } from "../../run/types";
import { TAPE_MAGENTA } from "../../track/palette";

function flashText(death: DeathInfo): string {
  if (death.reason === "gate") return "MISSED THE OVER/UNDER";
  if (death.ghostLap !== null) return `LAP ${death.ghostLap} CAUGHT YOU`;
  return "THE TAPE CAUGHT YOU";
}

export function DeathFlash({ death }: { death: DeathInfo }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#e83d84]/15">
      <p
        className="animate-pulse text-4xl font-black uppercase tracking-widest text-[#f5f2fa]"
        style={{ textShadow: `0 0 30px ${TAPE_MAGENTA}` }}
      >
        {flashText(death)}
      </p>
    </div>
  );
}
