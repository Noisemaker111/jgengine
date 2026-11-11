/** @jsxImportSource @jgengine/core/ui/jsx */
import type { TerritoryPreviewCell } from "@jgengine/core/placement/TerritoryOverlay.view";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { Button, C, FULL, Icon, Panel, Row, Text } from "../../ui/kit";

export interface PlacementClaimHint {
  cells: readonly TerritoryPreviewCell[];
  cost: number;
  affordable: boolean;
}

const CELL_COLOR: Record<TerritoryPreviewCell["status"], string> = { owned: C.teal, claimable: "#d6a548", blocked: "#d96969" };

/** The land a placement would claim: one swatch per footprint cell, and the cost or why it cannot. */
function ClaimHint({ hint }: { hint: PlacementClaimHint }) {
  const blocked = hint.cells.some((cell) => cell.status === "blocked");
  return <RuneView gap={4}>
    <Row gap={3}>{hint.cells.map((cell) => <RuneView key={cell.key} width={8} height={8} radius={2} fill={CELL_COLOR[cell.status]} label={`${cell.x}, ${cell.z}: ${cell.status}`} />)}</Row>
    <Text size={11} weight={600} color="#7a6a53">{blocked ? "Land unavailable" : `Land: $${hint.cost.toLocaleString()}${hint.affordable ? "" : " — Insufficient funds"}`}</Text>
  </RuneView>;
}

/** The pinned placement note: rotate, the facing, the land claim and place. */
export default function PlacementControls({ onRotate, onPlace, canPlace, facingLabel, claimHint, isTouch = false }: {
  onRotate: () => void; onPlace: () => void; canPlace: boolean; facingLabel: string; claimHint: PlacementClaimHint | null; isTouch?: boolean;
}) {
  return <Panel shell="sticky" width={220} gap={10} padding={12} label="Placement">
    <Row gap={8}><Icon name="rotate" size={16} color={C.tealDeep} /><Text size={14} weight={800} color={C.paperInk}>Placement</Text></Row>
    <Row gap={10} width={FULL}>
      <Button tone="ghost" grow={1} color={C.paperInk} border={{ width: 1, color: "#2d241633" }} onPress={onRotate}>
        <Text size={12} weight={800} color={C.paperInk}>{isTouch ? "Rotate" : "Rotate (R)"}</Text>
      </Button>
      <Text size={14} weight={800} mono color={C.tealDeep} minWidth={72} align="right">{facingLabel}</Text>
    </Row>
    {claimHint === null ? null : <ClaimHint hint={claimHint} />}
    <Button tone="primary" width={FULL} disabled={!canPlace} onPress={onPlace}>{isTouch ? "Place" : "Place (E or click)"}</Button>
  </Panel>;
}
