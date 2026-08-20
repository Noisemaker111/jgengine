import { useEffect, useRef, useState } from "react";
import { HudCanvas, useHudLayout } from "@jgengine/react";
import { useGameContext, useGameStore, useTicker } from "@jgengine/react";

import { outcome } from "../../loop";

function usePlayerTelemetry() {
  const ctx = useGameContext();
  const tick = useTicker(12);
  const prev = useRef<{ pos: readonly [number, number, number]; time: number } | null>(null);
  const [telemetry, setTelemetry] = useState({ speed: 0, vspeed: 0, altitude: 0, pos: [0, 0, 0] as const });

  useEffect(() => {
    const player = ctx.scene.entity.get(ctx.player.userId);
    if (player === null) return;
    const pos = player.position as readonly [number, number, number];
    const ground = ctx.world.groundHeightAt(pos[0], pos[2]);
    const altitude = pos[1] - ground;
    const now = performance.now();
    let speed = 0;
    let vspeed = 0;
    if (prev.current !== null) {
      const dt = (now - prev.current.time) / 1000;
      if (dt > 0.001) {
        const dx = pos[0] - prev.current.pos[0];
        const dy = pos[1] - prev.current.pos[1];
        const dz = pos[2] - prev.current.pos[2];
        speed = Math.hypot(dx, dy, dz) / dt;
        vspeed = dy / dt;
      }
    }
    prev.current = { pos, time: now };
    setTelemetry({ speed, vspeed, altitude, pos: [pos[0], pos[1], pos[2]] });
    // tick is dependency to re-run every 12hz
    void tick;
  }, [ctx, tick]);

  return telemetry;
}

function FlightHud() {
  const telemetry = usePlayerTelemetry();
  const pos = telemetry.pos;
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-30 flex flex-col gap-2 font-mono text-xs">
      <div className="rounded bg-slate-900/85 px-3 py-2 text-slate-100 shadow">
        <div className="font-sans text-[11px] font-bold tracking-widest text-cyan-300">FLIGHT LAB</div>
        <div className="mt-1 space-y-0.5 text-[11px] leading-tight">
          <div>W/A/S/D — yaw-relative strafe (A left +X, D right -X)</div>
          <div>Space — ascend &nbsp;|&nbsp; Ctrl/C — descend &nbsp;|&nbsp; Shift — sprint ×2.2</div>
          <div className="pt-1 text-slate-400">Runway Z ±100 (crate every 20m) · Gates at 12/18/24m · Pillars X=±40 at 10/20/30/50/80/100m</div>
          <div className="text-slate-400">Grid 30m · Wall at Z=150 · Terrain hills ±12m · Center flat 55m</div>
        </div>
      </div>
      <div className="rounded bg-slate-900/85 px-3 py-2 text-slate-100 shadow">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <div className="text-slate-400">POS</div>
          <div>{pos[0].toFixed(1)}, {pos[1].toFixed(1)}, {pos[2].toFixed(1)}</div>
          <div className="text-slate-400">ALT</div>
          <div>{telemetry.altitude.toFixed(1)} m</div>
          <div className="text-slate-400">SPEED</div>
          <div>{telemetry.speed.toFixed(1)} m/s · {(telemetry.speed * 3.6).toFixed(0)} km/h</div>
          <div className="text-slate-400">V-SPEED</div>
          <div>{telemetry.vspeed.toFixed(1)} m/s</div>
        </div>
      </div>
    </div>
  );
}

export function GameUI() {
  const layout = useHudLayout({ storageKey: "flight-lab" });
  const status = useGameStore((ctx) => {
    // outcome is global, but also subscribe to ctx version to re-render on win
    void ctx.version();
    return outcome.get();
  });

  const tone = status.won
    ? "bg-emerald-600/90 text-white"
    : status.tone === "warn"
      ? "bg-amber-600/90 text-white"
      : "bg-slate-800/85 text-slate-100";
  return (
    <>
      <HudCanvas layout={layout} className="z-20 font-sans text-slate-100" />
      <FlightHud />
      {status.message !== null ? (
        <div className={"pointer-events-none absolute left-1/2 top-6 z-30 -translate-x-1/2 rounded-lg px-4 py-2 text-center font-sans text-sm font-semibold shadow-lg " + tone}>
          {status.message}
        </div>
      ) : null}
    </>
  );
}
