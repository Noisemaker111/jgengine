import { markerKindStyle, type MarkerCollection, type MarkerKindStyle } from "@jgengine/core/world/markers";
import { useMarkers } from "@jgengine/react/map";

export interface MapMarkerBeaconsProps {
  /** Static views, an external marker source, or a native JGengine MarkerSet. */
  markers: MarkerCollection;
  kindStyles?: Record<string, MarkerKindStyle>;
  height?: number;
}

/**
 * World-space beacons for map markers (the visible in-world side of a ping):
 * a floating diamond over a soft light beam, colored by marker kind. Wire it
 * through `PlayableGame.WorldOverlay`.
 */
export function MapMarkerBeacons({ markers, kindStyles, height = 5 }: MapMarkerBeaconsProps) {
  const list = useMarkers(markers);
  return (
    <>
      {list.map((marker) => {
        const style: MarkerKindStyle = markerKindStyle(marker.kind, kindStyles);
        const baseY = marker.position[1];
        return (
          <group key={marker.id} position={[marker.position[0], baseY, marker.position[2]]}>
            <mesh position-y={height / 2}>
              <cylinderGeometry args={[0.09, 0.09, height, 6]} />
              <meshBasicMaterial color={style.color} transparent opacity={0.4} />
            </mesh>
            <mesh position-y={height + 0.5} rotation={[0, Math.PI / 4, 0]}>
              <octahedronGeometry args={[0.55, 0]} />
              <meshBasicMaterial color={style.color} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position-y={0.06}>
              <ringGeometry args={[0.7, 0.95, 24]} />
              <meshBasicMaterial color={style.color} transparent opacity={0.75} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
