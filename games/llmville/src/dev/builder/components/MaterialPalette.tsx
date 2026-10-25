import { Check } from "lucide-react";

import { BuilderIcon } from "@/dev/builder/components/builderIcons";
import { BUILDER_CSS } from "@/dev/builder/components/builderStyles";
import { BuilderStore, type BuilderMaterialOption, useBuilderState } from "@/dev/builder/builderStore";
import { cn } from "@/components/ui/cn";
import { useMaterialOptions } from "@/dev/builder/components/useMaterialOptions";

const CATEGORY_LABEL: Record<BuilderMaterialOption["category"], string> = {
  floor: "Floor",
  wall: "Wall",
  object: "Object",
};

export function MaterialPalette() {
  const state = useBuilderState();
  const options = useMaterialOptions(state.materialRegistry);
  const grouped = groupByCategory(options);

  return (
    <>
      <section className={BUILDER_CSS.propsSection}>
        <p className={BUILDER_CSS.propsSectionLabel}>Active material</p>
        <select
          className={cn(BUILDER_CSS.selectField, "h-9")}
          value={state.activeMaterialKey}
          onChange={(event) => BuilderStore.setActiveMaterialKey(event.target.value)}
        >
          {[...grouped.floor, ...grouped.wall, ...grouped.object].map((material) => (
            <option key={material.key} value={material.key}>
              {material.label} · {CATEGORY_LABEL[material.category]}
            </option>
          ))}
        </select>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            className={BUILDER_CSS.secondaryButton}
            onClick={() => BuilderStore.applyMaterialToSelection()}
            disabled={state.selectedRefs.length === 0}
          >
            <BuilderIcon id="paint" size="sm" active />
            Paint selection
          </button>
          <button
            type="button"
            className={BUILDER_CSS.defaultButton}
            onClick={() => BuilderStore.applyMaterialToFloor()}
          >
            <BuilderIcon id="floor" size="sm" />
            Floor
          </button>
          <button
            type="button"
            className={BUILDER_CSS.defaultButton}
            onClick={() => BuilderStore.applyMaterialToWalls()}
          >
            <BuilderIcon id="wall-surface" size="sm" />
            Walls
          </button>
        </div>
      </section>

      <section className={BUILDER_CSS.propsSection}>
        <p className={BUILDER_CSS.propsSectionLabel}>Swatches</p>
        <div className="grid gap-2">
          {(Object.keys(grouped) as Array<BuilderMaterialOption["category"]>).map((category) => {
            const items = grouped[category];
            if (items.length === 0) return null;
            return (
              <div key={category} className="grid gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-cream-dim)]/70">
                  {CATEGORY_LABEL[category]}
                </span>
                <div className={BUILDER_CSS.swatchGrid}>
                  {items.map((material) => {
                    const active = material.key === state.activeMaterialKey;
                    return (
                      <button
                        key={material.key}
                        type="button"
                        title={material.label}
                        onClick={() => BuilderStore.setActiveMaterialKey(material.key)}
                        className={cn(BUILDER_CSS.swatch, BUILDER_CSS.swatchActive, active && BUILDER_CSS.swatchActive)}
                        style={{ background: material.color }}
                        aria-label={material.label}
                        aria-pressed={active}
                      >
                        {active ? (
                          <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

interface MaterialGroups {
  floor: BuilderMaterialOption[];
  wall: BuilderMaterialOption[];
  object: BuilderMaterialOption[];
}

function groupByCategory(options: readonly BuilderMaterialOption[]): MaterialGroups {
  const groups: MaterialGroups = { floor: [], wall: [], object: [] };
  for (const option of options) groups[option.category].push(option);
  return groups;
}
