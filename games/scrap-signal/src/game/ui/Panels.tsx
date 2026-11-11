/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect } from "@jgengine/core/ui/jsx";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { useCurrency, useEntityStat, useGame, useGameStore, useInventory, usePlayer } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useStore } from "@jgengine/react/store";
import { AMMO_LABELS, AMMO_POOLS } from "../ammo";
import { activeCharacter, characterNodes, talentTree, type CharacterNode } from "../characters";
import { BLACK_MARKET_UPGRADES, respecCost, upgradeCost } from "../commands";
import { gunById } from "../handroll";
import { AMMO_PRICES, gearItems } from "../items/gear/catalog";
import { VAULT, vaultOpenStore } from "../items/vault";
import { RARITY_COLORS } from "../palette";
import { NPCS, objectiveLabel, scrapQuestById } from "../quests/catalog";
import { npcDialogStore } from "../quests/givers";
import { RIFT_REROLL_CORES, riftBoard, riftLeaveSeconds, riftMutatorsFor, riftStore, riftTerminalOpenStore } from "../rift/rift";
import { MEDAL_REWARDS, RIFT_TIER_COUNT, medalTargets, mutatorById, riftEventId, riftScaling, romanTier } from "../rift/tiers";
import { blackMarketOpenStore, blackMarketStore, discoveredStationsStore, skillsOpenStore, talentRanksStore, travelOpenStore, vendorOpenStore } from "../stores";
import { TRAVEL_STATIONS } from "../world/sites";
import { useCompact, Button, C, FULL, Hull, Icon, Label, Pips, Plate, Row, RowButton, Sheet, Small, Stamp, Text, Tube } from "./kit";

/** An open terminal frees the mouse so its buttons can be clicked. */
export function useReleasePointer(open: boolean): void {
  useEffect(() => { if (open && typeof document !== "undefined") document.exitPointerLock?.(); }, [open]);
}

/** A conversation with a quest giver: what they say, and the quest they are offering with its pay. */
export function NpcDialog() {
  const { commands } = useGame();
  const dialog = useStore(npcDialogStore);
  useReleasePointer(dialog !== null);
  if (dialog === null) return null;
  const quest = dialog.questId === null ? undefined : scrapQuestById(dialog.questId);
  // Not modal: E still reaches the game, so "Accept [E]" works from the keyboard as well.
  return <Sheet title={NPCS[dialog.npc].name} closeLabel="Close [Esc]" close={() => commands.run("npc.close", {})} modal={false}>
    <Text size={14}>{quest?.brief ?? dialog.line}</Text>
    {quest === undefined ? null : <RuneView gap={4}>
      <Label color={C.xp}>{`${quest.main ? "Story" : "Side"} mission · ${quest.title}`}</Label>
      {quest.objectives.map(o => <Small key={o.id} color="#d6d3d1">{`▸ ${objectiveLabel(o)}`}</Small>)}
      <Small>{`Reward: ${quest.reward.xp} XP${quest.reward.cash === undefined ? "" : ` · $${quest.reward.cash}`}`}</Small>
      <RowButton title="Accept [E]" onPress={() => commands.run("quest.acceptOffer", {})} />
    </RuneView>}
  </Sheet>;
}

/** Dr. Sparx's meds and Rigg's munitions. */
export function VendorPanel() {
  const { commands } = useGame();
  const vendor = useStore(vendorOpenStore);
  const cash = useCurrency("cash");
  useReleasePointer(vendor !== null);
  if (vendor === null) return null;
  const close = () => commands.run("vendor.close", {});
  if (vendor === "sparx") return <Sheet title="Dr. Sparx's Meds" closeLabel="Close [Esc]" close={close}>
    {gearItems.filter(item => item.trade !== undefined && item.kind !== "ammo").map(item => {
      const cost = item.trade?.buy["cash"] ?? 0;
      return <RowButton key={item.id} title={item.name} detail={item.kind === "health" ? `Restores ${item.heal} health` : "+25 max shield"} value={`$${cost}`} valueColor={C.xp} disabled={cash < cost} onPress={() => commands.run("vendor.buyGear", { itemId: item.id })} />;
    })}
  </Sheet>;
  return <Sheet title="Rigg Munitions" closeLabel="Close [Esc]" close={close}>
    {AMMO_POOLS.map(pool => <RowButton key={pool} title={`${AMMO_LABELS[pool]} ammo`} detail={`+${AMMO_PRICES[pool].amount} rounds`} value={`$${AMMO_PRICES[pool].cash}`} valueColor={C.xp} disabled={cash < AMMO_PRICES[pool].cash} onPress={() => commands.run("vendor.buyAmmo", { pool })} />)}
    <RowButton title="Gun of the day" detail="A mystery roll from Rigg's back room" value="$300" valueColor={C.xp} disabled={cash < 300} onPress={() => commands.run("vendor.gunOfTheDay", { vendor: "rigg" })} />
    <Small color={C.faint}>NO REFUNDS.</Small>
  </Sheet>;
}

