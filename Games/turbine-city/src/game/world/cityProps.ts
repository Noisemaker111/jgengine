import { yawRight } from "@jgengine/core/movement/steering";
import { scatter } from "@jgengine/core/world/scatter";

import type { Vec3 } from "../flight/flowTube";
import { ANTENNA_OBJECT, BANNER_OBJECT, BRIDGE_OBJECT, FAN_HOUSING_OBJECT, FAN_ROTOR_OBJECT, RING_GATE_OBJECT, WINDSOCK_OBJECT } from "../objects/catalog";
import { FANS, FLOW_TUBES, RING_NODES } from "../race/route";
import { BUILDING_ZONES } from "./zones";

export interface PropPlacement {
  readonly catalogId: string;
  readonly instanceId: string;
  readonly position: Vec3;
  readonly rotationY: number;
  readonly scale?: readonly [number, number, number];
}

function headingBetween(from: Vec3, to: Vec3): number {
  return Math.atan2(to[0] - from[0], to[2] - from[2]);
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function lateralOffset(from: Vec3, to: Vec3, distance: number, side: 1 | -1): Vec3 {
  const [rx, rz] = yawRight(headingBetween(from, to));
  return [rx * distance * side, 0, rz * distance * side];
}

function fanTube(fanId: string) {
  const tube = FLOW_TUBES.find((t) => t.fanId === fanId);
  if (tube === undefined) throw new Error(`fanTube: no tube for fan "${fanId}"`);
  return tube;
}

function buildFanProps(): PropPlacement[] {
  const props: PropPlacement[] = [];
  for (const fan of FANS) {
    const tube = fanTube(fan.id);
    const heading = headingBetween(tube.from, tube.to);
    const rotorPosition = lerpVec3(tube.from, tube.to, 0.06);
    props.push({ catalogId: FAN_HOUSING_OBJECT, instanceId: `${fan.id}-housing`, position: tube.from, rotationY: heading });
    props.push({ catalogId: FAN_ROTOR_OBJECT, instanceId: `${fan.id}-rotor`, position: rotorPosition, rotationY: heading });
    const sockOffset = lateralOffset(tube.from, tube.to, tube.radius + 5, 1);
    props.push({
      catalogId: WINDSOCK_OBJECT,
      instanceId: `${fan.id}-sock`,
      position: [tube.from[0] + sockOffset[0], tube.from[1] - 2, tube.from[2] + sockOffset[2]],
      rotationY: heading,
    });
  }
  return props;
}

function buildRingProps(): PropPlacement[] {
  return RING_NODES.map((node, i) => {
    const next = RING_NODES[Math.min(i + 1, RING_NODES.length - 1)]!;
    const prev = RING_NODES[Math.max(i - 1, 0)]!;
    const heading = i === 0 ? headingBetween(node.position, next.position) : headingBetween(prev.position, node.position);
    return { catalogId: RING_GATE_OBJECT, instanceId: `ring-gate-${i + 1}`, position: node.position, rotationY: heading };
  });
}

function buildConnectorDressing(): PropPlacement[] {
  const connectorTubes = FLOW_TUBES.filter((t) => t.fanId === null);
  const props: PropPlacement[] = [];
  connectorTubes.forEach((tube, i) => {
    const heading = headingBetween(tube.from, tube.to);
    const mid = lerpVec3(tube.from, tube.to, 0.5);
    const sockOffset = lateralOffset(tube.from, tube.to, tube.radius + 4, -1);
    props.push({
      catalogId: WINDSOCK_OBJECT,
      instanceId: `connector-sock-${i + 1}`,
      position: [mid[0] + sockOffset[0], mid[1] - 1, mid[2] + sockOffset[2]],
      rotationY: heading,
    });
  });
  return props;
}

function buildBanners(): PropPlacement[] {
  return FLOW_TUBES.map((tube, i) => {
    const heading = headingBetween(tube.from, tube.to);
    const mid = lerpVec3(tube.from, tube.to, 0.5);
    const offset = lateralOffset(tube.from, tube.to, tube.radius + 8, i % 2 === 0 ? 1 : -1);
    return {
      catalogId: BANNER_OBJECT,
      instanceId: `banner-${i + 1}`,
      position: [mid[0] + offset[0], mid[1] + 4, mid[2] + offset[2]],
      rotationY: heading,
      scale: [9, 2.4, 0.4] as const,
    };
  });
}

function buildBridges(): PropPlacement[] {
  return RING_NODES.filter((_, i) => i % 2 === 1).map((node, i) => ({
    catalogId: BRIDGE_OBJECT,
    instanceId: `bridge-${i + 1}`,
    position: [node.position[0], node.position[1] + 9, node.position[2]],
    rotationY: Math.PI / 2,
    scale: [22, 1, 3] as const,
  }));
}

function buildAntennae(): PropPlacement[] {
  const props: PropPlacement[] = [];
  for (const zone of BUILDING_ZONES) {
    const points = scatter({
      area: { w: zone.footprint.w * 1.3, d: zone.footprint.d * 1.3, center: [zone.position[0], zone.position[1]] },
      count: 5,
      seed: `turbine-city-antenna-${zone.id}`,
      minDistance: 6,
    });
    points.forEach((p, i) => {
      props.push({
        catalogId: ANTENNA_OBJECT,
        instanceId: `antenna-${zone.id}-${i + 1}`,
        position: [p.x, zone.roofHeight, p.z],
        rotationY: 0,
        scale: [0.6, 6, 0.6] as const,
      });
    });
  }
  return props;
}

export function buildCityProps(): readonly PropPlacement[] {
  return [...buildFanProps(), ...buildRingProps(), ...buildConnectorDressing(), ...buildBanners(), ...buildBridges(), ...buildAntennae()];
}
