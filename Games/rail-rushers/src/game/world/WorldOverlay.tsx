import { groundFieldFor } from "@jgengine/core/world/terrain";

import { nodeById, RAIL_EDGES, type RailEdge } from "../rail/network";
import { world } from "../../world";

const terrainField = groundFieldFor(world);

function groundHeightAt(x: number, z: number): number {
  return terrainField.sampleHeight(x, z);
}

const RAIL_COLOR = "#6b705c";
const TIE_COLOR = "#a98467";
const TRESTLE_COLOR = "#8a6f52";

function RailRibbon({ edge }: { edge: RailEdge }) {
  const a = nodeById(edge.from).position;
  const b = nodeById(edge.to).position;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  const midX = (a[0] + b[0]) / 2;
  const midZ = (a[1] + b[1]) / 2;
  const angle = Math.atan2(dx, dz);
  const isTrestle = edge.kind === "trestle";
  const deckY = isTrestle ? Math.max(groundHeightAt(a[0], a[1]), groundHeightAt(b[0], b[1])) + 3.5 : groundHeightAt(midX, midZ) + 0.04;

  return (
    <group>
      <mesh position={[midX, deckY, midZ]} rotation={[-Math.PI / 2, 0, angle]}>
        <planeGeometry args={[1.9, length]} />
        <meshStandardMaterial color={isTrestle ? TRESTLE_COLOR : RAIL_COLOR} roughness={0.85} />
      </mesh>
      {isTrestle &&
        Array.from({ length: Math.max(2, Math.round(length / 8)) }).map((_, i, arr) => {
          const t = (i + 0.5) / arr.length;
          const x = a[0] + dx * t;
          const z = a[1] + dz * t;
          const groundY = groundHeightAt(x, z);
          const pierHeight = Math.max(1, deckY - groundY);
          return (
            <mesh key={i} position={[x, groundY + pierHeight / 2, z]} castShadow>
              <boxGeometry args={[1.1, pierHeight, 1.1]} />
              <meshStandardMaterial color="#5a4632" roughness={0.9} />
            </mesh>
          );
        })}
    </group>
  );
}

function TunnelPortals() {
  const portalEdge = RAIL_EDGES.find((e) => e.kind === "tunnel");
  if (portalEdge === undefined) return null;
  const a = nodeById(portalEdge.from).position;
  const b = nodeById(portalEdge.to).position;
  return (
    <>
      {[a, b].map((position, index) => {
        const y = groundHeightAt(position[0], position[1]);
        return (
          <mesh key={index} position={[position[0], y + 2.2, position[1]]} castShadow>
            <boxGeometry args={[4.2, 4.4, 2.6]} />
            <meshStandardMaterial color="#3f4137" roughness={0.95} />
          </mesh>
        );
      })}
    </>
  );
}

export function RailRushersWorldOverlay() {
  return (
    <>
      {RAIL_EDGES.filter((edge) => edge.kind !== "tunnel").map((edge) => (
        <RailRibbon key={edge.id} edge={edge} />
      ))}
      <TunnelPortals />
    </>
  );
}
