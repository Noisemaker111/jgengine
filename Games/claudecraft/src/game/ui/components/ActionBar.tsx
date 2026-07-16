import { AbilityButton, KeyHint, StatBar } from "@jgengine/react";
import { GameIcon } from "@jgengine/react/gameIcons";
import { useEntityStat, useGame, useGameStore, useHudTick, usePlayer } from "@jgengine/react/hooks";
import { useKeyedStore } from "@jgengine/react/store";
import { useGameContext } from "@jgengine/react/provider";

import { classById } from "../../classes/catalog";
import type { AbilityDef } from "../../model";
import { heroOf } from "../../session/hero";
import { barStore, castStore, classStore, restedStore } from "../../session/stores";

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
  const ctx = useGameContext();
  const { commands } = useGame();
  const hero = heroOf(ctx, userId);
  if (hero === null) return null;
  const locked = ability.levelReq > level;
  return (
    <AbilityButton
      kit={hero.kit}
      slotId={ability.id}
      resourceAvailable={resource}
      size={46}
      chromeless
      keepEnabled
      className={`wcc-slot flex items-center justify-center transition ${locked ? "grayscale" : ""}`}
      style={{ color: locked ? "#57534e" : "#f0ebd8" }}
      onActivate={() => commands.run(`castSlot${index + 1}`, {})}
      icon={<GameIcon name={ability.icon} size={26} />}
      sweep="vertical"
      sweepColor="rgba(0,0,0,0.75)"
      cooldownText={(ms) => Math.ceil(ms / 1000)}
      cooldownTextClassName="wcc-title"
      cooldownTextStyle={{ fontSize: 17, fontWeight: 700, color: undefined, textShadow: undefined }}
      noResourceStyle={{ color: "#ff8f85", filter: "saturate(0.5)" }}
      flashStyle={{ boxShadow: "0 0 10px #ffd100aa, inset 0 0 6px #ffd10066" }}
      dimmed={hero.gcdUntil > now}
      dimStyle={{ background: "rgba(0,0,0,0.4)" }}
      locked={locked}
      wrapLock={false}
      lockLabel={
        <span className="absolute inset-x-0 bottom-0 bg-black/85 text-center text-[9px] font-semibold text-stone-500">
          Lv {ability.levelReq}
        </span>
      }
      keyHint={
        <KeyHint className="absolute right-0.5 top-0.5 text-[9px] font-bold text-[#c8a838] [text-shadow:1px_1px_1px_#000]">
          {index + 1}
        </KeyHint>
      }
      wrapKeyHint={false}
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
      title={`${ability.name}${ability.cost > 0 ? ` · ${ability.cost}` : ""}${ability.cooldown > 0 ? ` · ${ability.cooldown}s cd` : ""}`}
    />
  );
}

export function ActionBar() {
  useHudTick();
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
              <KeyHint className="absolute right-0.5 top-0.5 text-[9px] font-bold text-stone-600">
                {index + 1}
              </KeyHint>
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
  useHudTick();
  const { userId } = usePlayer();
  const cast = useKeyedStore(castStore, userId);
  const now = useGameStore((ctx) => ctx.time.now());
  if (cast === null) return null;
  const fraction = Math.max(0, Math.min(1, (now - cast.startedAt) / (cast.endAt - cast.startedAt)));
  return (
    <div className="w-[300px]">
      <StatBar
        value={fraction}
        max={1}
        fill="linear-gradient(#ffe48a, #c9941a 60%, #9a6f12)"
        chromeless
        width="100%"
        railHeight={24}
        railRadius={4}
        railClassName="wcc-bar-rail"
        label={cast.name}
        labelPlacement="inside"
        labelClassName="wcc-title"
        labelStyle={{ fontSize: 12, color: undefined, textShadow: undefined }}
        showValue={false}
      />
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
  const caption = capped
    ? "Level 20 — the road ends at the Hollow Crypt"
    : `${xp.current} / ${xp.max} XP${rested > 0 ? ` · rested ${Math.round(rested)}` : ""}`;
  return (
    <div className="pointer-events-none w-[612px] max-w-[86vw]">
      <StatBar
        value={xp.current}
        max={Math.max(1, xp.max)}
        capped={capped}
        fill="linear-gradient(#b85eff, #6a1bb0)"
        fillCapped="linear-gradient(#ffe48a, #c9941a 60%, #9a6f12)"
        underlay={restedFraction > fraction ? { fraction: restedFraction, color: "#4a9eff66" } : undefined}
        chromeless
        width="100%"
        railHeight={10}
        railRadius={0}
        railClassName="wcc-bar-rail"
        labelPlacement="below"
        label={caption}
        labelStyle={{ marginTop: 2, textAlign: "center", fontSize: 10, fontWeight: 500, color: "#b974ff", textShadow: "0 1px 2px rgba(0,0,0,0.9)", opacity: 1 }}
        showValue={false}
      />
    </div>
  );
}
