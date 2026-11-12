/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, type ReactNode } from "@jgengine/core/ui/jsx";

import { createHitMarkers, isLocalSource, type HitMarkerKind, type HitMarkers, type HitMarkerTiming } from "@jgengine/core/combat/hitMarker";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { RuneGlyph, RuneView, type RuneViewProps } from "@jgengine/core/ui/rune/primitives.view";
import { useGameContext } from "@jgengine/ui/provider";

/** Game clock in milliseconds: the marker pauses with the game and slows under hit-stop. */
function gameMs(ctx: { time: { now(): number } }): number {
  return ctx.time.now() * 1000;
}

/**
 * The hit-marker model for the current world, listening to `combat.damage` for the local player's
 * confirmed hits on the game clock. The model is rebuilt when the world (or the timing object)
 * changes; keep `timing` a module constant.
 *
 * @capability use-hit-markers UI hook that feeds the local player's confirmed hits, crits and kills into a hit-marker model
 */
export function useHitMarkers(timing: HitMarkerTiming): HitMarkers {
  const ctx = useGameContext();
  const markers = useMemo(() => createHitMarkers(timing, (id) => isLocalSource(ctx, id)), [ctx, timing]);
  useEffect(() => markers.listen(ctx.game.events, () => gameMs(ctx)), [ctx, markers]);
  return markers;
}

/** Props for {@link HitMarkerCue}. Every look and number is the game's. */
export interface HitMarkerCueProps {
  /** The marker's pop, hold and fade. Keep it a module constant so the model is built once per world. */
  timing: HitMarkerTiming;
  /** SVG artwork for the tick, drawn in each kind's colour. */
  artwork: string;
  /** Artwork edge in points. */
  size: number;
  /** Colour per kind. */
  colors: Readonly<Record<HitMarkerKind, string>>;
  /** Extra content shown only while a marker of that kind is up (a "KILL" stamp under the tick). */
  labels?: Partial<Record<HitMarkerKind, ReactNode>>;
  /** Where the cue sits. Default `"center"`, over the crosshair. */
  anchor?: RuneViewProps["anchor"];
  /** Space between the tick and a label. Default 0. */
  gap?: number;
}

/**
 * A hit marker on the HUD: when the local player's blow lands, a tick pops over the crosshair and
 * fades, in the colour of the strongest blow of the volley (hit, crit or kill). It reads the model
 * through bound leaves, so the HUD does not re-render per frame.
 *
 * @capability hit-marker-cue Rune HUD hit marker that pops and fades over the crosshair, distinct for crits and kills
 */
export function HitMarkerCue({ timing, artwork, size, colors, labels, anchor = "center", gap = 0 }: HitMarkerCueProps) {
  const ctx = useGameContext();
  const markers = useHitMarkers(timing);
  const frame = () => markers.frame(gameMs(ctx));
  return (
    <RuneView anchor={anchor} items="center" gap={gap} opacity={bind(() => frame()?.opacity ?? 0)} scale={bind(() => frame()?.scale ?? 1)}>
      <RuneGlyph artwork={artwork} size={size} color={bind(() => colors[frame()?.kind ?? "hit"])} />
      {(Object.keys(labels ?? {}) as HitMarkerKind[]).map((kind) => (
        <RuneView key={kind} hidden={bind(() => frame()?.kind !== kind)}>{labels?.[kind]}</RuneView>
      ))}
    </RuneView>
  );
}
