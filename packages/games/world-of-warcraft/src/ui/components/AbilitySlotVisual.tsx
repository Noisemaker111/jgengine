import { abilityVisualFor } from "../wowStyles";

export function AbilitySlotVisual({ itemId, count }: { itemId: string; count: number }) {
  const visual = abilityVisualFor(itemId);
  const Icon = visual.icon;

  return (
    <>
      {visual.imageUrl !== undefined ? (
        <img
          src={visual.imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <>
          <div className={["absolute inset-0 bg-gradient-to-br opacity-90", visual.gradient].join(" ")} />
          <Icon className={["relative z-[1] h-8 w-8 drop-shadow-md", visual.accent].join(" ")} strokeWidth={2.25} />
        </>
      )}
      {count > 1 ? (
        <span className="absolute bottom-1 right-1 z-[2] rounded bg-black/75 px-1 text-[11px] font-bold text-amber-100">
          {count}
        </span>
      ) : null}
    </>
  );
}
