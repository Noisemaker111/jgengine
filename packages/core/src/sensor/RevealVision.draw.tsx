// @skill jgengine-world
import { useMemo, useRef } from "react";
import { CapsuleGeometry, ConeGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry } from "three";

import { createRevealQuery, type RevealHit } from "@jgengine/core/sensor/revealQuery";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";
import { usePlayer, useSceneEntities } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

/** Which entities reveal vision finds: origin, radius, wanted tags and how to read an entity's tags. */
export interface RevealVisionOptions {
  originEntityId?: string;
  radius: number;
  tags: readonly string[];
  resolveTags: (entity: SceneEntity) => readonly string[];
}

function revealHits(
  entities: readonly SceneEntity[],
  originId: string,
  options: RevealVisionOptions,
): readonly RevealHit[] {
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
}

/** Occlusion-ignoring tagged-entity radius query (#115), bound to the live scene and refreshed on render. */
export function useRevealHits(options: RevealVisionOptions): readonly RevealHit[] {
  const entities = useSceneEntities();
  const player = usePlayer();
  const originId = options.originEntityId ?? player.userId;
  const tagsKey = options.tags.join("|");

  return useMemo(
    () => revealHits(entities, originId, options),
    [entities, originId, options.radius, tagsKey, options.tags, options.resolveTags],
  );
}

/** Props for `RevealHighlights`: reveal options, on/off and highlight colour. */
export interface RevealHighlightsProps extends RevealVisionOptions {
  enabled: boolean;
  color?: string;
}

interface HighlightEntry {
  group: Group;
  materials: MeshBasicMaterial[];
}

/**
 * Screen-space reveal effect (#115) — highlights tagged entities through
 * occluders (Dark Sight / detective-vision / wallhack style). Draws with
 * `depthTest: false` so the highlight shows over any wall standing between
 * the origin and the revealed entity, rather than the usual depth-sorted scene.
 * Highlights track the origin and their targets every frame while enabled, so
 * a disabled mode costs no renders.
 * @internal
 */
export function revealHighlightsDraw(getProps: () => RevealHighlightsProps, ctx: GameContext): EngineDraw {
  const root = new Group();
  const entries = new Map<string, HighlightEntry>();
  const seen = new Set<string>();
  const capsuleGeometry = new CapsuleGeometry(0.42, 1.2, 6, 14);
  const coneGeometry = new ConeGeometry(0.14, 0.3, 12);
  const ringGeometry = new RingGeometry(0.55, 0.85, 32);

  const disposeEntry = (entry: HighlightEntry) => {
    for (const material of entry.materials) material.dispose();
    root.remove(entry.group);
  };

  const ensureEntry = (id: string, color: string): HighlightEntry => {
    const existing = entries.get(id);
    if (existing !== undefined) return existing;
    const group = new Group();
    const materials: MeshBasicMaterial[] = [];
    const materialFor = (opacity: number) => {
      const material = new MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false });
      materials.push(material);
      return material;
    };
    const capsule = new Mesh(capsuleGeometry, materialFor(0.7));
    capsule.position.y = 0.95;
    capsule.renderOrder = 999;
    const cone = new Mesh(coneGeometry, materialFor(0.85));
    cone.position.y = 2.6;
    cone.renderOrder = 999;
    const ring = new Mesh(ringGeometry, materialFor(0.9));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    ring.renderOrder = 999;
    const ringMaterial = materials[2]!;
    ringMaterial.side = DoubleSide;
    group.add(capsule, cone, ring);
    root.add(group);
    const entry: HighlightEntry = { group, materials };
    entries.set(id, entry);
    return entry;
  };

  const sync = (_state: EngineFrameState) => {
    const props = getProps();
    if (!props.enabled) {
      if (entries.size > 0) {
        for (const entry of entries.values()) disposeEntry(entry);
        entries.clear();
      }
      return;
    }
    const color = props.color ?? "#7dd3fc";
    const entities = ctx.scene.entity.list();
    const originId = props.originEntityId ?? ctx.player.userId;
    const hits = revealHits(entities, originId, props);
    seen.clear();
    for (const hit of hits) {
      const entity = entities.find((candidate) => candidate.id === hit.instanceId);
      if (entity === undefined) continue;
      seen.add(hit.instanceId);
      const entry = ensureEntry(hit.instanceId, color);
      entry.group.position.set(entity.position[0], entity.position[1], entity.position[2]);
      const pulse = Math.max(0.25, 1 - hit.distance / Math.max(props.radius, 1));
      entry.materials[0]!.opacity = 0.55 + pulse * 0.35;
      entry.materials[1]!.opacity = 0.85;
      entry.materials[2]!.opacity = 0.9;
      for (const material of entry.materials) material.color.set(color);
    }
    for (const [id, entry] of entries) {
      if (seen.has(id)) continue;
      disposeEntry(entry);
      entries.delete(id);
    }
  };

  return {
    mount(state: EngineFrameState) {
      state.scene.add(root);
    },
    frame: sync,
    update: sync,
    dispose(state: EngineFrameState) {
      for (const entry of entries.values()) disposeEntry(entry);
      entries.clear();
      state.scene.remove(root);
      root.clear();
      capsuleGeometry.dispose();
      coneGeometry.dispose();
      ringGeometry.dispose();
    },
  };
}

/**
 * Screen-space reveal effect (#115) — highlights tagged entities through
 * occluders (Dark Sight / detective-vision / wallhack style). Renders with
 * `depthTest: false` so the highlight draws over any wall standing between
 * the origin and the revealed entity, rather than the usual depth-sorted scene.
 * Highlights track the origin and their targets every frame while enabled, so
 * a disabled mode costs no renders.
 */
export function RevealHighlights(props: RevealHighlightsProps) {
  const ctx = useGameContext();
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => revealHighlightsDraw(() => latest.current, ctx), [ctx]);
  return null;
}

/** Props for `RevealScreenTint`: on/off, tint colour and class name. */
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
