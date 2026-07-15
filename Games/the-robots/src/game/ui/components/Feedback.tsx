import { LevelUpFlash } from "@jgengine/react/components";
import { useEntityStat, useGameStore, usePlayer } from "@jgengine/react/hooks";
import { lastHit, lastHurtAtMs } from "../../feel";

function useNowMs(): number {
  return useGameStore((ctx) => ctx.time.now() * 1000);
}

export function HitMarker() {
  const nowMs = useNowMs();
  const hit = lastHit();
  const age = nowMs - hit.atMs;
  if (hit.atMs === 0 || age < 0 || age > 220) return null;
  const color = hit.kill ? "#e23c2e" : hit.crit ? "#ffb400" : "#f5f0e6";
  const size = hit.crit || hit.kill ? 30 : 22;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <svg width={size} height={size} viewBox="0 0 24 24" className="bl2-hitmarker">
        <path d="M4 4 L9 9 M20 4 L15 9 M4 20 L9 15 M20 20 L15 15" stroke={color} strokeWidth="2.6" strokeLinecap="square" />
      </svg>
      {hit.kill ? (
        <span className="bl2-hitmarker absolute mt-14 text-xs font-black uppercase tracking-[0.3em] text-rose-400">
          Kill confirmed
        </span>
      ) : null}
    </div>
  );
}

export function DamageVignette() {
  const nowMs = useNowMs();
  const hurtAt = lastHurtAtMs();
  const age = nowMs - hurtAt;
  if (hurtAt === 0 || age < 0 || age > 450) return null;
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
      <div className="bl2-levelup flex flex-col items-center">
        <div className="bl2-levelup-ring" />
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
