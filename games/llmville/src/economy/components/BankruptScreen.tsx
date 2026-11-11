/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { DEFAULT_STARTING_MONEY } from "@llmville/game/world/worldBootstrap";

import { Button, C, FULL, Logo, Muted, Panel, Text } from "../../ui/kit";
import { DISPLAY } from "../../ui/theme";

/** The lab was liquidated: what happened and the one way on. */
export function BankruptScreen({ isDismissing, onDismiss }: { isDismissing: boolean; onDismiss: () => void }) {
  return <RuneView anchor="fill" fill="#000000cc" modal label="Bankrupt">
    <RuneView anchor="center" width={448} responsive={{ phone: { width: 340 } }} items="center" gap={24}>
      <Logo stacked size="lg" />
      <Panel shell="inset" width={FULL} gap={12} padding={24} fill="#e8836b14" border={{ width: 1, color: "#e8836b59" }}>
        <Text family={DISPLAY} size={18} weight={800}>Bankrupt</Text>
        <Muted size={14}>{`Your lab could not cover its overhead — it was liquidated and reset. You start over with $${DEFAULT_STARTING_MONEY.toLocaleString()} and a fresh plot.`}</Muted>
        <Muted size={12} color={C.faint}>Keep enough cash on hand; bills auto-deduct each cycle.</Muted>
        <Button tone="primary" width={FULL} busy={isDismissing} busyLabel="Starting over…" onPress={onDismiss}>Start over</Button>
      </Panel>
    </RuneView>
  </RuneView>;
}
