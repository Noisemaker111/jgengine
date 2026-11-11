/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";
import { RuneGlyph, RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { Button, C, FULL, Label, Row, Text } from "../../ui/kit";
import { billCardArtwork } from "../billCardGlyph";
import type { BillType } from "../events";

interface InvoiceBillCardProps {
  label: string;
  amountUsd: number;
  billType: BillType;
  canAfford: boolean;
  disabled?: boolean;
  isOverdue?: boolean;
  onPay?: () => void | Promise<void> | Promise<unknown>;
  readOnly?: boolean;
  children?: ReactNode;
}

/** A paper invoice: what it is for, the amount, a line-art watermark, the period and Pay. */
export function InvoiceBillCard({ label, amountUsd, billType, canAfford, disabled = false, isOverdue = false, onPay, readOnly = false, children }: InvoiceBillCardProps) {
  const amount = `$${amountUsd.toLocaleString()}`;
  return <RuneView variant="sticky" width={FULL} gap={8} border={{ width: isOverdue ? 2 : 0, color: C.destructive }}>
    <Row justify="between" items="start" width={FULL} gap={12}>
      <Text size={12} weight={800} color={C.paperInk} grow={1} shrink>{label.toUpperCase()}</Text>
      <Text size={16} weight={800} color={canAfford ? C.tealDeep : C.destructive}>{amount}</Text>
    </Row>
    {isOverdue ? <RuneView padding={[2, 8, 2, 8]} radius={4} border={{ width: 2, color: C.destructive }}><Label color={C.destructive}>OVERDUE</Label></RuneView> : null}
    <RuneView height={64} width={FULL} items="center" justify="center" clip><RuneGlyph artwork={billCardArtwork(billType)} size={140} /></RuneView>
    {children}
    {readOnly ? <Label color={C.paperMuted} align="center">AUTO-DEDUCTS</Label>
      : <Button tone={canAfford ? "primary" : "secondary"} width={FULL} disabled={disabled || !canAfford} opacity={disabled && canAfford ? 0.6 : 1}
        label={canAfford ? `Pay ${amount} for ${label}` : `Insufficient funds for ${amount}`} onPress={() => void onPay?.()}>
        <Text weight={800} color={canAfford ? C.ink : C.cream}>Pay</Text>
      </Button>}
  </RuneView>;
}
