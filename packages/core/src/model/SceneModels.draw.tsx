// @skill jgengine-assets
import { Component, Suspense, useMemo, useSyncExternalStore, type ReactNode } from "react";

import type { EntitySpriteConfig, ModelConfig } from "@jgengine/core/game/playableGame";
import { reportFallbackSeam, type FallbackSeam } from "@jgengine/core/devtools/fallbackSeams";
import { useOptionalGameContext } from "@jgengine/react/provider";
import { modelForLook } from "./modelLook";

import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import {
  entityModelDraw,
  entitySpriteDraw,
  isolatedEntityModelDraw,
  type MeasureTarget,
} from "./entityModelDraw.draw";

/** Draws an entity as a camera-facing sprite, playing its atlas clip when it has one. */
export function EntitySprite({ sprite }: { sprite: EntitySpriteConfig }) {
  return <EngineDrawMount create={() => entitySpriteDraw(sprite)} deps={[sprite]} />;
}

/**
 * Catches a render throw from a model subtree and swaps in `fallback` — but never silently: the
 * failed state re-reports to the fallback-seam probe on every render (matching the per-seam frame
 * boundary in `WorldScene`) and the catch warns once with the model url and the error. Without
 * that, a throw anywhere in a composition erases the actor with an empty `probes.fallbacks`.
 * @internal
 */
export class ModelFallbackBoundary extends Component<
  { fallback: ReactNode; children: ReactNode; url: string; seam?: FallbackSeam | undefined },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override componentDidCatch(error: unknown): void {
    if (typeof console === "undefined") return;
    console.warn(
      `[jgengine] model "${this.props.url}" threw while rendering and was replaced by its fallback ` +
        `(nothing, unless one was supplied). Fix the throw below — the actor is invisible until then.`,
      error,
    );
  }
  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    reportFallbackSeam(this.props.seam ?? "entity", "renderError");
    return this.props.fallback;
  }
}

/**
 * One model subtree behind its own error boundary and Suspense boundary, so a throwing or
 * still-loading piece cannot erase its siblings. Every nested piece of a composition — parts,
 * attachments, material maps — mounts through this.
 * @internal
 */
export function IsolatedModelPart({
  model,
  seam,
  children,
}: {
  model: ModelConfig;
  seam?: FallbackSeam | undefined;
  children: ReactNode;
}) {
  return (
    <ModelFallbackBoundary fallback={null} url={model.url} seam={seam}>
      <Suspense fallback={null}>{children}</Suspense>
    </ModelFallbackBoundary>
  );
}

const noLookChanges = () => () => {};

/**
 * `model` as the live entity `instanceId` draws it: its current `look` laid over the model
 * ({@link modelForLook}), re-rendering only when the look changes. Without an entity, the model itself.
 */
export function useEntityLookModel(model: ModelConfig | undefined, instanceId: string | undefined): ModelConfig | undefined {
  const ctx = useOptionalGameContext();
  const readLook = () => (ctx === null || instanceId === undefined ? undefined : ctx.scene.entity.get(instanceId)?.look);
  const look = useSyncExternalStore(
    ctx === null || instanceId === undefined || model?.looks === undefined ? noLookChanges : ctx.subscribe,
    readLook,
    readLook,
  );
  return useMemo(() => (model === undefined ? undefined : modelForLook(model, look)), [model, look]);
}

interface IsolatedEntityModelProps {
  model: ModelConfig;
  instanceId?: string | undefined;
  measure?: MeasureTarget;
  /** Sprite drawn in place of the model when its load or build fails. */
  sprite?: EntitySpriteConfig | undefined;
}

/** Draws one entity model from its own loaded copy, for models that cannot share a batched instance; a live `instanceId` draws its `look`. */
export function IsolatedEntityModel(props: IsolatedEntityModelProps) {
  const { model, instanceId, measure, sprite } = props;
  const ctx = useOptionalGameContext();
  return (
    <EngineDrawMount
      create={() =>
        isolatedEntityModelDraw({
          model,
          instanceId,
          measure,
          ctx,
          seam: measure?.target,
          fallback: sprite === undefined ? undefined : () => entitySpriteDraw(sprite),
        })
      }
      // `model` identity covers look-driven rebuilds upstream; the draw itself
      // subscribes to the entity for look/held/worn/motion changes.
      deps={[model, instanceId, measure?.target, measure?.key, sprite, ctx]}
    />
  );
}

/** Draws an entity's model at the given LOD level, with animation, paint layer and bounds measurement. */
export function EntityModel({
  model,
  instanceId,
  measure,
  lodLevel = 0,
}: {
  model: ModelConfig;
  instanceId?: string | undefined;
  measure?: MeasureTarget | undefined;
  /** The variant level being drawn. Past the source level, a simplified asset may have dropped a selected slot. */
  lodLevel?: number;
}) {
  const ctx = useOptionalGameContext();
  return (
    <EngineDrawMount
      create={() => entityModelDraw({ model, instanceId, measure, lodLevel, ctx, seam: measure?.target })}
      deps={[model, instanceId, measure?.target, measure?.key, lodLevel, ctx]}
    />
  );
}
