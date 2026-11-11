/** @jsxImportSource @jgengine/core/ui/jsx */
/** The tablet's shop pieces: listing cards, price and research buttons, quantity steppers, stat pills. */
import type { ReactNode } from "@jgengine/core/ui/jsx";
import { RuneView, type RuneViewProps } from "@jgengine/core/ui/rune/primitives.view";

import { Button, C, Label, Row, Text } from "./kit";

/** One listing on the tablet: an ink card that dims when it cannot be bought. */
export function Card({ dim = false, owned = false, children, ...props }: RuneViewProps & { dim?: boolean; owned?: boolean; children?: ReactNode }) {
  return <RuneView variant="inset" fill={owned ? "#5fc2a80f" : "#00000033"} border={{ width: 1, color: owned ? "#5fc2a880" : C.line }}
    opacity={dim ? 0.45 : 1} gap={8} padding={12} {...props}>{children}</RuneView>;
}

/** A money figure: `$1,200`. */
export function money(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

/** A buy or research price button; `pending` shows an ellipsis while the request is out. */
export function PriceButton({ price, affordable, pending = false, label, onPress, name }: {
  price: number; affordable: boolean; pending?: boolean; label?: string; onPress: () => void; name?: string;
}) {
  const text = pending ? "…" : label ?? money(price);
  return <Button tone={affordable && !pending ? "primary" : "secondary"} minHeight={34} padding={[6, 12, 6, 12]} disabled={!affordable || pending}
    label={name === undefined ? text : `${text} ${name}`} onPress={onPress}>
    <Text size={12} weight={800} color={affordable && !pending ? C.ink : C.cream}>{text}</Text>
  </Button>;
}

/** Research a locked listing with data tokens. */
export function ResearchButton({ tokens, affordable, pending, onPress, name }: { tokens: number; affordable: boolean; pending: boolean; onPress: () => void; name: string }) {
  return <PriceButton price={tokens} affordable={affordable} pending={pending} label={`Research — ${tokens.toLocaleString()} tokens`} name={name} onPress={onPress} />;
}

/** − quantity + and `Buy ×N`. Every action carries the listing's name for keyboard, pad and tests. */
export function QuantityBuy({ quantity, max = 99, onQuantity, onBuy, disabled, pending = false, name, highlight = false }: {
  quantity: number; max?: number; onQuantity: (next: number) => void; onBuy: () => void; disabled: boolean; pending?: boolean; name: string; highlight?: boolean;
}) {
  const step = (label: string, glyph: string, next: number, off: boolean) => <Button tone="ghost" minHeight={30} padding={[2, 10, 2, 10]} radius={15}
    disabled={off} label={`${label} ${name}`} onPress={() => onQuantity(Math.max(1, Math.min(max, next)))}>
    <Text size={15} weight={800}>{glyph}</Text>
  </Button>;
  return <Row gap={6} padding={highlight ? 3 : 0} radius={16} {...(highlight ? { border: { width: 2, color: C.teal } } : {})}>
    {step("Fewer", "−", quantity - 1, disabled || quantity <= 1)}
    <Text size={14} weight={800} minWidth={20} align="center">{String(quantity)}</Text>
    {step("More", "+", quantity + 1, disabled)}
    <Button tone="primary" minHeight={34} padding={[6, 14, 6, 14]} disabled={disabled} label={`Buy ${name}`} onPress={onBuy}>
      <Text size={12} weight={800} color={C.ink}>{pending ? "…" : `Buy ×${quantity}`}</Text>
    </Button>
  </Row>;
}

/** A small stat: value over label. */
export function Pill({ label, value, accent = C.cream }: { label: string; value: string; accent?: string }) {
  return <RuneView gap={2} padding={[6, 10, 6, 10]} radius={10} fill="#ffffff0d" items="center">
    <Text size={13} weight={800} color={accent}>{value}</Text>
    <Label size={9}>{label}</Label>
  </RuneView>;
}

/** A segmented row of tabs; disabled tabs are locked by the tutorial, a highlighted one is next. */
export function Tabs<T extends string>({ tabs, active, labels, allowed = () => true, highlighted = () => false, onSelect, accent = C.teal }: {
  tabs: readonly T[]; active: T; labels: Record<T, string>; allowed?: (id: T) => boolean; highlighted?: (id: T) => boolean; onSelect: (id: T) => void; accent?: string;
}) {
  return <RuneView layout="row" gap={4} padding={4} radius={16} fill="#00000066">
    {tabs.map((id) => <Button key={id} tone="chip" grow={1} minHeight={36} disabled={!allowed(id)} label={labels[id]}
      fill={active === id ? accent : "#00000000"} {...(highlighted(id) && active !== id ? { border: { width: 1, color: C.teal } } : {})}
      onPress={() => onSelect(id)}>
      <Text size={11} weight={800} color={active === id ? C.ink : C.muted}>{labels[id].toUpperCase()}</Text>
    </Button>)}
  </RuneView>;
}

/** The bouncing teal arrow that points at the tutorial's next action. */
export function TutorialArrow() {
  return <Text size={18} weight={800} color={C.teal} label="Next step">↓</Text>;
}
