import type { ReactNode } from "react";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { projectToMinimap, type MinimapView } from "@jgengine/core/world/minimap";
import { GUARD_DEFS } from "../../entities/guards";
import { CAMERA_DEFS } from "../../entities/cameras";
import { DOOR_DEFS } from "../../entities/doors";
import { TREASURE_DEFS } from "../../items/treasures";
import { guardPositionAt } from "../../schedule/guardSchedule";
import { cameraAngleAt } from "../../schedule/cameraSchedule";
import { doorStateAt } from "../../schedule/doorSchedule";
import { elapsedSecondsFor, type HeistState } from "../../state/heistState";
import type { HeistUiState } from "../../uiState";
import { PALETTE } from "../palette";

const SIZE = 232;
const VIEW: MinimapView = { center: [15, 10], worldRadius: 27, size: SIZE };

export function MinimapPanel(): ReactNode {
  const { commands } = useGame();
  const data = useGameStore((ctx) => {
    const heist = ctx.game.store.get("heist") as HeistState | undefined;
    const ui = ctx.game.store.get("ui") as HeistUiState | undefined;
    if (heist === undefined) return null;
    const liveElapsed = elapsedSecondsFor(heist, ctx.time.now());
    const scrubbing = ui !== undefined && ui.scrubT !== null;
    const t = scrubbing ? ui!.scrubT! : liveElapsed;
    const player = ctx.scene.entity.get(ctx.player.userId);
    return { t, scrubbing, player, collected: heist.collectedTreasureIds };
  });
  if (data === null) return null;
  const { t, scrubbing, player, collected } = data;

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1">
      <div
        className="relative overflow-hidden rounded-full border-2"
        style={{ width: SIZE, height: SIZE, borderColor: scrubbing ? PALETTE.brass : "#3a4a70", background: "#0b0f1c" }}
      >
        <svg width={SIZE} height={SIZE} className="absolute inset-0">
          {DOOR_DEFS.map((door) => {
            const state = doorStateAt(door, t);
            const p = projectToMinimap(door.gapCenter, VIEW);
            return (
              <circle key={door.id} cx={p.x} cy={p.y} r={4} fill={state.locked ? PALETTE.velvetRed : "#3a4a70"} />
            );
          })}
          {TREASURE_DEFS.filter((treasure) => !collected.includes(treasure.id)).map((treasure) => {
            const p = projectToMinimap([treasure.position[0], treasure.position[2]], VIEW);
            return (
              <text key={treasure.id} x={p.x} y={p.y + 3} fontSize={10} textAnchor="middle" fill={PALETTE.brass}>
                ★
              </text>
            );
          })}
          {CAMERA_DEFS.map((camera) => {
            const angle = cameraAngleAt(camera, t).angle;
            const p = projectToMinimap([camera.position[0], camera.position[2]], VIEW);
            const dx = Math.sin(angle) * 10;
            const dy = -Math.cos(angle) * 10;
            return (
              <g key={camera.id}>
                <circle cx={p.x} cy={p.y} r={3.5} fill={PALETTE.midnightBlue} stroke={PALETTE.brass} strokeWidth={1} />
                <line x1={p.x} y1={p.y} x2={p.x + dx} y2={p.y + dy} stroke={PALETTE.brass} strokeWidth={1.5} />
              </g>
            );
          })}
          {GUARD_DEFS.map((guard) => {
            const pose = guardPositionAt(guard, t);
            const p = projectToMinimap([pose.position[0], pose.position[2]], VIEW);
            const dx = Math.sin(pose.heading) * 9;
            const dy = -Math.cos(pose.heading) * 9;
            return (
              <g key={guard.id}>
                <circle cx={p.x} cy={p.y} r={4} fill={PALETTE.velvetRed} />
                <line x1={p.x} y1={p.y} x2={p.x + dx} y2={p.y + dy} stroke={PALETTE.candlelight} strokeWidth={1.5} />
              </g>
            );
          })}
          {player !== null ? (
            (() => {
              const p = projectToMinimap([player.position[0], player.position[2]], VIEW);
              const dx = Math.sin(player.rotationY) * 8;
              const dy = -Math.cos(player.rotationY) * 8;
              return (
                <g>
                  <circle cx={p.x} cy={p.y} r={5} fill={PALETTE.brass} stroke="#000" strokeWidth={0.5} />
                  <line x1={p.x} y1={p.y} x2={p.x + dx} y2={p.y + dy} stroke="#000" strokeWidth={1.5} />
                </g>
              );
            })()
          ) : null}
        </svg>
      </div>
      <button
        type="button"
        onClick={() => commands.run("ui.minimapScrub", {})}
        className="flex items-center gap-1.5 rounded border border-[#c9a227]/60 bg-[#0b0f1c]/85 px-2 py-1 text-[10px] uppercase tracking-wide text-[#e5d9c3]"
      >
        <kbd className="rounded border border-[#c9a227]/60 bg-black/30 px-1 font-mono">M</kbd>
        {scrubbing ? "Previewing" : "Scrub"}
      </button>
      {scrubbing ? (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => commands.run("ui.setScrub", { t: Math.max(0, t - 30) })}
            className="rounded border border-[#c9a227]/50 bg-[#0b0f1c]/85 px-2 py-1 text-[11px] text-[#e5d9c3]"
          >
            −30s
          </button>
          <button
            type="button"
            onClick={() => commands.run("ui.setScrub", { t: t + 30 })}
            className="rounded border border-[#c9a227]/50 bg-[#0b0f1c]/85 px-2 py-1 text-[11px] text-[#e5d9c3]"
          >
            +30s
          </button>
        </div>
      ) : null}
    </div>
  );
}
