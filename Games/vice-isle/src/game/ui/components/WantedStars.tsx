import { useGameStore } from "@jgengine/react/hooks";
import { MAX_STARS, WANTED_STORE_KEY, type WantedSnapshot } from "../../handroll";

export function WantedStars() {
  const wanted = useGameStore((ctx) => (ctx.game.store.get(WANTED_STORE_KEY) as WantedSnapshot | undefined) ?? null);
  const stars = wanted?.stars ?? 0;
  return (
    <div className="flex gap-1 rounded-sm border-2 border-black bg-[#12141a]/85 px-2 py-1 shadow-[3px_3px_0_#000]">
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <span
          key={i}
          className={`text-xl leading-none ${i < stars ? "text-[#ffb020] drop-shadow-[0_0_4px_#ffb020]" : "text-[#3a3d46]"} ${i < stars ? "animate-pulse" : ""}`}
        >
          ★
        </span>
      ))}
    </div>
  );
}
