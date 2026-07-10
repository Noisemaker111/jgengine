import { PALETTE } from "../../constants";
import { WHISTLE_COOLDOWN_SECONDS, whistleCooldownFraction, type WhistleState } from "../../session/gather";

export function WhistleRing({
  whistle,
  now,
  holding,
}: {
  whistle: WhistleState;
  now: number;
  holding: boolean;
}): React.ReactNode {
  const fraction = whistleCooldownFraction(whistle, now);
  const ready = fraction <= 0;
  const degrees = 360 * (1 - fraction);

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-[#101318]/70 px-3 py-2 backdrop-blur-sm">
      <div
        className="relative flex h-14 w-14 items-center justify-center rounded-full"
        style={{
          background: ready
            ? `conic-gradient(${PALETTE.spiritMint} 360deg, ${PALETTE.spiritMint} 0deg)`
            : `conic-gradient(${PALETTE.spiritMint} ${degrees}deg, #262b33 0deg)`,
        }}
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#101318] text-[10px] font-semibold text-[#eef4f0]">
          SPACE
        </div>
        <span
          className="absolute -bottom-1 -right-1 rounded-full bg-[#101318] px-1 text-[9px] text-[#eef4f0]/70"
          aria-hidden={ready}
        >
          {ready ? "" : `${(WHISTLE_COOLDOWN_SECONDS * fraction).toFixed(1)}s`}
        </span>
      </div>
      <div className="flex flex-col text-[11px] text-[#eef4f0]/80">
        <span className="font-medium">Whistle</span>
        <span className="text-[#eef4f0]/60">gather-pulse</span>
      </div>
      <div
        className="ml-2 flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold"
        style={{
          backgroundColor: holding ? `${PALETTE.spiritRose}33` : "#1c222c",
          color: holding ? PALETTE.spiritRose : "#eef4f0aa",
        }}
      >
        SHIFT · staff
      </div>
    </div>
  );
}
