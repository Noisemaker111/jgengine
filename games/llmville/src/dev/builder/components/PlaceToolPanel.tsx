import { Box, Circle, Square, SquareDashed } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { BUILDER_CSS } from "@/dev/builder/components/builderStyles";
import {
  BuilderStore,
  type BuilderPrimitiveKind,
  useBuilderState,
} from "@/dev/builder/builderStore";
import { cn } from "@/components/ui/cn";
import { WORLD_MODEL_CATALOG } from "@llmville/game/world/worldModelCatalog";

const PRIMITIVE_OPTIONS: readonly { id: BuilderPrimitiveKind; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: "box", label: "Box", Icon: Box },
  { id: "plane", label: "Plane", Icon: SquareDashed },
  { id: "cylinder", label: "Cylinder", Icon: Square },
  { id: "sphere", label: "Sphere", Icon: Circle },
];

export function PlaceToolPanel() {
  const state = useBuilderState();
  const { placementSource, primitive, selectedCatalogModelKey } = state;

  return (
    <>
      <section className={BUILDER_CSS.propsSection}>
        <p className={BUILDER_CSS.propsSectionLabel}>Source</p>
        <div className={BUILDER_CSS.segmentedGroup}>
          <button
            type="button"
            className={cn(BUILDER_CSS.segmentedButton, placementSource === "primitive" && BUILDER_CSS.segmentedButtonActive)}
            onClick={() => BuilderStore.setPlacementSource("primitive")}
          >
            Primitive
          </button>
          <button
            type="button"
            className={cn(BUILDER_CSS.segmentedButton, placementSource === "catalog" && BUILDER_CSS.segmentedButtonActive)}
            onClick={() => BuilderStore.setPlacementSource("catalog")}
          >
            Catalog
          </button>
        </div>
      </section>

      {placementSource === "primitive" ? (
        <>
          <section className={BUILDER_CSS.propsSection}>
            <p className={BUILDER_CSS.propsSectionLabel}>Shape</p>
            <div className={BUILDER_CSS.primitiveRow}>
              {PRIMITIVE_OPTIONS.map(({ id, label, Icon }) => {
                const active = primitive.kind === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className={cn(BUILDER_CSS.primitiveButton, active && BUILDER_CSS.primitiveButtonActive)}
                    onClick={() => BuilderStore.setPrimitiveKind(id)}
                    aria-label={label}
                    aria-pressed={active}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[10px] font-semibold">{label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={BUILDER_CSS.propsSection}>
            <p className={BUILDER_CSS.propsSectionLabel}>Size</p>
            <div className="grid grid-cols-3 gap-1.5">
              {primitive.kind === "cylinder" || primitive.kind === "sphere" ? (
                <NumberCell
                  label={primitive.kind === "sphere" ? "Radius" : "Radius"}
                  value={primitive.radius}
                  onChange={(value) => BuilderStore.setPrimitiveNumber("radius", value)}
                />
              ) : (
                <NumberCell
                  label="Width"
                  value={primitive.width}
                  onChange={(value) => BuilderStore.setPrimitiveNumber("width", value)}
                />
              )}
              {primitive.kind === "plane" || primitive.kind === "cylinder" ? null : (
                <NumberCell
                  label="Height"
                  value={primitive.height}
                  onChange={(value) => BuilderStore.setPrimitiveNumber("height", value)}
                />
              )}
              {primitive.kind === "cylinder" || primitive.kind === "sphere" ? (
                <NumberCell
                  label="Segments"
                  value={primitive.segments}
                  step={1}
                  onChange={(value) => BuilderStore.setPrimitiveNumber("segments", Math.round(value))}
                />
              ) : (
                <NumberCell
                  label="Depth"
                  value={primitive.depth}
                  onChange={(value) => BuilderStore.setPrimitiveNumber("depth", value)}
                />
              )}
            </div>
          </section>
        </>
      ) : (
        <section className={BUILDER_CSS.propsSection}>
          <p className={BUILDER_CSS.propsSectionLabel}>Catalog item</p>
          <select
            value={selectedCatalogModelKey}
            onChange={(event) => BuilderStore.setSelectedCatalogModelKey(event.target.value)}
            className={cn(BUILDER_CSS.selectField, "h-9")}
          >
            {Object.entries(WORLD_MODEL_CATALOG).map(([key, asset]) => (
              <option key={key} value={key}>
                {asset.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[10px] text-[var(--brand-cream-dim)]">
            Click the floor to drop a copy, snapped to the grid.
          </p>
        </section>
      )}
    </>
  );
}

export function PlaceToolHints() {
  return (
    <section className={BUILDER_CSS.propsSection}>
      <p className={BUILDER_CSS.hintBox}>
        Pick a source and shape, then click any floor point. The ghost preview snaps to the room grid.
        Press <kbd className="rounded bg-black/40 px-1 font-mono text-[10px]">P</kbd> to come back to this tool.
      </p>
    </section>
  );
}

interface NumberCellProps {
  label: string;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}

function NumberCell({ label, value, step = 0.1, onChange }: NumberCellProps) {
  return (
    <label className="grid gap-1">
      <span className={BUILDER_CSS.inlineLabel}>{label}</span>
      <input
        className={BUILDER_CSS.fieldNumber}
        type="number"
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number.parseFloat(event.target.value);
          if (!Number.isNaN(next)) onChange(next);
        }}
      />
    </label>
  );
}

