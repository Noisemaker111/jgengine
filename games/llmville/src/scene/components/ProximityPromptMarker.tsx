import { Html } from "@react-three/drei";

import type { PlacedBuildItem } from "@llmville/game/build/build";
import type { PlacedRack } from "@/infrastructure/infrastructure";
import {
  INTERACTION_TARGET_TYPE,
  type InteractionHint,
  type InteractionTarget,
} from "@llmville/game/simulation/interaction";
import type { ProximityPromptDisplay } from "@jgengine/core/interaction/proximityPrompt";

const HINT_Y_OFFSET = 2.0;

export interface GaugeReading {
  value: number;
  max: number;
  unit?: string;
}

interface ProximityPromptMarkerProps {
  hint: InteractionHint | null;
  target: InteractionTarget | null | undefined;
  promptDisplay?: ProximityPromptDisplay | null;
  gaugeValues?: Readonly<Record<string, GaugeReading>>;
  racks: readonly PlacedRack[];
  placedBuildItems: readonly PlacedBuildItem[];
}

type MarkerAnchorProps = Omit<ProximityPromptMarkerProps, "hint" | "promptDisplay" | "gaugeValues">;

/** World-space anchor for the hint: the targeted rack or placed item. */
function resolveHintWorldPosition({
  target,
  racks,
  placedBuildItems,
}: MarkerAnchorProps): [number, number, number] | null {
  if (!target) return null;
  if (target.type === INTERACTION_TARGET_TYPE.rack) {
    const rack = racks.find((r) => r.id === target.id);
    if (rack) return [rack.x, HINT_Y_OFFSET, rack.z];
    return null;
  }
  if (target.type === INTERACTION_TARGET_TYPE.placedItem) {
    const item = placedBuildItems.find((i) => i.id === target.id && typeof i.x === "number");
    if (item && typeof item.x === "number" && typeof item.z === "number") {
      return [item.x, HINT_Y_OFFSET, item.z];
    }
  }
  return null;
}

function formatGaugeAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}

function renderPromptBody(
  display: ProximityPromptDisplay | null | undefined,
  hint: InteractionHint | null,
  gaugeValues: Readonly<Record<string, GaugeReading>> | undefined,
) {
  if (display?.kind === "gauge") {
    const reading = gaugeValues?.[display.gaugeId];
    if (!reading) return null;
    const unitSuffix = reading.unit ? ` ${reading.unit}` : "";
    return (
      <>
        <div className="font-mono font-bold tracking-wider text-brand-teal text-sm leading-none">
          {formatGaugeAmount(reading.value)}/{formatGaugeAmount(reading.max)}
          {unitSuffix}
        </div>
        <div className="mt-0.5 text-[10px] leading-none text-brand-cream/90">{hint?.action ?? display.gaugeId}</div>
      </>
    );
  }

  if (display?.kind === "label") {
    return <div className="text-[10px] leading-none text-brand-cream/90">{display.text}</div>;
  }

  if (!hint) return null;
  return (
    <>
      <div className="font-mono font-bold tracking-wider text-brand-teal text-sm leading-none">{hint.key}</div>
      <div className="mt-0.5 text-[10px] leading-none text-brand-cream/90">{hint.action}</div>
    </>
  );
}

/**
 * 3D floating prompt attached to the interactable object (door, rack, item).
 * Renders a key chip, gauge readout, or plain label depending on the active prompt's display variant.
 */
export function ProximityPromptMarker(props: ProximityPromptMarkerProps) {
  const worldPos = resolveHintWorldPosition(props);
  if (!worldPos) return null;

  const body = renderPromptBody(props.promptDisplay, props.hint, props.gaugeValues);
  if (!body) return null;

  return (
    <Html
      position={worldPos}
      center
      pointerEvents="none"
      style={{ pointerEvents: "none" }}
      zIndexRange={[10, 100]}
    >
      <div
        className="flex flex-col items-center rounded-md bg-[#111a18]/90 px-2.5 py-1 text-center text-white shadow-md border border-white/10"
        style={{ fontSize: "11px", whiteSpace: "nowrap", minWidth: "60px" }}
      >
        {body}
      </div>
    </Html>
  );
}
