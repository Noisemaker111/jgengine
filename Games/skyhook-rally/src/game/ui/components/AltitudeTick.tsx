import { CLOUD_TRIGGER_Y } from "../../world/archipelago";
import { panelClass } from "../theme";

const WARN_MARGIN = 14;

export function AltitudeTick({ altitude }: { altitude: number }) {
  const danger = altitude < CLOUD_TRIGGER_Y + WARN_MARGIN;
  return (
    <div className={`${panelClass} flex w-24 flex-col items-center gap-1 px-3 py-2`}>
      <p className="text-[10px] uppercase tracking-wide text-[#f4efe6]/60">Altitude</p>
      <p className={`text-lg font-black leading-none ${danger ? "text-[#f28b6b]" : "text-[#f4efe6]"}`}>{Math.round(altitude)}m</p>
      {danger ? <p className="text-[9px] font-bold uppercase text-[#f28b6b]">Cloud layer!</p> : null}
    </div>
  );
}
