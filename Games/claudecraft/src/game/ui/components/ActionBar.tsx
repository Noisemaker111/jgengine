import { GameIcon, type GameIconName } from "@jgengine/react/gameIcons";
import { useEntityStat, useGame, useGameStore, usePlayer } from "@jgengine/react/hooks";
import { useEffect, useState } from "react";

import { classById } from "../../classes/catalog";
import type { AbilityDef } from "../../model";
import { heroOf, type CastState } from "../../session/hero";

function useHudTicker(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 100);
    return () => clearInterval(timer);
  }, []);
  return tick;
}

function Slot({
  ability,
  index,
  userId,
  level,
  resource,
  now,
}: {
  ability: AbilityDef;
  index: number;
  userId: string;
  level: number;
  resource: number;
  now: number;
}) {
  const { commands } = useGame();
  const hero = heroOf(userId);
  const snapshot = hero?.kit.state(ability.id, resource) ?? null;
  const locked = ability.levelReq > level;
  const onGcd = hero !== null && hero.gcdUntil > now;
  const cooldownFraction = snapshot?.cooldownFraction ?? 0;
  const noResource = snapshot?.state === "no-resource";
  const justCast = snapshot?.justCast === true;
  return (
    <button
      type="button"
      onClick={() => commands.run(`castSlot${index + 1}`, {})}
      title={`${ability.name}${ability.cost > 0 ? ` · ${ability.cost}` : ""}${ability.cooldown > 0 ? ` · ${ability.cooldown}s cd` : ""}`}
      className={`relative flex h-12 w-12 items-center justify-center rounded-md border bg-stone-950/85 transition ${
        locked
          ? "border-stone-800 text-stone-700"
          : noResource
            ? "border-red-900 text-red-400/70"
            : "border-stone-600 text-amber-100 hover:border-amber-400"
      } ${justCast ? "ring-2 ring-amber-300" : ""}`}
    >
      <GameIcon name={ability.icon as GameIconName} size={26} />
      {cooldownFraction > 0 && !locked && (
        <span
          className="absolute inset-0 rounded-md bg-stone-950/80"
          style={{ clipPath: `inset(${(1 - cooldownFraction) * 100}% 0 0 0)` }}
        />
      )}
      {cooldownFraction > 0 && !locked && snapshot !== null && (
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-amber-200">
          {Math.ceil(snapshot.cooldownRemainingMs / 1000)}
        </span>
      )}
      {onGcd && !locked && cooldownFraction === 0 && (
        <span className="absolute inset-0 rounded-md bg-stone-950/50" />
      )}
      {locked && (
        <span className="absolute inset-x-0 bottom-0 rounded-b-md bg-stone-950/90 text-center text-[9px] font-semibold text-stone-500">
          Lv {ability.levelReq}
        </span>
      )}
      <kbd className="absolute right-0.5 top-0.5 rounded bg-stone-800/90 px-1 text-[9px] font-bold text-amber-300">
        {index + 1}
      </kbd>
    </button>
  );
}

export function ActionBar() {
  useHudTicker();
  const { userId } = usePlayer();
  const classId = useGameStore((ctx) => ctx.game.store.get(`class:${userId}`)) as string | undefined;
  const gameNow = useGameStore((ctx) => ctx.time.now());
  const level = useEntityStat(userId, "level")?.current ?? 1;
  const resource = useEntityStat(userId, "resource")?.current ?? 0;
  if (classId === undefined) return null;
  const cls = classById(classId);
  return (
    <div className="flex items-end gap-1.5">
      {cls.abilities.map((ability, index) => (
        <Slot
          key={ability.id}
          ability={ability}
          index={index}
          userId={userId}
          level={level}
          resource={resource}
          now={gameNow}
        />
      ))}
    </div>
  );
}

export function CastBar() {
  useHudTicker();
  const { userId } = usePlayer();
  const cast = useGameStore((ctx) => ctx.game.store.get(`cast:${userId}`)) as CastState | undefined;
  const now = useGameStore((ctx) => ctx.time.now());
  if (cast === undefined) return null;
  const fraction = Math.max(0, Math.min(1, (now - cast.startedAt) / (cast.endAt - cast.startedAt)));
  return (
    <div className="w-56">
      <div className="relative h-4 overflow-hidden rounded-sm bg-stone-950/85 ring-1 ring-amber-900/60">
        <div className="h-full bg-amber-500/90" style={{ width: `${fraction * 100}%` }} />
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
          {cast.name}
        </span>
      </div>
    </div>
  );
}

export function XpBar() {
  const { userId } = usePlayer();
  const xp = useEntityStat(userId, "xp");
  const level = useEntityStat(userId, "level");
  const classId = useGameStore((ctx) => ctx.game.store.get(`class:${userId}`)) as string | undefined;
  if (classId === undefined || xp === null) return null;
  const capped = (level?.current ?? 1) >= 20;
  const fraction = capped ? 1 : xp.max > 0 ? xp.current / xp.max : 0;
  return (
    <div className="pointer-events-none w-[520px] max-w-[80vw]">
      <div className="relative h-2 overflow-hidden rounded-full bg-stone-950/80 ring-1 ring-black/70">
        <div className="h-full bg-violet-500/90" style={{ width: `${fraction * 100}%` }} />
      </div>
      <p className="mt-0.5 text-center text-[10px] font-medium text-violet-200/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
        {capped ? "Level 20 — the road ends at the Hollow Crypt" : `${xp.current} / ${xp.max} XP`}
      </p>
    </div>
  );
}
