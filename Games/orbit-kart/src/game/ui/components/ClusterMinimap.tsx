import { Minimap } from "@jgengine/react/map";
import { useGameStore } from "@jgengine/react/hooks";
import { useDisplayProfile } from "@jgengine/react/display";
import type { MarkerKindStyle } from "@jgengine/core/world/markers";
import { PLAYER_ID } from "../../constants";
import { readMarkers } from "../../race/markersStore";
import { readSnapshot } from "../../race/sessionStore";
import { PALETTE } from "../../theme";

const CLUSTER_MARKER_STYLES: Record<string, MarkerKindStyle> = {
  well: { id: "well", color: PALETTE.planetMint, glyph: "◉", priority: 40 },
  checkpoint: { id: "checkpoint", color: PALETTE.boostTangerine, glyph: "◇", priority: 60 },
  kart_player: { id: "kart_player", color: PALETTE.starlight, glyph: "▲", priority: 100 },
  kart_rival_cautious: { id: "kart_rival_cautious", color: PALETTE.planetMint, glyph: "●", priority: 80 },
  kart_rival_aggressive: { id: "kart_rival_aggressive", color: PALETTE.boostTangerine, glyph: "●", priority: 80 },
};

export function ClusterMinimap() {
  const markers = useGameStore(readMarkers);
  const snapshot = useGameStore(readSnapshot);
  const { compact } = useDisplayProfile();
  if (markers === undefined || snapshot === null) return null;
  const player = snapshot.karts[PLAYER_ID];
  return (
    <div className="absolute right-2 top-14 sm:right-4 sm:top-16">
      <Minimap
        markers={markers}
        center={player !== undefined ? [player.position[0], player.position[2]] : [0, 0]}
        worldRadius={175}
        size={compact ? 140 : 188}
        facingYaw={player?.heading ?? 0}
        kindStyles={CLUSTER_MARKER_STYLES}
        title="Cluster Chart"
        className="border border-[#f5f3ff]/20"
      />
    </div>
  );
}
