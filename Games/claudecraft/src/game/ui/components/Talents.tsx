import { GameIcon } from "@jgengine/react/gameIcons";
import { useGame, useGameStore, usePlayer } from "@jgengine/react/hooks";

import { specsForClass } from "../../talents/catalog";
import type { TalentsView } from "../../session/hero";
import { CLOSE_BUTTON, PANEL, PANEL_TITLE } from "../theme";

function pretty(nodeId: string): string {
  const tail = nodeId.split("/").pop() ?? nodeId;
  return tail.replaceAll(/^[a-z]+_/g, "").replaceAll("_", " ");
}

export function TalentPanel() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const classId = useGameStore((ctx) => ctx.game.store.get(`class:${userId}`)) as string | undefined;
  const view = useGameStore((ctx) => ctx.game.store.get(`talents:${userId}`)) as TalentsView | undefined;
  if (classId === undefined) return null;
  const specs = specsForClass(classId);
  const close = () => commands.run("openTalents", {});
  if (view === undefined) {
    return (
      <div className={`${PANEL} pointer-events-auto w-[440px]`}>
        <div className={PANEL_TITLE}>
          <span>Choose a specialization</span>
          <button type="button" className={CLOSE_BUTTON} onClick={close}>
            ✕
          </button>
        </div>
        <div className="space-y-2 px-4 py-3">
          <p className="text-xs text-stone-400">
            Permanent for this hero. Talent points arrive every level from 10.
          </p>
          {specs.map((spec) => (
            <button
              key={spec.id}
              type="button"
              onClick={() => commands.run("talent.choose", { specId: spec.id })}
              className="flex w-full items-center gap-3 rounded border border-stone-700 bg-stone-900/80 px-3 py-2.5 text-left hover:border-amber-500"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded border border-stone-600 text-amber-300">
                <GameIcon name={spec.icon} size={24} />
              </span>
              <span>
                <span className="block font-semibold text-amber-100">{spec.name}</span>
                <span className="block text-[11px] text-stone-500">{spec.nodes.length} talents</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  const spec = specs.find((entry) => entry.id === view.specId);
  if (spec === undefined) return null;
  return (
    <div className={`${PANEL} pointer-events-auto w-[440px] max-h-[72vh] overflow-hidden`}>
      <div className={PANEL_TITLE}>
        <span>
          {spec.name} · <span className="text-amber-400">{view.pointsAvailable} points</span>
        </span>
        <button type="button" className={CLOSE_BUTTON} onClick={close}>
          ✕
        </button>
      </div>
      <div className="max-h-[58vh] space-y-1 overflow-y-auto px-4 py-3">
        {spec.nodes.map((node) => {
          const rank = view.ranks[node.id] ?? 0;
          const maxed = rank >= node.maxRank;
          const gated =
            node.requiresPointsInBranch !== undefined && view.pointsSpent < node.requiresPointsInBranch;
          return (
            <button
              key={node.id}
              type="button"
              disabled={maxed || gated || view.pointsAvailable <= 0}
              onClick={() => commands.run("talent.allocate", { nodeId: node.id })}
              className={`flex w-full items-center justify-between rounded border px-3 py-2 text-left text-sm ${
                maxed
                  ? "border-amber-700 bg-amber-950/50 text-amber-200"
                  : gated
                    ? "border-stone-800 text-stone-600"
                    : "border-stone-700 bg-stone-900/70 text-stone-200 hover:border-amber-500"
              }`}
            >
              <span className="capitalize">
                {pretty(node.id)}
                {gated && node.requiresPointsInBranch !== undefined && (
                  <span className="ml-2 text-[10px] text-stone-500">
                    needs {node.requiresPointsInBranch} pts spent
                  </span>
                )}
              </span>
              <span className={`font-bold ${maxed ? "text-amber-300" : "text-stone-400"}`}>
                {rank}/{node.maxRank}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
