import { GameIcon } from "@jgengine/react/gameIcons";
import { useEntityStat, useGame, useGameStore, usePlayer } from "@jgengine/react/hooks";
import { useKeyedStore } from "@jgengine/react/store";
import { useEffect, useState } from "react";

import { classById } from "../../classes/catalog";
import type { AbilityDef } from "../../model";
import { heroOf } from "../../session/hero";
import { barStore, castStore, classStore, restedStore } from "../../session/stores";

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
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", `ability:${ability.id}`);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const data = event.dataTransfer.getData("text/plain");
        if (data.startsWith("ability:")) {
          commands.run("spellbook.assign", { abilityId: data.slice(8), slot: index });
        }
      }}
      onClick={() => commands.run(`castSlot${index + 1}`, {})}
      title={`${ability.name}${ability.cost > 0 ? ` · ${ability.cost}` : ""}${ability.cooldown > 0 ? ` · ${ability.cooldown}s cd` : ""}`}
      className={`wcc-slot relative flex h-[46px] w-[46px] items-center justify-center overflow-hidden transition ${
        locked
          ? "text-stone-700 grayscale"
          : noResource
            ? "text-[#ff8f85] saturate-50"
            : "text-[#f0ebd8]"
      }`}
      style={justCast ? { boxShadow: "0 0 10px #ffd100aa, inset 0 0 6px #ffd10066" } : undefined}
    >
      <GameIcon name={ability.icon} size={26} />
      {cooldownFraction > 0 && !locked && (
        <span
          className="absolute inset-x-0 bottom-0 bg-black/75"
          style={{ height: `${cooldownFraction * 100}%` }}
        />
      )}
      {cooldownFraction > 0 && !locked && snapshot !== null && (
        <span className="wcc-title absolute inset-0 flex items-center justify-center text-[17px] font-bold">
          {Math.ceil(snapshot.cooldownRemainingMs / 1000)}
        </span>
      )}
      {onGcd && !locked && cooldownFraction === 0 && <span className="absolute inset-0 bg-black/40" />}
      {locked && (
        <span className="absolute inset-x-0 bottom-0 bg-black/85 text-center text-[9px] font-semibold text-stone-500">
          Lv {ability.levelReq}
        </span>
      )}
      <kbd className="absolute right-0.5 top-0.5 text-[9px] font-bold text-[#c8a838] [text-shadow:1px_1px_1px_#000]">
        {index + 1}
      </kbd>
    </button>
  );
}

export function ActionBar() {
  useHudTicker();
  const { commands } = useGame();
  const { userId } = usePlayer();
  const classId = useKeyedStore(classStore, userId);
  const gameNow = useGameStore((ctx) => ctx.time.now());
  const level = useEntityStat(userId, "level")?.current ?? 1;
  const resource = useEntityStat(userId, "resource")?.current ?? 0;
  const bar = useKeyedStore(barStore, userId);
  if (classId === null) return null;
  const cls = classById(classId);
  return (
    <div className="wcc-panel flex items-end gap-1 p-1.5">
      {Array.from({ length: 9 }, (_, index) => {
        const ability = cls.abilities.find((entry) => entry.id === bar[index]);
        if (ability === undefined) {
          return (
            <span
              key={`empty-${index}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const data = event.dataTransfer.getData("text/plain");
                if (data.startsWith("ability:")) {
                  commands.run("spellbook.assign", { abilityId: data.slice(8), slot: index });
                }
              }}
              className="wcc-slot relative flex h-[46px] w-[46px] items-center justify-center opacity-50"
            >
              <kbd className="absolute right-0.5 top-0.5 text-[9px] font-bold text-stone-600">
                {index + 1}
              </kbd>
            </span>
          );
        }
        return (
          <Slot
            key={ability.id}
            ability={ability}
            index={index}
            userId={userId}
            level={level}
            resource={resource}
            now={gameNow}
          />
        );
      })}
    </div>
  );
}

export function CastBar() {
  useHudTicker();
  const { userId } = usePlayer();
  const cast = useKeyedStore(castStore, userId);
  const now = useGameStore((ctx) => ctx.time.now());
  if (cast === null) return null;
  const fraction = Math.max(0, Math.min(1, (now - cast.startedAt) / (cast.endAt - cast.startedAt)));
  return (
    <div className="w-[300px]">
      <div className="wcc-bar-rail relative h-6 overflow-hidden rounded-[4px]">
        <div
          className="h-full"
          style={{
            width: `${fraction * 100}%`,
            background: "linear-gradient(#ffe48a, #c9941a 60%, #9a6f12)",
          }}
        />
        <span className="wcc-title absolute inset-0 flex items-center justify-center text-[12px]">
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
  const classId = useKeyedStore(classStore, userId);
  const rested = useKeyedStore(restedStore, userId);
  if (classId === null || xp === null) return null;
  const capped = (level?.current ?? 1) >= 20;
  const fraction = capped ? 1 : xp.max > 0 ? xp.current / xp.max : 0;
  const restedFraction = capped || xp.max <= 0 ? 0 : Math.min(1, (xp.current + rested) / xp.max);
  return (
    <div className="pointer-events-none w-[612px] max-w-[86vw]">
      <div className="wcc-bar-rail relative h-[10px] overflow-hidden">
        {restedFraction > fraction && (
          <div
            className="absolute inset-y-0 left-0 bg-[#4a9eff66]"
            style={{ width: `${restedFraction * 100}%` }}
          />
        )}
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${fraction * 100}%`,
            background: capped
              ? "linear-gradient(#ffe48a, #c9941a 60%, #9a6f12)"
              : "linear-gradient(#b85eff, #6a1bb0)",
          }}
        />
      </div>
      <p className="mt-0.5 text-center text-[10px] font-medium text-[#b974ff] [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
        {capped
          ? "Level 20 — the road ends at the Hollow Crypt"
          : `${xp.current} / ${xp.max} XP${rested > 0 ? ` · rested ${Math.round(rested)}` : ""}`}
      </p>
    </div>
  );
}
