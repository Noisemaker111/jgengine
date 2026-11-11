/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { getHardwareDefinition } from "@llmville/game/infrastructure/catalog";
import type { HardwareModelId } from "@llmville/game/infrastructure/catalog";
import { rackHeatBand, type RackHeatBand } from "@llmville/game/infrastructure/infrastructure";
import { getHardwareImagePath } from "@llmville/game/world/worldModelCatalog";

import { C, FULL, Row, Text } from "../../ui/kit";

const HEAT_BADGE: Record<RackHeatBand, [string, string]> = {
  cool: ["#5fc2a8cc", "#0e231e"],
  warm: ["#f59e0bcc", "#000000"],
  hot: ["#ef4444cc", "#ffffff"],
};

/**
 * One GPU card face (or an empty bay): the product shot behind its name, speed and memory, with a
 * stack count and the card's temperature. Interaction comes from the `RuneAction` that wraps it.
 */
export default function RackSlot({ hardwareModelId, count, temperatureC, slotNumber, width }: {
  /** When set, the slot holds this hardware; otherwise it shows an empty bay. */
  hardwareModelId?: HardwareModelId | undefined;
  /** Stack count for inventory display (×2 and up). */
  count?: number | undefined;
  /** Card temperature from rack thermal v3 (°C). */
  temperatureC?: number | undefined;
  /** Slot number label for rack bays. */
  slotNumber?: number | undefined;
  width?: number | undefined;
}) {
  const hardware = hardwareModelId == null ? null : getHardwareDefinition(hardwareModelId);
  const face = hardware === null || hardwareModelId == null
    ? <RuneView height={96} grow={1} radius={12} fill="#0000001a" border={{ width: 2, color: C.line }} justify="center" items="center"><Text size={10} color="#ffffff4d">Empty</Text></RuneView>
    : <RuneView height={96} grow={1} radius={12} fill="#00000059" border={{ width: 1, color: C.line }} clip>
      <RuneView anchor="fill" image={getHardwareImagePath(hardwareModelId)} fit="contain" />
      <Row anchor="top" justify="between" items="start" padding={4} width={FULL}>
        <Text size={13} weight={800} color={C.teal} shrink>{hardware.name}</Text>
        <RuneView items="end">
          <Text size={12} weight={700}>{`${hardware.trainingPowerFp16} TFLOPS`}</Text>
          <Text size={12} weight={700} color={C.muted}>{`${hardware.vramGb} GB`}</Text>
        </RuneView>
      </Row>
      <Row anchor="bottom" justify="between" padding={4} width={FULL}>
        {temperatureC == null ? <RuneView /> : <RuneView padding={[2, 4, 2, 4]} radius={4} fill={HEAT_BADGE[rackHeatBand(temperatureC)][0]}>
          <Text size={10} weight={800} color={HEAT_BADGE[rackHeatBand(temperatureC)][1]}>{`${Math.round(temperatureC)}°C`}</Text>
        </RuneView>}
        {count !== undefined && count >= 2 ? <Text size={11} weight={800} color="#facc15">{`×${count}`}</Text> : null}
      </Row>
    </RuneView>;
  return <Row gap={8} {...(width === undefined ? { width: FULL } : { width })}>
    {slotNumber == null ? null : <Text size={10} weight={800} color="#ffffff80" minWidth={24} align="center">{String(slotNumber)}</Text>}
    {face}
  </Row>;
}