function GunRow({ itemId, action, onPress }: { itemId: string; action: string; onPress: () => void }) {
  const gun = gunById(itemId);
  if (gun === undefined) return null;
  return <RowButton title={gun.name} titleColor={RARITY_COLORS[gun.rarity]} detail={`lvl ${gun.level} ${gun.rarity} ${gun.manufacturer} ${gun.family}${gun.element === "none" ? "" : ` · ${gun.element}`} · ${gun.weapon.damage} dmg`} value={action.toUpperCase()} onPress={onPress} />;
}

/** The Coretown vault: store the guns you are not carrying, take them back when you want them. */
export function VaultPanel() {
  const { commands } = useGame();
  const open = useStore(vaultOpenStore);
  const hotbar = useInventory("hotbar");
  const vault = useInventory(VAULT);
  useReleasePointer(open);
  if (!open) return null;
  const stored = vault.filter(slot => slot !== null);
  return <Sheet title="Coretown Vault" close={() => commands.run("vault.close", {})}>
    <Label color={C.dim}>Carried</Label>
    {hotbar.map((slot, index) => slot === null ? null : <GunRow key={`h${index}`} itemId={slot.itemId} action="Store" onPress={() => commands.run("vault.deposit", { slot: index })} />)}
    <Label color={C.dim}>{`In the vault · ${stored.length}/${vault.length}`}</Label>
    {stored.length === 0 ? <Small color={C.faint}>Empty</Small> : null}
    {vault.map((slot, index) => slot === null ? null : <GunRow key={`v${index}`} itemId={slot.itemId} action="Take" onPress={() => commands.run("vault.withdraw", { itemId: slot.itemId })} />)}
  </Sheet>;
}

/** Points in a branch that open each tier (`requiresPointsInBranch`). */
const TIERS = [0, 5, 10, 15, 20] as const;
function NodeButton({ node, onSpend }: { node: CharacterNode; onSpend: () => void }) {
  const tree = talentTree();
  if (tree === null) return null;
  const rank = tree.rank(node.id), maxed = rank >= node.maxRank;
  return <RowButton title={node.name} detail={node.blurb} value={`${rank}/${node.maxRank}`} valueColor={maxed ? C.amber : "#bef264"} disabled={!tree.canAllocate(node.id).ok} onPress={onSpend} />;
}

