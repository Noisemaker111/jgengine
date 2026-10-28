import { useMemo, useState } from "react";

import { generatorVariants, type GeneratorDefinition, type GeneratorVariant } from "@jgengine/core/generator/generator";
import { GeneratorVariantGrid } from "@jgengine/core/generator/GeneratorVariantGrid.draw";
import { registerBuiltinSceneKindRenderers } from "@jgengine/core/scene/builtinSceneKindRenderers.draw";

import type { EditorHostApi } from "./session";
import { FieldRow, SectionAction } from "./shell/fields";
import { INPUT_CLS } from "./shell/theme";

registerBuiltinSceneKindRenderers();

const VARIANT_COUNT = 20;

/**
 * The variant grid under a generator's params: twenty seeded variants around the object's current
 * look. Pick writes a variant onto the object, keep pins it at the front of the grid, place copies
 * the object beside itself with that variant, and reroll lays out a new set. Every action goes
 * through the same RPC verbs agents use (`apply_variant`, `place_variant`).
 * @internal
 */
export function GeneratorVariants({
  api,
  id,
  definition,
  meta,
  placeOffset,
  accent,
}: {
  api: EditorHostApi;
  id: string;
  definition: GeneratorDefinition;
  meta: Record<string, unknown> | undefined;
  /** How far `place` moves the copy along +x, in metres. */
  placeOffset: number;
  accent?: string | undefined;
}) {
  const [explore, setExplore] = useState(0.35);
  const [roll, setRoll] = useState(0);
  const [kept, setKept] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const variants = useMemo(
    () => generatorVariants(definition, meta, { count: VARIANT_COUNT, explore, seed: `roll-${roll}`, keep: kept }),
    [definition, meta, explore, roll, kept],
  );
  const current = Math.min(kept.length, variants.length - 1);
  const keptIndices = kept.map((_, index) => index);
  const report = (response: { ok: boolean; error?: string }) => setError(response.ok ? null : (response.error ?? "failed"));
  const pick = (variant: GeneratorVariant) => report(api.handle({ method: "apply_variant", id, meta: variant.meta }));
  const place = (variant: GeneratorVariant) => report(api.handle({ method: "place_variant", id, meta: variant.meta, dx: placeOffset }));
  const toggleKeep = (variant: GeneratorVariant) =>
    setKept((list) =>
      variant.index < list.length ? list.filter((_, index) => index !== variant.index) : [...list, variant.meta].slice(-VARIANT_COUNT + 1),
    );
  return (
    <div className="space-y-2" data-generator-variants={definition.id}>
      <FieldRow label="explore">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={explore}
          aria-label="How far variants wander from the current look"
          onChange={(event) => setExplore(Number(event.target.value))}
          className="w-full"
        />
      </FieldRow>
      <div className="flex items-center justify-between text-[11px] text-neutral-400">
        <span>Click a tile to apply it.</span>
        <SectionAction label="Lay out a new set of variants" onClick={() => setRoll((value) => value + 1)}>
          reroll
        </SectionAction>
      </div>
      <GeneratorVariantGrid
        definition={definition}
        variants={variants}
        selected={current}
        kept={keptIndices}
        onPick={pick}
        columns={4}
        {...(accent === undefined ? {} : { accent })}
        actions={(variant) => (
          <div className="flex justify-between text-[10px]">
            <button type="button" className={`${INPUT_CLS} px-1`} onClick={() => toggleKeep(variant)}>
              {variant.index < kept.length ? "unkeep" : "keep"}
            </button>
            <button type="button" className={`${INPUT_CLS} px-1`} onClick={() => place(variant)}>
              place
            </button>
          </div>
        )}
      />
      {error === null ? null : <div className="text-[11px] text-red-400">{error}</div>}
    </div>
  );
}
