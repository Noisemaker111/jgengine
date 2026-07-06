import { useCurrency } from "@jgengine/react/hooks";

export function GoldDisplay() {
  const gold = useCurrency("gold");

  return (
    <div className="flex items-center gap-1.5 text-sm font-bold text-amber-300 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
      <img
        src="/game-assets/wow/icons/treasure-chest-inventory.png"
        alt=""
        className="h-5 w-5 object-cover opacity-90"
        draggable={false}
      />
      <span>{gold.toLocaleString()}</span>
    </div>
  );
}