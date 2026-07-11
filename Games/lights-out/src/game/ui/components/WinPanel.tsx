import { useState } from "react";

import { LEVEL_COUNT } from "../../logic/campaign";
import type { AppSnapshot } from "../../state";
import { consolePanelStyle, ghostButtonClass, labelClass, primaryButtonClass } from "../theme";
import { Stars } from "./Stars";

export function WinPanel({
  snapshot,
  onNext,
  onRetry,
  onLevels,
}: {
  snapshot: AppSnapshot;
  onNext: () => void;
  onRetry: () => void;
  onLevels: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const random = snapshot.mode === "random";
  const nextLabel = random
    ? "New Random"
    : snapshot.levelIndex < LEVEL_COUNT - 1
      ? "Next Level"
      : "Level Select";

  const copyLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard && snapshot.shareUrl !== "") {
      void navigator.clipboard.writeText(snapshot.shareUrl);
      setCopied(true);
    }
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-black/62 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl p-6" style={consolePanelStyle}>
        <div
          className="text-[24px] font-black uppercase tracking-[0.28em] text-[#ffbb3c]"
          style={{ textShadow: "0 0 18px rgba(255,170,45,0.6)" }}
        >
          Lights Out!
        </div>
        <Stars value={snapshot.stars} size={2.4} />
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className={labelClass}>Presses</div>
            <div className="text-[26px] font-black tabular-nums text-[#ece0c8]">{snapshot.presses}</div>
          </div>
          <div className="text-center">
            <div className={labelClass}>Par</div>
            <div className="text-[26px] font-black tabular-nums text-[#8b7a5b]">{snapshot.par}</div>
          </div>
        </div>
        {snapshot.newRecord ? (
          <div className="rounded-full border border-[#7a3c06] bg-[#ffb63e]/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#ffcf7a]">
            New Best
          </div>
        ) : null}
        {snapshot.hintsUsed > 0 ? (
          <div className="text-[11px] text-[#7fd0ff]">{snapshot.hintsUsed} hint{snapshot.hintsUsed === 1 ? "" : "s"} used</div>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <button type="button" className={primaryButtonClass} onClick={onNext}>
            {nextLabel}
          </button>
          <button type="button" className={ghostButtonClass} onClick={onRetry}>
            Retry
          </button>
          <button type="button" className={ghostButtonClass} onClick={onLevels}>
            Levels
          </button>
          {random ? (
            <button type="button" className={ghostButtonClass} onClick={copyLink}>
              {copied ? "Copied" : "Copy Link"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
