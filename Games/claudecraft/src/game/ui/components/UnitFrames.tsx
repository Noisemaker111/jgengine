import { HealthBar, ManaBar, barTokens, type AtomicBarProps } from "@jgengine/react/bars";
import { GameIcon, type GameIconName } from "@jgengine/react/gameIcons";
import { useEntityStat, useGameStore, usePlayer, useTarget } from "@jgengine/react/hooks";
import type { CSSProperties, FC } from "react";
import { useKeyedStore } from "@jgengine/react/store";
import { useGameContext } from "@jgengine/react/provider";

import { classById } from "../../classes/catalog";
import { mobById } from "../../entities/enemies/catalog";
import { NPCS } from "../../entities/npcs/catalog";
import { mobRuntimeOf } from "../../ai/mobs";
import { autoAttackStore, aurasStore, classStore, nameStore, petStore } from "../../session/stores";
import { RESOURCE_COLORS } from "../theme";

// The Warcraft-ish rail (#1033): the `wcc-bar-rail` look expressed as shared vitals tokens, so the
// bars come from the atomic `HealthBar`/`ManaBar` with a per-instance `fill` for the class color.
const RAIL_TOKENS: CSSProperties = {
  ...barTokens({ track: "#1a1a1a", frame: "#000000", frameWidth: "1px", height: "15px", radius: "0px", bevel: "none", text: "#ffffff" }),
};

/** Pulls the hex out of a `bg-[#rrggbb]` Tailwind class (or passes a hex through). */
function hexOf(fill: string): string {
  return fill.match(/#[0-9a-fA-F]{6}/)?.[0] ?? fill;
}

function Bar({
  value,
  max,
  fill,
  label,
  Component = HealthBar,
}: {
  value: number;
  max: number;
  fill: string;
  label?: string;
  Component?: FC<AtomicBarProps>;
}) {
  return (
    <Component
      value={value}
      max={max}
      fill={hexOf(fill)}
      width="100%"
      style={RAIL_TOKENS}
      {...(label === undefined ? {} : { label, showValue: false })}
    />
  );
}

function AuraRow({ instanceId }: { instanceId: string }) {
  const auras = useKeyedStore(aurasStore, instanceId);
  if (auras.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {auras.map((aura) => (
        <span
          key={aura.id}
          title={aura.name}
          className={`flex h-7 w-7 items-center justify-center rounded-[3px] border ${
            aura.kind === "dot"
              ? "border-[#c0392b] bg-[#2a0d0a] text-[#ff8f85]"
              : "border-[#3a6ea8] bg-[#0a1520] text-[#9fc4e0]"
          }`}
        >
          <GameIcon name={aura.icon} size={17} />
        </span>
      ))}
    </div>
  );
}

function Portrait({
  icon,
  color,
  level,
  hostile,
}: {
  icon: GameIconName;
  color: string;
  level: number | string;
  hostile?: boolean;
}) {
  return (
    <div className="relative h-16 w-16 shrink-0">
      <span
        className="flex h-[60px] w-[60px] items-center justify-center rounded-full border-2 bg-[radial-gradient(circle_at_35%_30%,#2c2c3a,#15151f)]"
        style={{ borderColor: hostile === true ? "#8a2a20" : "#6f5a2a", color }}
      >
        <GameIcon name={icon} size={30} />
      </span>
      <span
        className="wcc-title absolute -bottom-0.5 -left-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#6f5a2a] bg-[#15151f] text-[11px] font-bold"
        style={{ outline: "1px solid #000" }}
      >
        {level}
      </span>
    </div>
  );
}

export function PlayerFrame() {
  const { userId } = usePlayer();
  const classId = useKeyedStore(classStore, userId);
  const name = useKeyedStore(nameStore, userId);
  const health = useEntityStat(userId, "health");
  const resource = useEntityStat(userId, "resource");
  const level = useEntityStat(userId, "level");
  const pet = useKeyedStore(petStore, userId);
  if (classId === null || health === null) return null;
  const cls = classById(classId);
  return (
    <div>
      <div className="flex items-center">
        <Portrait icon={cls.icon} color={cls.color} level={level?.current ?? 1} />
        <div className="wcc-panel w-[190px] rounded-l-none px-2 py-1.5">
          <div className="wcc-title truncate text-xs">{name ?? cls.name}</div>
          <div className="mt-0.5 space-y-0.5">
            <Bar value={health.current} max={health.max} fill="bg-[#1eb838]" />
            <Bar
              value={resource?.current ?? 0}
              max={resource?.max ?? 100}
              fill={RESOURCE_COLORS[cls.resource] ?? "bg-[#2b7bd4]"}
              Component={ManaBar}
            />
          </div>
        </div>
      </div>
      <AuraRow instanceId={userId} />
      {pet !== null && (
        <div className="wcc-panel mt-1.5 w-[190px] px-2 py-1">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="truncate font-semibold text-[#9fdc7f]">
              {pet.name}
              {!pet.alive ? " (fallen)" : ""}
            </span>
            <span className="text-[#998d6a]">{pet.role}</span>
          </div>
          <div className="mt-0.5">
            <Bar value={pet.hp} max={Math.max(1, pet.maxHp)} fill="bg-[#1eb838]" />
          </div>
        </div>
      )}
    </div>
  );
}

export function TargetFrame() {
  const ctx = useGameContext();
  const { userId } = usePlayer();
  const targetId = useTarget(userId);
  const health = useEntityStat(targetId ?? "", "health");
  const targetName = useGameStore((ctx) => (targetId === null ? null : (ctx.scene.entity.get(targetId)?.name ?? null)));
  const autoAttack = useKeyedStore(autoAttackStore, userId);
  if (targetId === null || targetName === null || health === null) return null;
  const runtime = mobRuntimeOf(ctx, targetId);
  const mob = mobById(runtime?.defId ?? targetName);
  const npc = NPCS.find((entry) => `npc:${entry.id}` === targetId);
  const display = mob?.name ?? npc?.name ?? targetName;
  const hostile = runtime !== null;
  return (
    <div>
      <div className="flex items-center">
        <div className="wcc-panel w-[190px] rounded-r-none px-2 py-1.5">
          <div className="flex items-baseline justify-between">
            <span
              className="truncate text-xs font-semibold [text-shadow:1px_1px_2px_#000]"
              style={{ color: hostile ? "#ff6b5e" : "#9fdc7f", fontFamily: "var(--wcc-font-display)" }}
            >
              {display}
              {autoAttack ? " ⚔" : ""}
              {mob?.boss === true ? " ☠" : ""}
            </span>
          </div>
          <div className="mt-0.5">
            <Bar value={health.current} max={health.max} fill="bg-[#1eb838]" />
          </div>
        </div>
        <Portrait
          icon={(hostile ? "skull" : "shield") as GameIconName}
          color={hostile ? "#ff6b5e" : "#9fdc7f"}
          level={runtime !== null ? runtime.level : "•"}
          hostile={hostile}
        />
      </div>
      <AuraRow instanceId={targetId} />
    </div>
  );
}
