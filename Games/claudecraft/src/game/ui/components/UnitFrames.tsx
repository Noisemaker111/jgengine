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
    <div className="relative h-4 overflow-hidden rounded-sm bg-stone-950/80 ring-1 ring-black/60">
      <div className={`h-full ${fill} transition-[width] duration-150`} style={{ width: `${fraction * 100}%` }} />
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
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
    <div className="mt-1 flex gap-1">
      {auras.map((aura) => (
        <span
          key={aura.id}
          title={aura.name}
          className={`flex h-6 w-6 items-center justify-center rounded-sm ring-1 ${
            aura.kind === "dot" ? "bg-red-950/90 ring-red-700 text-red-300" : "bg-emerald-950/90 ring-emerald-700 text-emerald-300"
          }`}
        >
          <GameIcon name={aura.icon as GameIconName} size={16} />
        </span>
      ))}
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
    <div className="w-64">
      <div className="flex items-center gap-2">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-md border-2 bg-stone-950/90"
          style={{ borderColor: cls.color, color: cls.color }}
        >
          <GameIcon name={cls.icon as GameIconName} size={28} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between">
            <span className="truncate font-semibold text-amber-100 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
              {cls.name}
            </span>
            <span className="rounded bg-stone-950/80 px-1.5 text-[11px] font-bold text-amber-300 ring-1 ring-amber-900/60">
              {level?.current ?? 1}
            </span>
          </div>
          <div className="mt-0.5 space-y-0.5">
            <Bar value={health.current} max={health.max} fill="bg-emerald-600" />
            <Bar
              value={resource?.current ?? 0}
              max={resource?.max ?? 100}
              fill={RESOURCE_COLORS[cls.resource] ?? "bg-sky-500"}
            />
          </div>
        </div>
      </div>
      <AuraRow instanceId={userId} />
      {pet !== undefined && (
        <div className="mt-2 rounded border border-stone-700/80 bg-stone-950/70 px-2 py-1.5">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="truncate font-semibold text-lime-200">
              {pet.name}
              {!pet.alive ? " (fallen)" : ""}
            </span>
            <span className="text-stone-400">{pet.role}</span>
          </div>
          <div className="mt-0.5">
            <Bar value={pet.hp} max={Math.max(1, pet.maxHp)} fill="bg-lime-600" />
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
  const levelLabel = runtime !== null ? `${runtime.level}` : "";
  return (
    <div className="w-64">
      <div className="flex items-baseline justify-between">
        <span className="truncate font-semibold text-red-200 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
          {display}
          {autoAttack ? " ⚔" : ""}
        </span>
        {levelLabel !== "" && (
          <span className="rounded bg-stone-950/80 px-1.5 text-[11px] font-bold text-red-300 ring-1 ring-red-900/60">
            {levelLabel}
            {mob?.boss === true ? " ☠" : ""}
          </span>
        )}
      </div>
      <div className="mt-0.5">
        <Bar value={health.current} max={health.max} fill="bg-red-600" />
      </div>
      <AuraRow instanceId={targetId} />
    </div>
  );
}
