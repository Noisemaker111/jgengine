import { useEntityStat, useGame, usePlayer } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import {
  activeCharacter,
  characterNodes,
  talentTree,
  CHARACTERS,
  type CharacterDef,
  type CharacterNode,
} from "../../characters";
import { PANDORA } from "../../palette";
import { characterIdStore, skillsOpenStore, talentRanksStore } from "../../stores";

function CharacterCard({ character, onPick }: { character: CharacterDef; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="bl2-plate group flex w-64 flex-col border-2 border-stone-700 bg-stone-950/90 p-4 text-left transition hover:border-amber-400"
      style={{ boxShadow: `inset 0 -4px 0 ${character.color}` }}
    >
      <div
        className="mb-3 flex h-28 items-center justify-center border border-stone-800"
        style={{ background: `linear-gradient(160deg, ${character.color}33, #14110d 70%)` }}
      >
        <span className="text-6xl font-black" style={{ color: character.color }}>
          {character.name[0]}
        </span>
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
    </button>
  );
}

export function CharacterSelect() {
  const { commands } = useGame();
  const picked = useStore(characterIdStore);
  if (picked !== null) return null;
  return (
    <div className="pointer-events-auto absolute inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-[#0c0a08]/95">
      <div className="text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.5em] text-stone-500">A fan demake homage to Gearbox's</div>
        <div className="text-5xl font-black uppercase tracking-[0.12em] text-amber-400 drop-shadow-[0_4px_0_#3a2c10]">
          Borderlands 2
        </div>
        <div className="mt-1 text-xs font-bold uppercase tracking-[0.35em] text-stone-400">Choose your Vault Hunter</div>
      </div>
      <div className="flex flex-wrap items-stretch justify-center gap-4">
        {CHARACTERS.map((character) => (
          <CharacterCard
            key={character.id}
            character={character}
            onPick={() => commands.run("character.pick", { characterId: character.id })}
          />
        ))}
      </div>
      <div className="max-w-[34rem] text-center text-[11px] font-semibold uppercase tracking-wider text-stone-500">
        WASD move · mouse fire · R reload · E interact · G grenade · Q heal · K skill tree · 1-4 weapons
      </div>
    </div>
  );
}

function NodeButton({ node, onSpend }: { node: CharacterNode; onSpend: () => void }) {
  const tree = talentTree();
  if (tree === null) return null;
  const rank = tree.rank(node.id);
  const can = tree.canAllocate(node.id).ok;
  const maxed = rank >= node.maxRank;
  return (
    <button
      type="button"
      disabled={!can}
      onClick={onSpend}
      className={`flex w-full items-center gap-2 border px-2.5 py-1.5 text-left transition ${
        maxed
          ? "border-amber-500/70 bg-amber-950/40"
          : can
            ? "border-stone-700 bg-stone-900/80 hover:border-lime-400/70 hover:bg-stone-800"
            : "cursor-not-allowed border-stone-800 bg-stone-950/60 opacity-55"
      }`}
    >
      <span className="flex-1">
        <span className="block text-xs font-bold uppercase tracking-wider text-stone-100">{node.name}</span>
        <span className="block text-[10px] leading-snug text-stone-400">{node.blurb}</span>
      </span>
      <span className={`text-xs font-black tabular-nums ${maxed ? "text-amber-300" : "text-lime-300"}`}>
        {rank}/{node.maxRank}
      </span>
    </button>
  );
}

export function TalentsPanel() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const open = useStore(skillsOpenStore);
  useStore(talentRanksStore);
  const points = useEntityStat(userId, "skillPoints");
  const character = activeCharacter();
  const tree = talentTree();
  if (!open || character === null || tree === null) return null;
  const nodes = characterNodes(character);
  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-[46rem] max-w-[95vw] border-2 border-amber-500/80 bg-stone-950/95 p-4 shadow-[0_8px_40px_rgba(0,0,0,0.9)]">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <span className="text-lg font-black uppercase tracking-widest text-amber-300">
              {character.name} — {character.className}
            </span>
            <span className="ml-3 text-xs font-bold uppercase tracking-wider" style={{ color: PANDORA.hudXp }}>
              {Math.round(points?.current ?? tree.pointsAvailable())} points
            </span>
          </div>
          <button
            type="button"
            onClick={() => commands.run("ui.openSkills", {})}
            className="border border-stone-600 px-2 py-0.5 text-xs font-bold uppercase text-stone-300 hover:border-amber-400 hover:text-amber-300"
          >
            Close [K]
          </button>
        </div>
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
        <p className="mt-3 text-[10px] uppercase tracking-wider text-stone-500">
          Capstones unlock at 10 points in their branch · earn points by leveling up
        </p>
      </div>
    </div>
  );
}
