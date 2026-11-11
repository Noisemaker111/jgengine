/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";

import { campaign, COUNCIL_NODES, councilPoints, councilTree, DIFFICULTIES, DIFFICULTY_IDS } from "../campaign";
import { keep } from "../keep";
import { currentWaveNumber } from "../session";
import { bountyReadout } from "../waves/bounty";
import { boonDef, carriedRelic, legacy, relicBountyScale } from "../waves/legacy";
import { TOTAL_WAVES } from "../waves/manifest";
import { Brazier, DIM, FIRE, Glyph, GOLD, Heading, INK, Plank, Row, Sheet, Tag, Text, usePhone } from "./look";

/**
 * The defense's memorial stone: what it paid, what it banked, the war council between defenses and
 * the relics the next keep may open with. One stone for a hold and a fall alike.
 */
export function Memorial() {
  const outcome = useGameStore((c) => (keep.of(c).fact("keep.held") === true ? "held" : keep.of(c).fact("keep.fallen") === true ? "fallen" : null));
  if (outcome === null) return null;
  return <MemorialStone victory={outcome === "held"} />;
}

function MemorialStone({ victory }: { victory: boolean }) {
  const ctx = useGameContext(), phone = usePhone();
  const view = useGameStore((c) => {
    const account = legacy.read(c);
    return { earned: keep.of(c).num("keep.bounty_earned"), stars: keep.of(c).num("keep.stars"), difficulty: campaign.read(c).difficulty, account };
  });
  const wave = Math.max(1, Math.min(TOTAL_WAVES, currentWaveNumber()));
  const readout = bountyReadout(wave, view.earned, relicBountyScale(view.account));
  const relic = carriedRelic(view.account);
  const choose = (boon: string | null) => ctx.game.commands.run("legacy.choose", { boon });
  const lines: [string, string][] = [
    ["Waves reached", `${wave} / ${TOTAL_WAVES}`],
    ["Bounties paid", `${readout.earned} gold`],
    ["Kill pay", `${readout.opening} → ${readout.closing} gold (×${readout.scale.toFixed(2)})`],
    ["Gold banked", `${view.account.bankedGold}`],
    ["Standing", String(view.account.standing)],
    ["Relic carried", relic === null ? "none" : relic.label],
  ];
  const difficulty = DIFFICULTIES[view.difficulty];
  return <Sheet label={victory ? "The Keep Holds" : "The Keep Has Fallen"} width={720}>
    <RuneView items="center" gap={4}>
      <Brazier size={phone ? 36 : 40} strength={victory ? 1 : 0} />
      <Heading size={phone ? 24 : 30} align="center">{victory ? "The Keep Holds" : "The Keep Has Fallen"}</Heading>
      <Row gap={4} label={`${view.stars} stars on ${difficulty.label}`}>
        {Array.from({ length: 3 + difficulty.bonusStar }, (_, index) => <Glyph key={index} name="star" size={24} color={index < view.stars ? "#ffcf5a" : "#2a221a"} />)}
        <Tag>{difficulty.label.toUpperCase()}</Tag>
      </Row>
    </RuneView>
    <RuneView layout="grid" columns={2} responsive={{ phone: { columns: 1 } }} gap={6}>
      {lines.map(([label, value]) => <Row key={label} justify="between" gap={10} padding={[2, 10, 2, 0]}><Tag>{label.toUpperCase()}</Tag><Text size={14}>{value}</Text></Row>)}
    </RuneView>
    <WarCouncil />
    <Tag color={FIRE}>CARRY ONE RELIC INTO THE NEXT KEEP</Tag>
    <RuneView layout="grid" columns={3} responsive={{ phone: { columns: 1 } }} gap={8}>
      {view.account.offer.map((id) => {
        const boon = boonDef(id);
        return <Plank key={id} variant="parchment" layout="stack" items="start" gap={3} label={boon?.label ?? id} run={() => choose(id)}>
          <Row gap={5}><Glyph name="star" size={13} color="#8a2414" /><Text size={14} weight={700} color="#2e1f12">{boon?.label ?? id}</Text></Row>
          <Text size={12} color="#4a3520">{boon?.detail ?? ""}</Text>
        </Plank>;
      })}
    </RuneView>
    <Plank tone="enamel" run={() => choose(null)}>Defend again</Plank>
  </Sheet>;
}

/**
 * The war council: the best stars on each difficulty are its points, spent on seats that strengthen
 * a tower line, the purse or the beacon's rites. The next defense's difficulty is chosen here too.
 */
function WarCouncil() {
  const view = useGameStore((c) => {
    const state = campaign.read(c), tree = councilTree(c);
    return { difficulty: state.difficulty, points: councilPoints(state), free: tree.pointsAvailable(),
      seats: COUNCIL_NODES.map((node) => `${node.id}:${tree.rank(node.id)}:${tree.canSpend(node.id).ok}`).join(",") };
  });
  const ctx = useGameContext(), tree = councilTree(ctx);
  const branches = [{ id: "arsenal", label: "Arsenal" }, { id: "treasury", label: "Treasury" }, { id: "rites", label: "Rites" }];
  return <RuneView gap={8} padding={[10, 0, 4, 0]} label="War council">
    <Row justify="between" gap={8}>
      <Row gap={5}><Glyph name="star" size={14} color={GOLD} /><Text size={15} weight={700}>{`War Council · ${view.free} of ${view.points} free`}</Text></Row>
      <Row gap={4} label="Next defense difficulty">{DIFFICULTY_IDS.map((id) =>
        <Plank key={id} tone={view.difficulty === id ? "enamel" : "plank"} minHeight={30} padding={[3, 9, 3, 9]} tooltip={DIFFICULTIES[id].detail}
          command={{ name: "campaign.difficulty", input: { difficulty: id } }}>{DIFFICULTIES[id].label}</Plank>)}</Row>
    </Row>
    <RuneView layout="grid" columns={3} responsive={{ phone: { columns: 1 } }} gap={8}>
      {branches.map((branch) => <RuneView key={branch.id} gap={4}>
        <Tag>{branch.label.toUpperCase()}</Tag>
        {COUNCIL_NODES.filter((node) => node.branch === branch.id).map((node) => {
          const rank = tree.rank(node.id), open = tree.canSpend(node.id);
          return <Plank key={node.id} variant="keystone" minHeight={26} padding={[2, 8, 2, 8]} layout="row" justify="between"
            fill={rank > 0 ? "#6b5a2e" : "#3f3b35"} opacity={open.ok || rank > 0 ? 1 : 0.6}
            tooltip={`${node.detail}${open.ok ? "" : ` — ${open.reason}`}`} label={node.label}
            command={{ name: "council.rank", input: { node: node.id } }}>
            <Text size={12} color={INK}>{node.label}</Text><Text size={12} color={rank > 0 ? GOLD : DIM}>{`${rank}/${node.maxRank ?? 1}`}</Text>
          </Plank>;
        })}
      </RuneView>)}
    </RuneView>
    {view.points > view.free ? <Plank minHeight={30} command={{ name: "council.reset" }}>Return every seat</Plank> : null}
  </RuneView>;
}
