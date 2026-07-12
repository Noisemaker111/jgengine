import { useGameStore } from "@jgengine/react/hooks";
import { DRIVING_STORE_KEY, handroll } from "../../handroll";
import { vehicleById } from "../../entities/vehicles/catalog";

export function Speedo() {
  const drivingId = useGameStore((ctx) => (ctx.game.store.get(DRIVING_STORE_KEY) as string | null | undefined) ?? null);
  const vehicleName = useGameStore((ctx) => {
    const id = ctx.game.store.get(DRIVING_STORE_KEY) as string | null | undefined;
    if (id === null || id === undefined) return null;
    return ctx.scene.entity.get(id)?.name ?? null;
  });
  if (drivingId === null) return null;
  const label = vehicleName !== null ? (vehicleById(vehicleName)?.label ?? "Car") : "Car";
  const kmh = Math.round(handroll.carSpeedKmh());
  return (
    <div className="flex items-end gap-2">
      <div className="-skew-x-12 border-2 border-black bg-[#12141a]/90 px-3 py-1 shadow-[3px_3px_0_#000]">
        <span className="text-3xl font-black tabular-nums text-[#ffb020]">{kmh}</span>
        <span className="ml-1 text-xs font-black uppercase text-[#cfd6de]">km/h</span>
      </div>
      <div className="-skew-x-6 border-2 border-black bg-[#33c1b1] px-2 py-0.5 text-[11px] font-black uppercase text-black">
        {label} · F to exit
      </div>
    </div>
  );
}
