/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import { markerKindStyle, type MarkerCollection, type MarkerKindStyle } from "@jgengine/core/map/markers";
import { markerAccess } from "@jgengine/core/map/map.view";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

/** Props for `MapMarkerBeacons`: the markers to raise as world beacons, kind styles and beacon height. */
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
export function mapMarkerBeaconsDraw({ markers, kindStyles, height = 5 }: MapMarkerBeaconsProps): EngineDraw {
  const access = markerAccess(markers);
  const group = new THREE.Group();
  const beamGeometry = new THREE.CylinderGeometry(0.09, 0.09, 1, 6);
  const diamondGeometry = new THREE.OctahedronGeometry(0.55, 0);
  const ringGeometry = new THREE.RingGeometry(0.7, 0.95, 24);
  const beamMaterials = new Map<string, THREE.MeshBasicMaterial>();
  const solidMaterials = new Map<string, THREE.MeshBasicMaterial>();
  const ringMaterials = new Map<string, THREE.MeshBasicMaterial>();
  const cached = (cache: Map<string, THREE.MeshBasicMaterial>, color: string, opacity?: number) => {
    const key = `${color}:${opacity ?? 1}`;
    let material = cache.get(key);
    if (material === undefined) {
      material = opacity === undefined
        ? new THREE.MeshBasicMaterial({ color })
        : new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
      cache.set(key, material);
    }
    return material;
  };
  let drawn = "";
  const rebuild = () => {
    const list = access.getSnapshot();
    const key = list.map((marker) => `${marker.id}:${marker.position.join(",")}:${marker.kind}`).join("|");
    if (key === drawn) return;
    drawn = key;
    group.clear();
    for (const marker of list) {
      const style = markerKindStyle(marker.kind, kindStyles);
      const baseY = marker.position[1];
      const holder = new THREE.Group();
      holder.position.set(marker.position[0], baseY, marker.position[2]);
      const beam = new THREE.Mesh(beamGeometry, cached(beamMaterials, style.color, 0.4));
      beam.scale.y = height;
      beam.position.y = height / 2;
      const diamond = new THREE.Mesh(diamondGeometry, cached(solidMaterials, style.color));
      diamond.position.y = height + 0.5;
      diamond.rotation.y = Math.PI / 4;
      const ring = new THREE.Mesh(ringGeometry, cached(ringMaterials, style.color, 0.75));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      holder.add(beam, diamond, ring);
      group.add(holder);
    }
  };
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      rebuild();
    },
    frame(_state: EngineFrameState) {
      rebuild();
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      beamGeometry.dispose();
      diamondGeometry.dispose();
      ringGeometry.dispose();
      for (const material of [...beamMaterials.values(), ...solidMaterials.values(), ...ringMaterials.values()]) material.dispose();
    },
  };
}

export function MapMarkerBeacons(props: MapMarkerBeaconsProps) {
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => mapMarkerBeaconsDraw(latest.current), [props.markers, props.kindStyles, props.height]);
  return null;
}
