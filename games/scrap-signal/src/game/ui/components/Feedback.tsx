import { LevelUpFlash } from "@jgengine/core/ui/components.view";
import { useEntityStat, useGameStore, usePlayer } from "@jgengine/react/hooks";
import { usePlayerFov } from "@jgengine/core/camera/PlayerFov.draw";
import { Crosshair } from "@jgengine/core/hud/hudReadouts.view";
import { lastHit, lastHurtAtMs } from "../../feel";
import { handlingView } from "../../handling";

function useNowMs(): number {
  return useGameStore((ctx) => ctx.time.now() * 1000);
}

export function HitMarker() {
  const nowMs = useNowMs();
  const hit = lastHit();
  const age = nowMs - hit.atMs;
  if (age < 0 || age > 220) return null;
  const color = hit.kill ? "#e23c2e" : hit.crit ? "#ffb400" : "#f5f0e6";
  const size = hit.crit || hit.kill ? 30 : 22;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <svg width={size} height={size} viewBox="0 0 24 24" className="scrap-hitmarker">
        <path d="M4 4 L9 9 M20 4 L15 9 M4 20 L9 15 M20 20 L15 15" stroke={color} strokeWidth="2.6" strokeLinecap="square" />
      </svg>
      {hit.kill ? (
        <span className="scrap-hitmarker absolute mt-14 text-xs font-black uppercase tracking-[0.3em] text-rose-400">
          Kill confirmed
        </span>
      ) : null}
    </div>
  );
}

/** Screen pixels from the centre to the edge of a cone `spread` rad wide, at a vertical FOV in degrees. */
export function spreadRadiusPx(spread: number, fovDeg: number, viewportHeight: number): number {
  const half = Math.tan((fovDeg * Math.PI) / 360);
  return half <= 0 ? 0 : (Math.tan(Math.max(0, spread)) / half) * (viewportHeight / 2);
}

/**
 * The crosshair is the held gun's cone: its ticks sit where a round can land, so they open while the
 * gun blooms, while you move, and close as you aim or brace. It disappears through a sniper scope.
 */
/** A dark edge so the cream ticks read against sand and sky alike. */
const RETICLE_OUTLINE = { filter: "drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000) drop-shadow(0 0 3px rgba(0,0,0,0.7))" };

export function SpreadReticle() {
  const view = useGameStore((ctx) => handlingView(ctx));
  const { fov } = usePlayerFov();
  if (view === null) {
    return (
      <div data-reticle-gap={0} className="pointer-events-none absolute inset-0 z-30">
        <Crosshair style={RETICLE_OUTLINE} />
      </div>
    );
  }
  const { spread, adsProgress } = view.handling;
  const zoom = 1 + ((view.presentation?.adsZoom ?? 1) - 1) * adsProgress;
  const gap = Math.max(3, Math.min(90, spreadRadiusPx(spread, fov * zoom, window.innerHeight)));
  return (
    <div data-reticle-gap={Math.round(gap)} className="pointer-events-none absolute inset-0 z-30" style={{ opacity: 1 - adsProgress * 0.35 }}>
      <Crosshair gap={gap} size={gap * 2 + 28} thickness={3} color="#fff4e2" style={RETICLE_OUTLINE} />
    </div>
  );
}

export function DamageVignette() {
  const nowMs = useNowMs();
  const hurtAt = lastHurtAtMs();
  const age = nowMs - hurtAt;
  if (age < 0 || age > 450) return null;
  const strength = 1 - age / 450;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-30"
      style={{ boxShadow: `inset 0 0 ${90 + strength * 80}px ${20 + strength * 40}px rgba(190, 30, 16, ${0.35 * strength + 0.15})` }}
    />
  );
}

export function LevelUpBurst() {
  const { userId } = usePlayer();
  const level = useEntityStat(userId, "level");
  return (
    <LevelUpFlash
      stat="level"
      durationMs={2200}
      className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
    >
      <div className="scrap-levelup flex flex-col items-center">
        <div className="scrap-levelup-ring" />
        <span className="text-4xl font-black uppercase tracking-[0.25em] text-amber-300 drop-shadow-[0_3px_0_#3a2c10]">
          Level Up!
        </span>
        <span className="mt-1 text-base font-black uppercase tracking-[0.4em] text-stone-100">
          Level {level?.current ?? "?"} · +1 skill point
        </span>
      </div>
    </LevelUpFlash>
  );
}
