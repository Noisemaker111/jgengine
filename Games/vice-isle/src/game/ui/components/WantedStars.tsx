import { useStore } from "@jgengine/react/store";
import { MAX_STARS, wantedStore } from "../../handroll";

export function WantedStars() {
  const wanted = useStore(wantedStore);
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
