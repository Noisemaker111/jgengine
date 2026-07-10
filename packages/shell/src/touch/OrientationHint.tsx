import { useState } from "react";

export function OrientationHint({ wanted }: { wanted: "landscape" | "portrait" }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-50 flex justify-center"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/25 bg-black/70 px-4 py-2 text-xs font-medium text-white/90 backdrop-blur-sm">
        <span aria-hidden className="text-base leading-none">
          ⟳
        </span>
        <span>Best played in {wanted} — rotate your device</span>
        <button
          type="button"
          aria-label="Dismiss"
          className="ml-1 text-white/60 active:text-white"
          onClick={() => setDismissed(true)}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
