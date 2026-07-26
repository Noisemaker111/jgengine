import { creditsForSourceIds } from "@jgengine/assets/credits";
import { mergeCredits } from "@jgengine/core/game/credits";
import { CreditsScreen } from "@jgengine/react/creditsScreen";

import { ASSET_SOURCE_IDS } from "../../assets";

const AUTHORED = {
  title: "WRECKWAY",
  sections: [
    {
      heading: "Built with",
      entries: [{ label: "JGengine", detail: "game SDK", href: "https://github.com/Noisemaker111/jgengine" }],
    },
  ],
  notice: "Every pack above is used under the license it is listed with.",
};

const DOCUMENT = mergeCredits(AUTHORED, creditsForSourceIds(ASSET_SOURCE_IDS));

export function Credits({ onBack }: { onBack: () => void }) {
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center overflow-y-auto bg-[#1c1a17]/95 p-4">
      <div className="w-full max-w-2xl rounded-lg border-2 border-[#b7410e] bg-[#241f19] p-6 shadow-[0_0_40px_rgba(0,0,0,0.6)] sm:p-8">
        <CreditsScreen document={DOCUMENT} />
        <button
          type="button"
          onClick={onBack}
          className="mt-8 rounded border-2 border-[#f0c419] bg-[#b7410e] px-8 py-2 text-sm font-black tracking-widest text-[#fef3e0] transition hover:bg-[#d94f14]"
        >
          BACK — ESC
        </button>
      </div>
    </div>
  );
}
