/** @jsxImportSource @jgengine/core/ui/jsx */
import { useGameStore } from "@jgengine/ui/hooks";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { BUILDABLES } from "../objects/catalog";
import { ghostStatuses } from "../ghosts";
import { GOOD, Meter, PENCIL, Row, Tag, TEAL, Text, WARN, Window } from "./look";

/**
 * The ghost register: every ghost who might make the park its home, what it wants (each want ticked
 * when the park holds it), how close it is to moving in, and what it gives back - its nightly
 * ectoplasm and the séance it whispers. Read from the world and the census each change.
 */
export function GhostsPanel({ onClose }: { onClose: () => void }) {
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
    </RuneView>)}
  </Window>;
}
