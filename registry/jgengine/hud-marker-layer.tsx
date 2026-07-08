import { WaypointMarker, type WaypointMarkerKind } from "@/components/ui/waypoint-marker";

export interface HudMarker {
  id: string;
  x: number;
  y: number;
  label?: string;
  distance?: string;
  kind?: WaypointMarkerKind;
  clamped?: boolean;
  arrowAngle?: number;
}

export function HudMarkerLayer({ markers, className }: { markers: readonly HudMarker[]; className?: string }) {
  return (
    <span className={`pointer-events-none absolute inset-0 ${className ?? ""}`} data-jg="hud-marker-layer">
      {markers.map((marker) => (
        <WaypointMarker
          key={marker.id}
          x={marker.x}
          y={marker.y}
          label={marker.label}
          distance={marker.distance}
          kind={marker.kind}
          clamped={marker.clamped}
          arrowAngle={marker.arrowAngle}
        />
      ))}
    </span>
  );
}
