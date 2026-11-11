/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { useGameStore } from "@jgengine/ui/hooks";
import { Button, clockText, Heading, KeyLegend, Label, Row, Scrim, Text, useRoom, useScreenTouch } from "./kit";
import { HH, DISPLAY } from "./theme";

/** A choice printed under the slip: next parcel, free roam, back to the title. */
export interface SlipAction {
  id: string;
  label: string;
  primary?: boolean;
}

/** What a slip says. `receipt` is dispatch's till roll; `tabloid` is the morning paper's front page. */
export interface Slip {
  kind: "receipt" | "tabloid";
  /** The rubber stamp across a receipt (`PAID`, `LATE`) or the paper's kicker. */
  stamp: string;
  tone: "good" | "bad" | "warn";
  title: string;
  summary: string;
  lines?: readonly { label: string; value: string }[];
  actions: readonly SlipAction[];
}

const STAMP: Record<Slip["tone"], string> = { good: "#1f8a5a", bad: HH.coral, warn: "#c97a10" };

function Lines({ lines, ink }: { lines: readonly { label: string; value: string }[]; ink: string }) {
  return (
    <RuneView gap={3}>
      {lines.map((line) => <Row key={line.label} justify="between" gap={12}><Text mono size={13} color={ink} text={line.label} /><Text mono size={13} weight={700} color={ink} text={line.value} /></Row>)}
    </RuneView>
  );
}

/**
 * The end of a run, as a thing the courier is handed: a delivery closes on Mainsail Express's thermal
 * till roll with a rubber stamp, and a bust or a hospital stay makes the Harbor Tribune's front page.
 * Escape takes the first non-primary choice.
 */
export function ReceiptScreen({ slip, onAction }: { slip: Slip; onAction: (id: string) => void }) {
  useScreenTouch();
  const { width } = useRuneViewport();
  const compact = useRoom() !== "wide";
  const back = slip.actions.find((action) => action.primary !== true)?.id ?? slip.actions[0]?.id;
  const stamp = useGameStore((ctx) => {
    const calendar = ctx.time.calendar();
    return { clock: clockText(calendar.hour, calendar.minute), day: (calendar.day ?? 0) + 1 };
  }, (a, b) => a.clock === b.clock && a.day === b.day);
  const cardWidth = Math.min(slip.kind === "receipt" ? 380 : 520, width - 32);
  const ink = "#1e1a14";
  return (
    <Scrim back={back === undefined ? undefined : () => onAction(back)} gap={16} label={slip.title} role="dialog">
      {slip.kind === "receipt" ? (
        <RuneView width={cardWidth} padding={[18, 20, 18, 20]} gap={8} fill="#fbf7ee" shadow={{ x: 6, y: 8, blur: 0, color: "#071d25aa" }}>
          <RuneView items="center" gap={2}><Text mono size={16} weight={700} color={ink} text="MAINSAIL EXPRESS" /><Text mono size={11} color={ink} text={`Dispatch · Bay 3 · Day ${stamp.day} · ${stamp.clock}`} /></RuneView>
          <RuneView height={1} fill="#1e1a1466" />
          <Heading color={ink} size={28} text={slip.title} />
          <Text color={ink} size={14} text={slip.summary} />
          {slip.lines === undefined || slip.lines.length === 0 ? null : <Lines lines={slip.lines} ink={ink} />}
          <Row gap={2} height={22}>{Array.from({ length: 34 }, (_, i) => <RuneView key={i} width={i % 3 === 0 ? 3 : 1} height={22} fill={ink} />)}</Row>
          <Text mono size={11} color={ink} text="Keep the receipt. Dispatch never forgets." />
          <RuneView pin={[null, null, 20, 30]} padding={[4, 10, 2, 10]} border={{ width: 3, color: STAMP[slip.tone] }} radius={4} opacity={0.85}>
            <Text family={DISPLAY} size={30} tracking={2} color={STAMP[slip.tone]} text={slip.stamp.toUpperCase()} />
          </RuneView>
        </RuneView>
      ) : (
        <RuneView width={cardWidth} padding={[16, 20, 18, 20]} gap={8} fill="#efe6cf" shadow={{ x: 6, y: 8, blur: 0, color: "#071d25aa" }}>
          <Row justify="between"><Label color={ink} text={`Late edition · ${stamp.clock}`} /><Text family={DISPLAY} size={compact ? 22 : 30} color={ink} text="HARBOR TRIBUNE" /><Label color={ink} text="25¢" /></Row>
          <RuneView height={3} fill={ink} />
          <Text family={DISPLAY} size={15} tracking={1.5} color={STAMP[slip.tone]} text={slip.stamp.toUpperCase()} />
          <Heading color={ink} size={compact ? 28 : 36} text={slip.title} />
          <Text color={ink} size={15} text={slip.summary} />
          {slip.lines === undefined || slip.lines.length === 0 ? <RuneView height={70} fill="#2a2620" radial={{ center: [0.5, 0.5], radius: [0.6, 0.6], stops: [[0, "#6a6458"], [1, "#2a2620"]] }} /> : <Lines lines={slip.lines} ink={ink} />}
        </RuneView>
      )}
      <RuneView layout={compact ? "stack" : "row"} gap={10} {...(compact ? { width: cardWidth } : {})} label="What next">
        {slip.actions.map((action) => <Button key={action.id} tone={action.primary === true ? "amber" : "ink"} onPress={() => onAction(action.id)}>{action.label}</Button>)}
      </RuneView>
      {compact ? null : <KeyLegend items={[{ keys: ["←", "→"], label: "choose" }, { keys: ["Enter"], label: "go" }, { keys: ["Esc"], label: "leave" }]} />}
    </Scrim>
  );
}
