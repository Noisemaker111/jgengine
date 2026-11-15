/** @jsxImportSource @jgengine/core/ui/jsx */
import { useGameStore } from "@jgengine/ui/hooks";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { BUILDABLES } from "../objects/catalog";
import { ghostStatuses } from "../ghosts";
import { Button, GOLD, GOOD, Meter, PENCIL, Row, Tag, TEAL, Text, WARN, Window } from "./look";
import { useGame } from "@jgengine/ui/hooks";
import { park } from "../park";
import { ecto } from "../ecto";
import { GHOSTS, ghostDef } from "../ghostCatalog";
import { BONDS, bondActiveFact, bondFact, EMPOWER_COSTS, ghostLevelFact } from "../lateGame";

/**
 * The ghost register: every ghost who might make the park its home, what it wants (each want ticked
 * when the park holds it), how close it is to moving in, and what it gives back - its nightly
 * ectoplasm and the séance it whispers. Read from the world and the census each change.
 */
export function GhostsPanel({ onClose }: { onClose: () => void }) {
  const { commands } = useGame();
  const act = (action: string) => commands.run("brightway.act", { action });
  const bonds = useGameStore((ctx) => {
    const w = park.of(ctx);
    return BONDS.map((bond) => ({ id: bond.id, label: bond.label, blurb: bond.blurb, cost: bond.cost, pair: `${ghostDef(bond.a)!.icon} ${ghostDef(bond.a)!.label} + ${ghostDef(bond.b)!.icon} ${ghostDef(bond.b)!.label}`,
      bound: w.num(bondFact(bond.id)) >= 1, active: w.num(bondActiveFact(bond.id)) >= 1, refusal: w.canAct(`bind_${bond.id}`)?.message ?? null }));
  });
  const powers = useGameStore((ctx) => {
    const w = park.of(ctx);
    return Object.fromEntries(GHOSTS.map((ghost) => {
      const level = w.num(ghostLevelFact(ghost.id));
      const next = level < EMPOWER_COSTS.length ? `empower_${ghost.id}_${level + 1}` : null;
      return [ghost.id, { level, next, cost: EMPOWER_COSTS[level] ?? 0, refusal: next === null ? "At its full strength" : w.canAct(next)?.message ?? null }];
    }));
  });
  const ghosts = useGameStore((ctx) => ghostStatuses(ctx).map((status) => ({
    id: status.ghost.id, label: status.ghost.label, icon: status.ghost.icon, blurb: status.ghost.blurb, resident: status.resident,
    state: status.state, progress: Math.round(status.progress * 100) / 100, yieldPerNight: status.ghost.yield,
    unlock: BUILDABLES[status.ghost.unlocks]?.label ?? status.ghost.unlocks, rumor: status.ghost.rumor,
    wants: status.wants.map((want) => ({ id: want.id, label: want.label, have: Math.floor(want.have), need: want.need, met: want.met })),
  })));
  const home = ghosts.filter((ghost) => ghost.resident).length;
  return <Window eyebrow="The ghost register" title={`${home} of ${ghosts.length} at home`} close={onClose} closeLabel="Close the ghost register">
    <Text size={13} color={PENCIL}>Give a ghost everything it wants at once and it moves in: it seeps ectoplasm every night, spreads the rumor and whispers a séance. Take its things away and it drifts off.</Text>
    {ghosts.map((ghost) => <RuneView key={ghost.id} gap={4} padding={8} radius={10} fill={ghost.resident ? "#5fd4b81f" : "#00000026"} border={{ width: 1, color: ghost.resident ? TEAL : "#3d3460" }} label={ghost.label}>
      <Row justify="between"><Text weight={800}>{`${ghost.icon} ${ghost.label}`}</Text><Text size={12} color={ghost.resident ? GOOD : PENCIL}>{ghost.resident ? `+${ghost.yieldPerNight}/night` : `rumor ${ghost.rumor}`}</Text></Row>
      <Text size={12} color={PENCIL}>{ghost.blurb}</Text>
      {ghost.wants.map((want) => <Row key={want.id} gap={6} items="start"><Text weight={800} color={want.met ? GOOD : PENCIL}>{want.met ? "✓" : "○"}</Text><Text size={12} grow={1} shrink>{want.label}</Text><Text size={12} weight={800} color={want.met ? GOOD : WARN}>{`${Math.min(want.have, want.need)}/${want.need}`}</Text></Row>)}
      {ghost.progress > 0 && !(ghost.resident && ghost.progress >= 1)
        ? <Meter label={ghost.state.toUpperCase()} read={() => ghost.progress} max={() => 1} readout={(p) => `${Math.round(p * 100)}%`} color={ghost.resident ? WARN : TEAL} />
        : <Tag color={ghost.resident ? GOOD : PENCIL}>{ghost.state.toUpperCase()}</Tag>}
      <Text size={11} color={PENCIL}>{`Moves in with the plans for the ${ghost.unlock}`}</Text>
      {ghost.resident ? <Row justify="between"><Text size={12} weight={800} color={GOLD}>{`Strength ${powers[ghost.id]?.level ?? 0} of ${EMPOWER_COSTS.length}`}</Text>
        {powers[ghost.id]?.next ? <Button tone="ticket" minHeight={30} disabled={powers[ghost.id]?.refusal !== null} tooltip={powers[ghost.id]?.refusal ?? `Seeps more and haunts harder`} onPress={() => act(powers[ghost.id]!.next!)}>{`Empower · ${ecto(powers[ghost.id]!.cost)}`}</Button> : null}</Row> : null}
    </RuneView>)}
    <Tag>BONDS</Tag>
    <Text size={12} color={PENCIL}>Two residents bound by a ritual haunt together while both are home: they flare as one, seep more and spread the rumor.</Text>
    {bonds.map((bond) => <RuneView key={bond.id} gap={3} padding={8} radius={10} fill={bond.active ? "#ffc46b1f" : "#00000026"} border={{ width: 1, color: bond.active ? GOLD : "#3d3460" }} label={bond.label}>
      <Row justify="between"><Text weight={800}>{bond.label}</Text><Text size={12} color={bond.active ? GOOD : PENCIL}>{bond.active ? "haunting together" : bond.bound ? "bound · one is away" : ""}</Text></Row>
      <Text size={12}>{bond.pair}</Text>
      <Text size={11} color={PENCIL}>{bond.blurb}</Text>
      {bond.bound ? null : <Button tone="ticket" disabled={bond.refusal !== null} tooltip={bond.refusal ?? undefined} onPress={() => act(`bind_${bond.id}`)}>{`Bind · ${ecto(bond.cost)}`}</Button>}
    </RuneView>)}
  </Window>;
}
