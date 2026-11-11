/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView, RuneWorldAnchor } from "@jgengine/core/ui/rune/primitives.view";
import type { ProximityPromptDisplay } from "@jgengine/core/interaction/proximityPrompt";
import type { PlacedBuildItem } from "@llmville/game/build/build";
import { INTERACTION_TARGET_TYPE, type InteractionHint, type InteractionTarget } from "@llmville/game/simulation/interaction";

import type { PlacedRack } from "../../infrastructure/infrastructure";
import { C, Text } from "../../ui/kit";

const HINT_Y_OFFSET = 2.0;
/** The marker's width; it centres over its anchor. */
const MARKER_WIDTH = 96;

export interface GaugeReading {
  value: number;
  max: number;
  unit?: string;
}

export interface ProximityPromptMarkerProps {
  hint: InteractionHint | null;
  target: InteractionTarget | null | undefined;
  promptDisplay?: ProximityPromptDisplay | null;
  gaugeValues?: Readonly<Record<string, GaugeReading>>;
  racks: readonly PlacedRack[];
  placedBuildItems: readonly PlacedBuildItem[];
}

/** World-space anchor for the hint: the targeted rack or placed item. */
export function resolveHintWorldPosition({ target, racks, placedBuildItems }: Pick<ProximityPromptMarkerProps, "target" | "racks" | "placedBuildItems">): [number, number, number] | null {
  if (!target) return null;
  if (target.type === INTERACTION_TARGET_TYPE.rack) {
    const rack = racks.find((r) => r.id === target.id);
    return rack ? [rack.x, HINT_Y_OFFSET, rack.z] : null;
  }
  if (target.type === INTERACTION_TARGET_TYPE.placedItem) {
    const item = placedBuildItems.find((i) => i.id === target.id && typeof i.x === "number");
    if (item && typeof item.x === "number" && typeof item.z === "number") return [item.x, HINT_Y_OFFSET, item.z];
  }
  return null;
}

function formatGaugeAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}

/** The prompt's two lines: a key or gauge readout over the action, or a plain label; null when there is nothing to say. */
export function promptLines(display: ProximityPromptDisplay | null | undefined, hint: InteractionHint | null, gaugeValues: Readonly<Record<string, GaugeReading>> | undefined): { head: string | null; body: string } | null {
  if (display?.kind === "gauge") {
    const reading = gaugeValues?.[display.gaugeId];
    if (!reading) return null;
    return { head: `${formatGaugeAmount(reading.value)}/${formatGaugeAmount(reading.max)}${reading.unit ? ` ${reading.unit}` : ""}`, body: hint?.action ?? display.gaugeId };
  }
  if (display?.kind === "label") return { head: null, body: display.text };
  return hint ? { head: hint.key, body: hint.action } : null;
}

/** The floating prompt over the interactable rack or item: a key chip, gauge readout or label. */
export function ProximityPromptMarker(props: ProximityPromptMarkerProps) {
  const position = resolveHintWorldPosition(props);
  const lines = promptLines(props.promptDisplay, props.hint, props.gaugeValues);
  if (position === null || lines === null) return null;
  return <RuneWorldAnchor position={position}>
    <RuneView x={-MARKER_WIDTH / 2} y={-24} width={MARKER_WIDTH} items="center" gap={2} padding={[4, 10, 4, 10]} radius={6} fill="#111a18e6" border={{ width: 1, color: "#ffffff1a" }}
      label={lines.head === null ? lines.body : `${lines.head} ${lines.body}`}>
      {lines.head === null ? null : <Text size={14} weight={800} mono color={C.teal}>{lines.head}</Text>}
      <Text size={10} color="#f4ecdde6">{lines.body}</Text>
    </RuneView>
  </RuneWorldAnchor>;
}
