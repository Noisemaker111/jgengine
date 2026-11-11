/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import type { HardwareModelId } from "@llmville/game/infrastructure/catalog";
import { getHardwareImagePath } from "@llmville/game/world/worldModelCatalog";

/** The card's product shot, fitted inside a dark tile. */
export function GpuModelPreview({ hardwareModelId, size = 64 }: { hardwareModelId: HardwareModelId; size?: number }) {
  return <RuneView width={size} height={size} radius={8} fill="#0f172acc" border={{ width: 1, color: "#ffffff1a" }} clip padding={4}>
    <RuneView width={size - 8} height={size - 8} image={getHardwareImagePath(hardwareModelId)} fit="contain" />
  </RuneView>;
}