/** The reclaimer's three talent branches, tier by tier. */
export function TalentsPanel() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const open = useStore(skillsOpenStore);
  useStore(talentRanksStore);
  const points = useEntityStat(userId, "skillPoints");
  const level = Math.round(useEntityStat(userId, "level")?.current ?? 1);
  const cash = useCurrency("cash");
  useReleasePointer(open);
  const character = activeCharacter(), tree = talentTree();
  if (!open || character === null || tree === null) return null;
  const nodes = characterNodes(character);
  return <Sheet wide title={`${character.name} — ${character.className}`} aside={<Label color={C.xp}>{`${Math.round(points?.current ?? tree.pointsAvailable())} points`}</Label>} closeLabel="Close [Esc]" close={() => commands.run("ui.openSkills", {})}>
    <RuneView layout="grid" columns={3} gap={10} responsive={{ phone: { columns: 1 } }}>
      {character.branches.map(branch => <RuneView key={branch.id} padding={8} gap={5} fill="#00000066" border={{ width: 1, color: "#292524" }}>
        <Text family="Russo One" size={14} color={character.color}>{branch.name.toUpperCase()}</Text>
        <Small size={10}>{`${branch.flavor} · ${tree.pointsInBranch(branch.id)} pts`.toUpperCase()}</Small>
        {TIERS.map(tier => {
          const inTier = nodes.filter(node => node.branch === branch.id && (node.requiresPointsInBranch ?? 0) === tier);
          if (inTier.length === 0) return null;
          return <RuneView key={tier} gap={4}>
            {tier > 0 ? <Label color={tree.pointsInBranch(branch.id) >= tier ? "#bef264" : "#57534e"}>{`Tier ${tier / 5} · ${tier} pts`}</Label> : null}
            {inTier.map(node => <NodeButton key={node.id} node={node} onSpend={() => commands.run("talent.spend", { nodeId: node.id })} />)}
          </RuneView>;
        })}
      </RuneView>)}
    </RuneView>
    <Row justify="between" gap={10} responsive={{ phone: { layout: "stack" } }}>
      <Small size={10} grow={1} shrink>EACH TIER OPENS AT 5 MORE POINTS IN ITS BRANCH · THE CAPSTONE AT 20 · EARN POINTS BY LEVELING UP</Small>
      <Button disabled={tree.pointsSpent() === 0 || cash < respecCost(level)} onPress={() => commands.run("talent.respec", {})}>{`Recalibrate · $${respecCost(level)}`}</Button>
    </Row>
  </Sheet>;
}

/** The fast-travel network between registered stations. */
export function TravelPanel() {
  const { commands } = useGame();
  const open = useStore(travelOpenStore);
  const discovered = useStore(discoveredStationsStore);
  useReleasePointer(open);
  if (!open) return null;
  return <Sheet title="Fast Travel Network" close={() => commands.run("travel.close", {})}>
    {TRAVEL_STATIONS.map(station => { const known = discovered.includes(station.zoneId);
      return <RowButton key={station.zoneId} title={known ? station.name : "??? — undiscovered"} {...(known ? { value: "GO" } : {})} valueColor={C.cyan} disabled={!known} onPress={() => commands.run("travel.go", { zoneId: station.zoneId })} />; })}
    <Small color={C.faint}>WALK UP TO A STATION IN THE WORLD TO REGISTER IT</Small>
  </Sheet>;
}

/** The Switchboard Exchange: permanent upgrades bought with cores. */
export function BlackMarketPanel() {
  const { commands } = useGame();
  const open = useStore(blackMarketOpenStore);
  const cores = useCurrency("cores");
  const counts = useStore(blackMarketStore);
  useReleasePointer(open);
  if (!open) return null;
  return <Sheet title="Switchboard Exchange" close={() => commands.run("blackmarket.close", {})}>
    <Label color="#f0abfc">{`◆ ${cores} cores — elites and bosses drop it`}</Label>
    {BLACK_MARKET_UPGRADES.map(upgrade => { const owned = counts[upgrade.id] ?? 0, cost = upgradeCost(owned);
      return <RowButton key={upgrade.id} title={`${upgrade.name} (owned ${owned})`} detail={upgrade.blurb} value={`◆ ${cost}`} valueColor="#f0abfc" disabled={cores < cost} onPress={() => commands.run("blackmarket.buy", { upgrade: upgrade.id })} />; })}
  </Sheet>;
}

const MEDAL_COLOR: Record<string, string> = { bronze: "#c98a4b", silver: "#cfd8dc", gold: "#ffcc33" };
function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
function MutatorChips({ ids, wrap = false }: { ids: readonly string[]; wrap?: boolean }) {
  if (ids.length === 0) return <Chip color={C.phosphor}>Clean signal · no mutators</Chip>;
  return <RuneView layout={wrap ? "grid" : "row"} {...(wrap ? { columns: 2 } : {})} gap={4}>{ids.map(id => { const p = mutatorById(id)?.payload; return p === undefined ? null : <Chip key={id} color={p.boon === true ? C.xp : C.red} tooltip={p.blurb}>{p.name}</Chip>; })}</RuneView>;
}
function Chip({ color, children, tooltip }: { color: string; children: string; tooltip?: string }) {
  return <RuneView padding={[2, 6, 2, 6]} border={{ width: 1, color: `${color}99` }} {...(tooltip === undefined ? {} : { tooltip })}><Small size={11} color={color}>{children}</Small></RuneView>;
}

