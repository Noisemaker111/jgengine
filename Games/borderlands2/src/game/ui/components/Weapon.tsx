import { useEntityStat, useGameStore, useInventory, usePlayer } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { AMMO_LABELS, AMMO_STAT_IDS } from "../../ammo";
import { gunById, magState, type GunDef } from "../../handroll";
import { ELEMENT_COLORS, RARITY_COLORS } from "../../palette";
import { lastPickupStore, selectedSlotStore } from "../../stores";

export function useSelectedSlot(): number {
  return useStore(selectedSlotStore);
}

function useNowMs(): number {
  return useGameStore((ctx) => ctx.time.now() * 1000);
}

export function AmmoPlate() {
  const { userId } = usePlayer();
  const selected = useSelectedSlot();
  const slots = useInventory("hotbar");
  const nowMs = useNowMs();
  const stack = slots[selected] ?? null;
  const gun = stack === null ? undefined : gunById(stack.itemId);
  const reserve = useEntityStat(userId, AMMO_STAT_IDS[gun?.ammo ?? "pistol"]);
  const grenades = useEntityStat(userId, "grenades");

  if (gun === undefined) {
    return <div className="text-sm font-bold uppercase tracking-widest text-stone-400">No weapon — find a gun</div>;
  }
  const mag = magState(gun);
  const reloading = mag.reloadingUntilMs > nowMs;

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="text-right">
        <div
          className="text-sm font-black uppercase tracking-widest drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]"
          style={{ color: RARITY_COLORS[gun.rarity] }}
        >
          {gun.name}
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-300">
          {gun.manufacturer} {gun.family} · lv{gun.level} · {gun.weapon.damage} dmg
          {gun.element !== "none" ? (
            <span style={{ color: ELEMENT_COLORS[gun.element] }}> · {gun.element}</span>
          ) : null}
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={`text-5xl font-black tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] ${
            reloading ? "animate-pulse text-amber-300" : mag.inMag === 0 ? "animate-pulse text-rose-400" : "text-stone-50"
          }`}
        >
          {reloading ? "—" : mag.inMag}
        </span>
        <span className="text-lg font-bold tabular-nums text-stone-400">/ {Math.round(reserve?.current ?? 0)}</span>
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
        {reloading ? "RELOADING…" : `${AMMO_LABELS[gun.ammo]} ammo · [R] reload`} · ✜ {Math.round(grenades?.current ?? 0)}
      </div>
    </div>
  );
}

export function Hotbar() {
  const selected = useSelectedSlot();
  const slots = useInventory("hotbar");
  return (
    <div className="flex gap-1.5">
      {[0, 1, 2, 3].map((index) => {
        const stack = slots[index] ?? null;
        const gun = stack === null ? undefined : gunById(stack.itemId);
        const active = index === selected;
        return (
          <div
            key={index}
            className={`flex h-11 w-24 skew-x-[-8deg] flex-col items-center justify-center border-2 px-1 ${
              active ? "border-amber-400 bg-black/80" : "border-black/70 bg-black/55"
            }`}
          >
            <span className="text-[9px] font-bold text-stone-500">{index + 1}</span>
            {gun !== undefined ? (
              <span
                className="max-w-full truncate text-[10px] font-black uppercase"
                style={{ color: RARITY_COLORS[gun.rarity] }}
              >
                {gun.name}
              </span>
            ) : (
              <span className="text-[10px] text-stone-600">empty</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ItemCard() {
  const nowMs = useNowMs();
  const pickup = useStore(lastPickupStore);
  if (pickup === null || nowMs - pickup.atMs > 5000) return null;
  const gun: GunDef | undefined = gunById(pickup.gunId);
  if (gun === undefined) return null;
  return (
    <div
      className="w-64 border-2 bg-black/85 p-3 shadow-[0_4px_16px_rgba(0,0,0,0.8)]"
      style={{ borderColor: RARITY_COLORS[gun.rarity] }}
    >
      <div className="text-sm font-black uppercase tracking-wider" style={{ color: RARITY_COLORS[gun.rarity] }}>
        {gun.name}
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">
        {gun.rarity} {gun.manufacturer} {gun.family} · level {gun.level}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] font-semibold text-stone-200">
        <span>Damage</span>
        <span className="text-right tabular-nums">{gun.weapon.damage}{gun.weapon.pellets !== undefined ? ` ×${gun.weapon.pellets}` : ""}</span>
        <span>Fire rate</span>
        <span className="text-right tabular-nums">{(1000 / gun.weapon.fireIntervalMs).toFixed(1)}/s</span>
        <span>Magazine</span>
        <span className="text-right tabular-nums">{gun.magSize}</span>
        <span>Crit</span>
        <span className="text-right tabular-nums">{Math.round(gun.weapon.critChance * 100)}% ×{gun.weapon.critMult}</span>
        {gun.element !== "none" ? (
          <>
            <span style={{ color: ELEMENT_COLORS[gun.element] }}>Element</span>
            <span className="text-right uppercase" style={{ color: ELEMENT_COLORS[gun.element] }}>
              {gun.element}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
