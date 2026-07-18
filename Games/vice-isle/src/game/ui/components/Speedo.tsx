import { useGameStore } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { drivingStore, handrollOf } from "../../handroll";
import { vehicleById } from "../../entities/vehicles/catalog";

export function Speedo() {
  const drivingId = useStore(drivingStore, (value) => value ?? null);
  const vehicleName = useGameStore((ctx) => {
    const id = drivingStore.read(ctx);
    if (id === null || id === undefined) return null;
    return ctx.scene.entity.get(id)?.name ?? null;
  });
  const telemetry = useGameStore((ctx) => handrollOf(ctx).telemetry());
  if (drivingId === null) return null;
  const label = vehicleName !== null ? (vehicleById(vehicleName)?.label ?? "Vehicle") : "Vehicle";
  const kmh = Math.round(telemetry.speedKmh);
  return (
    <div className="flex items-end gap-2">
      <div className="-skew-x-12 border-2 border-black bg-[#12141a]/90 px-3 py-1 shadow-[3px_3px_0_#000]">
        <span className="text-3xl font-black tabular-nums text-[#ffb020]">{kmh}</span>
        <span className="ml-1 text-xs font-black uppercase text-[#cfd6de]">km/h</span>
      </div>
      <div className="flex max-w-72 flex-col gap-1">
        <div className="-skew-x-6 border-2 border-black bg-[#33c1b1] px-2 py-0.5 text-[11px] font-black uppercase text-black">
          {label} · {telemetry.mode === "ground" ? `G${telemetry.gear} · ${Math.round(telemetry.rpm)} RPM` : `${Math.round(telemetry.altitude)}m · ${telemetry.verticalSpeed >= 0 ? "+" : ""}${telemetry.verticalSpeed.toFixed(1)} m/s`}
        </div>
        {telemetry.mode === "aircraft" ? (
          <div className={`-skew-x-6 border-2 border-black px-2 py-0.5 text-[10px] font-black uppercase ${telemetry.stalled ? "bg-[#ff4d4d] text-white" : "bg-[#12141a]/90 text-[#cfd6de]"}`}>
            {telemetry.stalled ? "STALL · LOWER NOSE" : telemetry.vtol ? "VTOL · V TO TRANSITION" : "W/S PITCH · A/D ROLL · Z/C YAW · ↑/↓ POWER"}
          </div>
        ) : null}
        <div className="text-right text-[9px] font-black uppercase text-white/70">F to exit</div>
      </div>
    </div>
  );
}
