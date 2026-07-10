import { SkillCheckBar } from "@jgengine/react/components";
import { GameIcon, type GameIconName } from "@jgengine/react/gameIcons";
import { useGame, useGameStore, usePlayer } from "@jgengine/react/hooks";

import { FISHING_CHECK, RECIPES, RECIPE_SKILL, fishingKey } from "../../crafting/systems";
import { itemDefById } from "../../items/catalog";
import { professionsOf } from "../../professions/gathering";
import { CLOSE_BUTTON, PANEL, PANEL_TITLE, QUALITY_COLORS } from "../theme";

export function CraftingPanel() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const skills = useGameStore((ctx) => professionsOf(ctx, userId));
  const counts = useGameStore((ctx) => {
    const map = new Map<string, number>();
    for (const recipe of RECIPES) {
      for (const input of recipe.inputs) {
        if (!map.has(input.itemId)) map.set(input.itemId, ctx.player.inventory.count("bags", input.itemId));
      }
    }
    return map;
  });
  return (
    <div className={`${PANEL} pointer-events-auto w-[480px] max-h-[72vh] overflow-hidden`}>
      <div className={PANEL_TITLE}>
        <span>
          Forge · <span className="text-amber-400">crafting {skills.crafting}</span>
        </span>
        <button type="button" className={CLOSE_BUTTON} onClick={() => commands.run("craft.open", {})}>
          ✕
        </button>
      </div>
      <div className="max-h-[58vh] space-y-1 overflow-y-auto px-4 py-3">
        {[...RECIPES]
          .sort((a, b) => (RECIPE_SKILL[a.id] ?? 0) - (RECIPE_SKILL[b.id] ?? 0))
          .map((recipe) => {
            const output = itemDefById(recipe.outputs[0]?.itemId ?? "");
            if (output === null) return null;
            const skillReq = RECIPE_SKILL[recipe.id] ?? 0;
            const locked = skills.crafting < skillReq;
            const missing = recipe.inputs.some((input) => (counts.get(input.itemId) ?? 0) < input.count);
            return (
              <div
                key={recipe.id}
                className={`flex items-center gap-2.5 rounded border px-2.5 py-1.5 ${
                  locked ? "border-stone-800 opacity-50" : "border-stone-700 bg-stone-900/70"
                }`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded border border-stone-700 bg-stone-950 ${QUALITY_COLORS[output.quality]}`}>
                  <GameIcon name={output.icon as GameIconName} size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-semibold ${QUALITY_COLORS[output.quality]}`}>
                    {output.name}
                    {locked ? ` · crafting ${skillReq}` : ""}
                  </span>
                  <span className="block truncate text-[11px] text-stone-400">
                    {recipe.inputs
                      .map((input) => {
                        const have = counts.get(input.itemId) ?? 0;
                        return `${input.itemId.replaceAll("_", " ")} ${Math.min(have, input.count)}/${input.count}`;
                      })
                      .join(" · ")}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={locked || missing}
                  onClick={() => commands.run("craft.make", { recipeId: recipe.id })}
                  className={`rounded border px-2.5 py-1 text-xs font-semibold ${
                    locked || missing
                      ? "border-stone-800 text-stone-600"
                      : "border-amber-800 bg-amber-950/60 text-amber-200 hover:bg-amber-900/60"
                  }`}
                >
                  Craft
                </button>
              </div>
            );
          })}
      </div>
    </div>
  );
}

export function FishingOverlay() {
  const { userId } = usePlayer();
  const session = useGameStore((ctx) => ctx.game.store.get(fishingKey(userId))) as
    | { startedAt: number }
    | undefined;
  if (session === undefined) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[200px] z-20 flex flex-col items-center gap-1">
      <p className="text-sm font-semibold text-sky-200 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
        Something bites... press E when the marker is in the zone!
      </p>
      <SkillCheckBar
        config={FISHING_CHECK}
        startedAt={session.startedAt}
        className="h-5 w-72 overflow-hidden rounded-full bg-stone-950/85 ring-1 ring-sky-900"
        zoneClassName="bg-sky-500/60"
        markerClassName="bg-amber-300"
      />
    </div>
  );
}
