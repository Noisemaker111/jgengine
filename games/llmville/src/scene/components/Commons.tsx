/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo } from "@jgengine/core/ui/jsx";
import type { DatacenterClaim } from "@llmville/game/datacenter/claims";
import { cellKey, worldToCell } from "@llmville/game/datacenter/grid";

import { commonsPieces } from "../../world/commons";
import BuildProp from "./BuildProp";

const PIECES = commonsPieces();

/**
 * The Commons' furniture from the scene file. A piece on a cell a lab already holds (claimed before the
 * Commons existed) gives way to that lab and is not drawn.
 */
export function Commons({ claims }: { claims: readonly DatacenterClaim[] }) {
  const claimed = useMemo(() => new Set(claims.map((claim) => cellKey(claim))), [claims]);
  return (
    <>
      {PIECES.filter((piece) => !claimed.has(cellKey(worldToCell(piece.x, piece.z)))).map((piece) => (
        <BuildProp key={piece.id} itemId={piece.itemId} x={piece.x} y={piece.y} z={piece.z} direction={piece.direction} />
      ))}
    </>
  );
}
