import { useMemo } from "react";
import { DoubleSide } from "three";

import { createRevealQuery, type RevealHit } from "@jgengine/core/sensor/revealQuery";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { usePlayer, useSceneEntities } from "@jgengine/react/hooks";

export interface RevealVisionOptions {
  originEntityId?: string;
  radius: number;
  tags: readonly string[];
  resolveTags: (entity: SceneEntity) => readonly string[];
}

/** Occlusion-ignoring tagged-entity radius query (#115), bound to the live scene. */
export function useRevealHits(options: RevealVisionOptions): readonly RevealHit[] {
  const entities = useSceneEntities();
  const player = usePlayer();
  const originId = options.originEntityId ?? player.userId;
  const tagsKey = options.tags.join("|");

  return useMemo(() => {
    const byId = new Map(entities.map((entity) => [entity.id, entity] as const));
    const query = createRevealQuery({
      resolvePosition: (id) => byId.get(id)?.position,
      resolveTags: (id) => {
        const entity = byId.get(id);
        return entity === undefined ? [] : options.resolveTags(entity);
      },
      candidates: () => entities.map((entity) => entity.id),
    });
    return query.inRadius(originId, options.radius, options.tags);
  }, [entities, originId, options.radius, tagsKey, options.tags, options.resolveTags]);
}

export interface RevealHighlightsProps extends RevealVisionOptions {
  enabled: boolean;
  color?: string;
}

/**
 * Screen-space reveal effect (#115) — highlights tagged entities through
 * occluders (Dark Sight / detective-vision / wallhack style). Renders with
 * `depthTest: false` so the highlight draws over any wall standing between
 * the origin and the revealed entity, rather than the usual depth-sorted scene.
 */
export function RevealHighlights(props: RevealHighlightsProps) {
  const { enabled, color = "#7dd3fc" } = props;
  const hits = useRevealHits(props);
  const entities = useSceneEntities();

  if (!enabled) return null;

  return (
    <>
      {hits.map((hit) => {
        const entity = entities.find((candidate) => candidate.id === hit.instanceId);
        if (entity === undefined) return null;
        const pulse = Math.max(0.25, 1 - hit.distance / Math.max(props.radius, 1));
        return (
          <group key={hit.instanceId} position={[entity.position[0], entity.position[1], entity.position[2]]}>
            <mesh position-y={0.95} renderOrder={999}>
              <capsuleGeometry args={[0.42, 1.2, 6, 14]} />
              <meshBasicMaterial color={color} transparent opacity={0.55 + pulse * 0.35} depthTest={false} />
            </mesh>
            <mesh position-y={2.6} renderOrder={999}>
              <coneGeometry args={[0.14, 0.3, 12]} />
              <meshBasicMaterial color={color} transparent opacity={0.85} depthTest={false} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position-y={0.04} renderOrder={999}>
              <ringGeometry args={[0.55, 0.85, 32]} />
              <meshBasicMaterial color={color} transparent opacity={0.9} depthTest={false} side={DoubleSide} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

export interface RevealScreenTintProps {
  enabled: boolean;
  color?: string;
  className?: string;
}

/** Full-screen desaturating tint that reads as "vision mode is on" (Dark Sight / thermal / detective vision). */
export function RevealScreenTint({ enabled, color = "rgba(56, 189, 248, 0.16)", className }: RevealScreenTintProps) {
  if (!enabled) return null;
  return (
    <div
      className={className ?? "pointer-events-none absolute inset-0 z-10 mix-blend-screen"}
      style={{
        background: `radial-gradient(circle at 50% 50%, transparent 25%, ${color} 100%)`,
        filter: "saturate(0.55) contrast(1.15) brightness(0.92)",
      }}
    />
  );
}
