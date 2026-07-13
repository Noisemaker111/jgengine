import { useGame } from "@jgengine/react/hooks";
import { keyLabel } from "../keyLabel";

const CONTROLS: { action: string; label: string }[] = [
  { action: "laneLeft", label: "LANE LEFT" },
  { action: "laneRight", label: "LANE RIGHT" },
  { action: "polarityFlip", label: "FLIP POLARITY" },
  { action: "boost", label: "BOOST" },
  { action: "brake", label: "BRAKE" },
  { action: "restartSector", label: "RESTART SECTOR" },
  { action: "startRun", label: "START" },
];

export function StartScreen() {
  const { commands } = useGame();
  return (
    <div data-jg-menu className="flex max-w-md flex-col items-center gap-5 rounded-lg border border-[#dfe6ee]/15 bg-[#20242a]/95 px-8 py-7 text-center shadow-2xl">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-black tracking-wide text-[#dfe6ee]">MAGNET RUN</h1>
        <p className="text-xs font-semibold tracking-widest text-[#ffd23f]">SECTOR 3 CLEAR OR BUST — TELEMETRY LIVE</p>
      </div>
      <p className="text-sm leading-relaxed text-[#dfe6ee]/80">
        You run the freight tunnel automatically. Flip polarity to reverse which magnetic strips hold you —
        opposite pole sticks, matching pole throws you off. Snap floor to ceiling, board train roofs, and clear
        all 3 sectors before you burn 3 crashes in one.
      </p>
      <div className="flex w-full items-center justify-center gap-6 rounded bg-[#2b2f36]/70 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-bold text-[#dfe6ee]">
          <span className="h-4 w-4 rounded-full bg-[#ff4b3e]" /> RED BOT
        </div>
        <span className="text-[#dfe6ee]/40">sticks to</span>
        <div className="flex items-center gap-2 text-xs font-bold text-[#dfe6ee]">
          <span className="h-4 w-4 rounded-full bg-[#3e7bff]" /> BLUE STRIP
        </div>
      </div>
      <div className="grid w-full grid-cols-2 gap-x-4 gap-y-1.5 text-left text-xs text-[#dfe6ee]/80">
        {CONTROLS.map((entry) => (
          <div key={entry.action} className="flex items-center gap-2">
            <kbd className="rounded border border-[#dfe6ee]/40 bg-[#2b2f36] px-1.5 py-0.5 font-mono text-[10px]">
              {keyLabel(entry.action)}
            </kbd>
            <span>{entry.label}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => commands.run("startRun", {})}
        className="w-full rounded bg-[#ff4b3e] py-2.5 text-sm font-black tracking-widest text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-95"
      >
        START — {keyLabel("startRun")}
      </button>
    </div>
  );
}
