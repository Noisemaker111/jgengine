import { FaceIcon, type FaceMood } from "../icons";
import { formatLed, ledPanel } from "../theme";

function LedDisplay({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="flex items-center rounded-[3px] px-2 py-1"
      style={ledPanel}
      aria-label={`${label} ${value}`}
    >
      <span
        className="font-mono text-2xl font-bold tabular-nums tracking-[0.12em]"
        style={{ color: "#ff3b30", textShadow: "0 0 6px rgba(255,60,45,0.65)" }}
      >
        {formatLed(value)}
      </span>
    </div>
  );
}

export function ConsoleBar({
  minesRemaining,
  seconds,
  mood,
  onReset,
  resetKey,
}: {
  minesRemaining: number;
  seconds: number;
  mood: FaceMood;
  onReset: () => void;
  resetKey: string | null;
}) {
  return (
    <div
      className="mb-2 flex items-center justify-between rounded-md px-3 py-2"
      style={{ background: "#dbe1ea", boxShadow: "inset 2px 2px 0 #ffffff, inset -2px -2px 0 #b3bdca" }}
    >
      <LedDisplay value={minesRemaining} label="mines remaining" />
      <button
        type="button"
        onClick={onReset}
        aria-label="new game"
        className="relative flex h-11 w-11 items-center justify-center rounded-md active:translate-y-px"
        style={{
          background: "linear-gradient(150deg, #f2f5f9 0%, #cfd7e2 100%)",
          boxShadow: "inset 2px 2px 0 #ffffff, inset -2px -2px 0 #a9b4c2, 0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
        <FaceIcon mood={mood} size={30} />
        {resetKey !== null && (
          <span className="absolute -bottom-1 -right-1 rounded bg-slate-800 px-1 text-[9px] font-bold leading-tight text-slate-100 shadow">
            {resetKey}
          </span>
        )}
      </button>
      <LedDisplay value={seconds} label="elapsed seconds" />
    </div>
  );
}
