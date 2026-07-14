import { useDisplayProfile } from "@jgengine/react/display";
import { useEntityStat, useGameStoreValue, useInventory, usePlayer } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { AMMO_LABELS, AMMO_POOLS, AMMO_STAT_IDS, MAGAZINE_STAT_ID } from "../../ammo";
import { weaponById } from "../../items/weapons/catalog";
import { RARITY_COLORS } from "../../palette";
import { selectedSlotStore } from "../../run/stores";

const NO_RELOAD = { reloading: false, fraction: 0 };

export function AmmoPanel() {
  const { compact } = useDisplayProfile();
  const { userId } = usePlayer();
  const selected = useStore(selectedSlotStore);
  const slots = useInventory("hotbar");
  const stack = slots[selected] ?? null;
  const weapon = stack === null ? undefined : weaponById(stack.itemId);
  const poolId = weapon?.ammo ?? "light";
  const mag = useEntityStat(userId, MAGAZINE_STAT_ID);
  const reserve = useEntityStat(userId, AMMO_STAT_IDS[poolId]);
  const lightPool = useEntityStat(userId, AMMO_STAT_IDS.light);
  const heavyPool = useEntityStat(userId, AMMO_STAT_IDS.heavy);
  const shellPool = useEntityStat(userId, AMMO_STAT_IDS.shell);
  const energyPool = useEntityStat(userId, AMMO_STAT_IDS.energy);
  const pools = { light: lightPool, heavy: heavyPool, shell: shellPool, energy: energyPool };
  const reload = useGameStoreValue(`weaponReload:${userId}`, NO_RELOAD);
  const loaded = mag?.current ?? 0;
  const empty = loaded < (weapon?.ammoPerShot ?? 1);

  if (compact) {
    return (
      <div className="flex items-baseline gap-1.5">
        <span
          className={`text-3xl font-black tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] ${
            reload.reloading ? "animate-pulse text-amber-300" : empty ? "animate-pulse text-rose-400" : "text-cyan-100"
          }`}
        >
          {reload.reloading ? "…" : Math.round(loaded)}
        </span>
        <span className="text-xs font-bold uppercase text-slate-400">
          / {Math.round(reserve?.current ?? 0)} {AMMO_LABELS[poolId]}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {weapon !== undefined ? (
        <div className="text-right">
          <div
            className="text-sm font-black uppercase tracking-widest drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
            style={{ color: RARITY_COLORS[weapon.rarity] }}
          >
            {weapon.name}
          </div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {weapon.rarity} · {weapon.weapon.damage} dmg
          </div>
        </div>
      ) : (
        <div className="text-sm font-bold uppercase tracking-widest text-slate-500">No weapon</div>
      )}
      <div className="flex items-baseline gap-1.5">
        <span
          className={`text-4xl font-black tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] ${
            reload.reloading ? "animate-pulse text-amber-300" : empty ? "animate-pulse text-rose-400" : "text-cyan-100"
          }`}
        >
          {reload.reloading ? "RELD" : Math.round(loaded)}
        </span>
        <span className="text-sm font-bold uppercase text-slate-400">
          / {Math.round(reserve?.current ?? 0)} {AMMO_LABELS[poolId]}
        </span>
      </div>
      <div className="flex gap-2">
        {AMMO_POOLS.map((pool) => (
          <span
            key={pool}
            className={`text-xs font-semibold tabular-nums ${
              pool === poolId ? "text-cyan-200" : "text-slate-500"
            }`}
          >
            {AMMO_LABELS[pool]} {Math.round(pools[pool]?.current ?? 0)}
          </span>
        ))}
      </div>
    </div>
  );
}
