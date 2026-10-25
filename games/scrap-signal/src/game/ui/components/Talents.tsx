import { useCurrency, useEntityStat, useGame, usePlayer } from "@jgengine/react/hooks";
import { respecCost } from "../../commands";
import { useStore } from "@jgengine/react/store";
import { HudButton } from "@jgengine/react/hudButton";
import {
  activeCharacter,
  characterNodes,
  talentTree,
  type CharacterDef,
  type CharacterNode,
} from "../../characters";
import { FERRALON } from "../../palette";
import { skillsOpenStore, talentRanksStore } from "../../stores";
import { ReclaimerPortrait } from "./Portrait";
import { ScrapPanel } from "./ScrapPanel";

export function CharacterCard({ character, onPick }: { character: CharacterDef; onPick: () => void }) {
  return (
    <HudButton
      onClick={onPick}
      className="scrap-plate signal-character scrap-character group"
      style={{ boxShadow: `inset 0 -4px 0 ${character.color}` }}
    >
      <div
        className="mb-3 flex h-28 items-center justify-center border border-stone-800"
        style={{ background: `linear-gradient(160deg, ${character.color}33, #14110d 70%)` }}
      >
        <ReclaimerPortrait id={character.id} color={character.color} />
      </div>
      <span className="text-xl font-black uppercase tracking-widest text-stone-50">{character.name}</span>
      <span className="text-xs font-bold uppercase tracking-[0.25em]" style={{ color: character.color }}>
        {character.className}
      </span>
      <span className="mt-2 min-h-[3.5rem] text-[11px] font-semibold leading-relaxed text-stone-400">
        {character.tagline}
      </span>
      <div className="mt-2 flex flex-wrap gap-1">
        {character.branches.map((branch) => (
          <span key={branch.id} className="border border-stone-700 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-stone-300">
            {branch.name}
          </span>
        ))}
      </div>
      <span className="mt-3 text-center text-xs font-black uppercase tracking-[0.3em] text-amber-300 opacity-0 transition group-hover:opacity-100">
        Select
      </span>
    </HudButton>
  );
}



function NodeButton({ node, onSpend }: { node: CharacterNode; onSpend: () => void }) {
  const tree = talentTree();
  if (tree === null) return null;
  const rank = tree.rank(node.id);
  const can = tree.canAllocate(node.id).ok;
  const maxed = rank >= node.maxRank;
  return (
    <HudButton block disabled={!can} onClick={onSpend} className={`scrap-row scrap-row-lime scrap-node ${maxed ? "scrap-node-maxed" : ""}`}>
      <span className="flex-1">
        <span className="block text-xs font-bold uppercase tracking-wider text-stone-100">{node.name}</span>
        <span className="block text-[10px] leading-snug text-stone-400">{node.blurb}</span>
      </span>
      <span className={`text-xs font-black tabular-nums ${maxed ? "text-amber-300" : "text-lime-300"}`}>
        {rank}/{node.maxRank}
      </span>
    </HudButton>
  );
}

export function TalentsPanel() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const open = useStore(skillsOpenStore);
  useStore(talentRanksStore);
  const points = useEntityStat(userId, "skillPoints");
  const level = Math.round(useEntityStat(userId, "level")?.current ?? 1);
  const cash = useCurrency("cash");
  const character = activeCharacter();
  const tree = talentTree();
  if (!open || character === null || tree === null) return null;
  const nodes = characterNodes(character);
  return (
    <ScrapPanel
      wide
      title={`${character.name} — ${character.className}`}
      aside={
        <span className="ml-3 text-xs font-bold uppercase tracking-wider" style={{ color: FERRALON.hudXp }}>
          {Math.round(points?.current ?? tree.pointsAvailable())} points
        </span>
      }
      closeLabel="Close [K]"
      onClose={() => commands.run("ui.openSkills", {})}
    >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {character.branches.map((branch) => (
            <div key={branch.id} className="border border-stone-800 bg-black/40 p-2">
              <div className="mb-0.5 text-sm font-black uppercase tracking-widest" style={{ color: character.color }}>
                {branch.name}
              </div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                {branch.flavor} · {tree.pointsInBranch(branch.id)} pts
              </div>
              <div className="flex flex-col gap-1.5">
                {nodes
                  .filter((node) => node.branch === branch.id)
                  .map((node) => (
                    <NodeButton key={node.id} node={node} onSpend={() => commands.run("talent.spend", { nodeId: node.id })} />
                  ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[10px] uppercase tracking-wider text-stone-500">
            Capstones unlock at 10 points in their branch · earn points by leveling up
          </p>
          <HudButton
            disabled={tree.pointsSpent() === 0 || cash < respecCost(level)}
            onClick={() => commands.run("talent.respec", {})}
            className="scrap-row scrap-row-amber"
          >
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">Recalibrate · ${respecCost(level)}</span>
          </HudButton>
        </div>
    </ScrapPanel>
  );
}


