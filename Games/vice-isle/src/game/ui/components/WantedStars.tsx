import { useGameStore } from "@jgengine/react/hooks";
import { MAX_STARS, WANTED_STORE_KEY, type WantedSnapshot } from "../../handroll";

export function WantedStars() {
  const wanted = useGameStore((ctx) => (ctx.game.store.get(WANTED_STORE_KEY) as WantedSnapshot | undefined) ?? null);
  const stars = wanted?.stars ?? 0;
  return (
    <div
      className={`flex gap-1.5 -skew-x-6 border-2 border-black px-3 py-1 shadow-[4px_4px_0_#000] ${
        stars >= 3 ? "bg-[#5a1414]/90" : "bg-[#12141a]/85"
      }`}
    >
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <span
          key={i}
          className={`text-2xl leading-none drop-shadow-[1px_1px_0_#000] ${
            i < stars ? "text-[#ffb020]" : "text-[#3a3d46]"
          } ${i < stars && stars >= 3 ? "animate-pulse" : ""}`}
        >
          ★
        </span>
      ))}
    </div>
  );
}
