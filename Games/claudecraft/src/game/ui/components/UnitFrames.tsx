import { GameIcon, type GameIconName } from "@jgengine/react/gameIcons";
import { useEntityStat, useGameStore, usePlayer, useTarget } from "@jgengine/react/hooks";

import { classById } from "../../classes/catalog";
import { mobById } from "../../entities/enemies/catalog";
import { NPCS } from "../../entities/npcs/catalog";
import { mobRuntimeOf } from "../../ai/mobs";
import type { AuraState } from "../../session/hero";
import { RESOURCE_COLORS } from "../theme";

function Bar({
  value,
  max,
  fill,
  label,
}: {
  value: number;
  max: number;
  fill: string;
  label?: string;
}) {
  const fraction = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="wcc-bar-rail relative h-[15px] overflow-hidden">
      <div className={`h-full ${fill} transition-[width] duration-150`} style={{ width: `${fraction * 100}%` }}>
        <div className="h-1/2 w-full bg-white/15" />
      </div>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
        {label ?? `${Math.round(value)} / ${Math.round(max)}`}
      </span>
    </div>
  );
}

function AuraRow({ instanceId }: { instanceId: string }) {
  const auras = useGameStore(
    (ctx) => (ctx.game.store.get(`auras:${instanceId}`) as AuraState[] | undefined) ?? [],
  );
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
          <GameIcon name={aura.icon as GameIconName} size={17} />
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
  const classId = useGameStore((ctx) => ctx.game.store.get(`class:${userId}`)) as string | undefined;
  const health = useEntityStat(userId, "health");
  const resource = useEntityStat(userId, "resource");
  const level = useEntityStat(userId, "level");
  const pet = useGameStore(
    (ctx) =>
      ctx.game.store.get(`pet:${userId}`) as
        | { name: string; alive: boolean; hp: number; maxHp: number; role: string }
        | undefined,
  );
  if (classId === undefined || health === null) return null;
  const cls = classById(classId);
  return (
    <div>
      <div className="flex items-center">
        <Portrait icon={cls.icon as GameIconName} color={cls.color} level={level?.current ?? 1} />
        <div className="wcc-panel w-[190px] rounded-l-none px-2 py-1.5">
          <div className="wcc-title truncate text-xs">{cls.name}</div>
          <div className="mt-0.5 space-y-0.5">
            <Bar value={health.current} max={health.max} fill="bg-[#1eb838]" />
            <Bar
              value={resource?.current ?? 0}
              max={resource?.max ?? 100}
              fill={RESOURCE_COLORS[cls.resource] ?? "bg-[#2b7bd4]"}
            />
          </div>
        </div>
      </div>
      <AuraRow instanceId={userId} />
      {pet !== undefined && (
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
  const { userId } = usePlayer();
  const targetId = useTarget(userId);
  const health = useEntityStat(targetId ?? "", "health");
  const targetName = useGameStore((ctx) => (targetId === null ? null : (ctx.scene.entity.get(targetId)?.name ?? null)));
  const autoAttack = useGameStore((ctx) => ctx.game.store.get(`autoattack:${userId}`) === true);
  if (targetId === null || targetName === null || health === null) return null;
  const runtime = mobRuntimeOf(targetId);
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