/** The wreck's overdrive console: every tier, its medal, its best time, and the tuned tier's mutators. */
export function OverdriveTerminal() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const open = useStore(riftTerminalOpenStore);
  const tier = useStore(riftStore, s => s.selected);
  const cores = useCurrency("cores");
  const level = Math.round(useEntityStat(userId, "level")?.current ?? 1);
  const board = useGameStore(ctx => riftBoard(ctx));
  const mutators = useGameStore(ctx => riftMutatorsFor(ctx, tier), (a, b) => a.join() === b.join());
  useReleasePointer(open);
  if (!open) return null;
  const scaling = riftScaling(tier, level), targets = medalTargets(tier), eventId = riftEventId(tier);
  const tierOpen = board.isOpen(eventId), best = board.best(eventId), next = board.next(eventId);
  return <Sheet wide title="Overdrive console" aside={<Small>{`The Rustflat wreck · medal points ${board.points()}`}</Small>} close={() => commands.run("rift.close", {})}>
    <Row items="start" gap={10} responsive={{ phone: { layout: "stack" } }}>
      <Tube width={200} gap={2} responsive={{ phone: { width: FULL } }}>
        {Array.from({ length: RIFT_TIER_COUNT }, (_, index) => {
          const t = index + 1, id = riftEventId(t), isOpen = board.isOpen(id), medal = board.medalOf(id), b = board.best(id);
          return <Button key={t} layout="row" items="center" gap={8} minHeight={28} padding={[3, 8, 3, 8]} fill={t === tier ? "#3a2c10" : "#0a1d17"} border={{ width: 1, color: t === tier ? C.amber : "#173a2e" }} disabled={!isOpen} label={`Overdrive ${romanTier(t)}`} onPress={() => commands.run("rift.select", { tier: t })}>
            <Text width={40} size={13} color={C.phosphor}>{romanTier(t)}</Text>
            <Icon name="star" size={13} color={medal === null ? "#4a463f" : MEDAL_COLOR[medal] ?? C.dim} />
            <Small grow={1} align="right">{isOpen ? (b === null ? "—" : clock(b)) : "locked"}</Small>
          </Button>;
        })}
      </Tube>
      <Hull grow={1} shrink gap={8} border={{ width: 2, color: C.amber }}>
        <Row justify="between"><Stamp>{`Overdrive ${romanTier(tier)}`}</Stamp><Small>{`crews at level ${scaling.enemyLevel}`}</Small></Row>
        <Row gap={8}><Small>Signal pressure</Small><Pips value={() => tier} max={() => RIFT_TIER_COUNT} count={20} color={tier > 12 ? C.red : C.amber} width={6} /></Row>
        <MutatorChips ids={mutators} />
        {mutators.map(id => { const p = mutatorById(id)?.payload; return p === undefined ? null : <Small key={id} color={C.ink}>{`${p.name}. ${p.blurb}`}</Small>; })}
        <RuneView gap={2}>{(["bronze", "silver", "gold"] as const).map(medal => <Row key={medal} gap={6}><Icon name="star" size={13} color={MEDAL_COLOR[medal] ?? C.dim} /><Small color={MEDAL_COLOR[medal] ?? C.dim}>{`${medal === "bronze" ? "clear" : `under ${clock(targets[medal])}`} · +${MEDAL_REWARDS[medal]!.cores} cores`}</Small></Row>)}</RuneView>
        <Small color={C.ink}>{`Pays $${scaling.cash} and ${scaling.cores} cores · loot level ${scaling.lootLevel} · luck ×${scaling.luck.toFixed(1)}${tier >= 4 ? " · Foreman drops a legendary" : ""}`}</Small>
        <Small>{`${best === null ? "No clear yet." : `Best ${clock(best)}.`} ${next === null ? (best === null ? "" : "Gold held.") : `Next: ${next.medal} under ${clock(next.value)}.`}`}</Small>
        <Row gap={8} responsive={{ phone: { layout: "stack" } }}>
          <Button disabled={!tierOpen} onPress={() => commands.run("rift.start", { tier })}>{tierOpen ? "Overdrive the wreck" : "Locked — earn more medal points"}</Button>
          {mutators.length > 0 ? <Button disabled={cores < RIFT_REROLL_CORES} onPress={() => commands.run("rift.reroll", { tier })}>{`Re-tune mutators · ${RIFT_REROLL_CORES} cores`}</Button> : null}
        </Row>
      </Hull>
    </Row>
    <Small size={11} color={C.faint}>CLEAR A TIER TO OPEN THE NEXT · GOLDS ARE WORTH 3 POINTS AND OPEN TIERS AHEAD · BETWEEN WAVES PRESS N TO CALL THE NEXT ONE EARLY</Small>
  </Sheet>;
}

