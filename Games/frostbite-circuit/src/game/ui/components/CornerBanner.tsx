import type { CornerBanner as CornerBannerData } from "../../race/iceEvents";
import { PALETTE } from "../theme";

export function CornerBanner({ banner }: { banner: CornerBannerData | null }) {
  if (banner === null) return null;
  const accent = banner.severity === "open" ? PALETTE.deepWater : PALETTE.iceBlue;
  return (
    <div className="absolute left-1/2 top-6 -translate-x-1/2">
      <div
        className="rounded-md border-2 px-5 py-2 text-center shadow-[0_0_28px_rgba(0,0,0,0.6)]"
        style={{ borderColor: PALETTE.flareRed, backgroundColor: `${PALETTE.deepWater}f2` }}
      >
        <span className="font-mono text-sm font-black uppercase tracking-[0.15em]" style={{ color: accent === PALETTE.deepWater ? PALETTE.flareRed : PALETTE.snowWhite }}>
          {banner.message}
        </span>
      </div>
    </div>
  );
}
