import { useGame } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { startedStore } from "../../commands";

export function useGameStarted(): boolean {
  return useStore(startedStore, (v) => v ?? false);
}

export function TitleScreen() {
  const { commands } = useGame();
  return (
    <div data-jg-menu className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#2b1a3f] via-[#c94f7c] to-[#ffb020]">
      <div
        className="absolute inset-0 opacity-20"
        style={{ backgroundImage: "radial-gradient(#000 1.2px, transparent 1.2px)", backgroundSize: "14px 14px" }}
      />
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center gap-2 opacity-70">
        {[34, 58, 42, 72, 50, 88, 60, 44, 66, 38].map((h, i) => (
          <div key={i} className="border-2 border-black bg-[#1b1230]" style={{ width: 46, height: h * 2 }} />
        ))}
      </div>
      <div className="relative flex flex-col items-center">
        <div className="-skew-x-6 rotate-[-2deg] border-4 border-black bg-[#f2599b] px-10 py-3 shadow-[10px_10px_0_#000]">
          <span className="text-6xl font-black uppercase tracking-tighter text-white drop-shadow-[3px_3px_0_#000]">Vice Isle</span>
        </div>
        <div className="mt-3 -skew-x-6 rotate-[1deg] border-2 border-black bg-[#ffb020] px-4 py-1 shadow-[5px_5px_0_#000]">
          <span className="text-sm font-black uppercase tracking-widest text-black">Steal it · Drive it · Shake the heat</span>
        </div>
        <button
          type="button"
          onClick={() => commands.run("game.start", {})}
          className="mt-10 -skew-x-6 border-4 border-black bg-[#3fbf5a] px-12 py-3 text-2xl font-black uppercase tracking-wider text-black shadow-[8px_8px_0_#000] transition-transform hover:scale-105 hover:bg-[#5fdf7a]"
        >
          ▶ Hit the Street
        </button>
        <div className="mt-6 flex gap-2">
          {["WASD move", "E enter · F exit", "Mouse fire", "1-4 weapons"].map((hint) => (
            <span key={hint} className="border-2 border-black bg-[#12141a]/80 px-2 py-0.5 text-[10px] font-black uppercase text-[#f4e8c8]">
              {hint}
            </span>
          ))}
        </div>
      </div>
      <div className="absolute bottom-3 text-[10px] font-bold uppercase tracking-widest text-black/60">
        An homage to Grand Theft Auto (Rockstar Games) in the look of Borderlands (Gearbox)
      </div>
    </div>
  );
}