/** The live run on the rig: tier, clock against the next medal, the wave, its mutators, and its result. */
export function OverdriveCard() {
  const ctx = useGameContext();
  const { commands } = useGame();
  // Structural run fields only; the clock, pace colour and countdown bind at their leaves.
  const run = useStore(riftStore, s => s.run === null ? null : { tier: s.run.tier, phase: s.run.phase, wave: s.run.wave, enemyLevel: s.run.enemyLevel, mutators: s.run.mutators, medal: s.run.medal, newBest: s.run.newBest, reason: s.run.reason, cash: s.run.cash, cores: s.run.cores, newMedals: s.run.newMedals, counting: s.run.countdown !== null },
    (a, b) => JSON.stringify(a) === JSON.stringify(b));
  const board = useGameStore(c => riftBoard(c));
  const { compact } = useCompact();
  if (run === null) return null;
  const live = run.phase === "running" || run.phase === "intermission";
  const target = board.next(riftEventId(run.tier));
  const elapsed = () => riftStore.read(ctx).run?.elapsed ?? 0;
  const countdown = () => riftStore.read(ctx).run?.countdown ?? 0;
  const pace = () => { const t = medalTargets(run.tier), e = elapsed(); return e <= t.gold ? "gold" : e <= t.silver ? "silver" : "bronze"; };
  return <Plate width={compact ? 200 : 260} gap={compact ? 3 : 5} padding={compact ? 7 : 10} border={{ width: 2, color: live ? C.red : C.amber }}>
    <Row justify="between"><Stamp tone={live ? "red" : "amber"}>{`Overdrive ${romanTier(run.tier)}`}</Stamp>
      <Text family="Russo One" size={18} color={bind(() => live ? MEDAL_COLOR[pace()] ?? C.ink : C.ink)} text={bind(() => clock(elapsed()))} /></Row>
    {live ? <>
      <Row justify="between"><Small color={C.ink}>{`Wave ${run.wave} / 4 · level ${run.enemyLevel}`}</Small><Small>{target === null ? "gold held" : `${target.medal} < ${clock(target.value)}`}</Small></Row>
      <MutatorChips ids={run.mutators} wrap={compact} />
      {run.phase === "intermission" && run.counting ? <RuneView gap={4}>
        <Pips value={countdown} max={() => riftStore.read(ctx).run?.countdownTotal ?? 1} count={12} color={C.amber} width={12} />
        <Button onPress={() => commands.run("rift.callWave", {})} label="Call wave"><Text size={13} text={bind(() => `Call wave [N] · ${Math.ceil(countdown())}s`)} /></Button>
      </RuneView> : null}
      <Text size={13} color={C.red} text={bind(() => { const s = riftLeaveSeconds(ctx); return s === null ? "" : `Back to the wreck — ${Math.ceil(s)}s`; })} />
    </> : <>
      <Small color={C.ink}>{run.phase === "won" ? `Cleared · ${run.medal === null || run.medal === undefined ? "no medal" : `${run.medal} medal`}${run.newBest === true ? " · new best" : ""}` : `Lost — ${run.reason}`}</Small>
      {run.phase === "won" ? <Small color={C.xp}>{`+$${run.cash ?? 0} · +${run.cores ?? 0} cores${(run.newMedals ?? []).length > 0 ? ` · first ${(run.newMedals ?? []).join(", ")}` : ""}`}</Small> : null}
      <Button onPress={() => commands.run("rift.dismiss", {})}>Dismiss</Button>
    </>}
  </Plate>;
}
