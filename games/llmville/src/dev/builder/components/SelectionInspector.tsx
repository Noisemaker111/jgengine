import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Maximize2,
  RotateCw,
} from "lucide-react";

import { BuilderIcon } from "@/dev/builder/components/builderIcons";
import { BUILDER_CSS } from "@/dev/builder/components/builderStyles";
import { RESIZE_AXIS_COLORS } from "@/dev/builder/components/ResizeGizmo";
import {
  BuilderStore,
  getBuilderSelectionBounds,
  getBuilderSelectionDimensions,
  useBuilderState,
} from "@/dev/builder/builderStore";
import { cn } from "@/components/ui/cn";

export function SelectionInspector() {
  const state = useBuilderState();
  const bounds = getBuilderSelectionBounds(state.mapData, state.selectedRefs);
  const dimensions = bounds ? getBuilderSelectionDimensions(bounds) : null;
  const [step, setStep] = useState<0.1 | 1>(0.1);
  const hasSelection = state.selectedRefs.length > 0;
  const canUngroup = state.selectedRefs.length === 1
    && state.selectedRefs[0]?.kind === "decor";

  if (!hasSelection || !bounds || !dimensions) {
    return <EmptySelection />;
  }

  return (
    <>
      <section className={BUILDER_CSS.propsSection}>
        <div className="mb-2 flex items-center justify-between">
          <span className={BUILDER_CSS.propsSectionLabel}>Selection</span>
          <span className="font-mono text-[10px] text-[var(--brand-cream-dim)]">
            {state.selectedRefs.length} item{state.selectedRefs.length === 1 ? "" : "s"}
          </span>
        </div>
        <StepToggle step={step} onChange={setStep} />
      </section>

      <section className={BUILDER_CSS.propsSection}>
        <p className={BUILDER_CSS.propsSectionLabel}>Dimensions</p>
        <div className="grid gap-1.5">
          <SizeAxisRow
            label="Width"
            axisColor={RESIZE_AXIS_COLORS.x}
            value={dimensions.width}
            step={step}
            onSetValue={(value) => BuilderStore.setSelectionSize(value, undefined, undefined)}
            onNudge={(delta) => BuilderStore.nudgeSelectionSize("width", delta)}
          />
          <SizeAxisRow
            label="Height"
            axisColor={RESIZE_AXIS_COLORS.y}
            value={dimensions.height}
            step={step}
            onSetValue={(value) => BuilderStore.setSelectionSize(undefined, value, undefined)}
            onNudge={(delta) => BuilderStore.nudgeSelectionSize("height", delta)}
          />
          <SizeAxisRow
            label="Depth"
            axisColor={RESIZE_AXIS_COLORS.z}
            value={dimensions.depth}
            step={step}
            onSetValue={(value) => BuilderStore.setSelectionSize(undefined, undefined, value)}
            onNudge={(delta) => BuilderStore.nudgeSelectionSize("depth", delta)}
          />
        </div>
      </section>

      <section className={BUILDER_CSS.propsSection}>
        <p className={BUILDER_CSS.propsSectionLabel}>Move</p>
        <MovePad step={step} />
      </section>

      <section className={BUILDER_CSS.propsSection}>
        <p className={BUILDER_CSS.propsSectionLabel}>Actions</p>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className={BUILDER_CSS.defaultButton}
            onClick={() => BuilderStore.duplicateSelection()}
          >
            <BuilderIcon id="copy" size="sm" />
            Duplicate
          </button>
          <button
            type="button"
            className={BUILDER_CSS.defaultButton}
            onClick={() => BuilderStore.rotateSelection90()}
          >
            <RotateCw className="h-3.5 w-3.5" />
            Rotate 90°
          </button>
          <button
            type="button"
            className={BUILDER_CSS.defaultButton}
            onClick={() => BuilderStore.fitSelectionToFloor()}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Fit floor
          </button>
          <button
            type="button"
            className={BUILDER_CSS.defaultButton}
            onClick={() => BuilderStore.glueSelection()}
          >
            <BuilderIcon id="group" size="sm" />
            Glue
          </button>
          <button
            type="button"
            className={BUILDER_CSS.defaultButton}
            onClick={() => BuilderStore.ungroupSelection()}
            disabled={!canUngroup}
          >
            <BuilderIcon id="ungroup" size="sm" />
            Ungroup
          </button>
          <button
            type="button"
            className={BUILDER_CSS.defaultButton}
            onClick={() => BuilderStore.saveToLibrary("selection")}
          >
            <BuilderIcon id="save" size="sm" />
            Save
          </button>
        </div>
        <button
          type="button"
          className="game-btn mt-2 h-8 w-full border-[var(--destructive)]/40 bg-[var(--destructive)]/12 px-3 text-xs text-[#f0a097] hover:bg-[var(--destructive)]/20"
          onClick={() => BuilderStore.deleteSelected()}
        >
          <BuilderIcon id="delete" size="sm" />
          Delete selection
        </button>
      </section>
    </>
  );
}

function EmptySelection() {
  return (
    <section className={BUILDER_CSS.propsSection}>
      <p className={BUILDER_CSS.propsSectionLabel}>Selection</p>
      <p className={BUILDER_CSS.hintBox}>
        Click any object in the scene to select it, then drag it. Hold <kbd className="rounded bg-black/40 px-1 font-mono text-[10px]">Shift</kbd> for
        multi-select. Drag the red, green, or blue resize arrows on the bounding box.
      </p>
    </section>
  );
}

function StepToggle({ step, onChange }: { step: 0.1 | 1; onChange: (step: 0.1 | 1) => void }) {
  return (
    <div className={BUILDER_CSS.stepToggle}>
      <button
        type="button"
        className={cn(BUILDER_CSS.stepButton, step === 0.1 && BUILDER_CSS.stepButtonActive)}
        onClick={() => onChange(0.1)}
      >
        0.1m
      </button>
      <button
        type="button"
        className={cn(BUILDER_CSS.stepButton, step === 1 && BUILDER_CSS.stepButtonActive)}
        onClick={() => onChange(1)}
      >
        1m
      </button>
    </div>
  );
}

interface SizeAxisRowProps {
  label: string;
  axisColor: string;
  value: number;
  step: number;
  onSetValue: (value: number) => void;
  onNudge: (delta: number) => void;
}

function SizeAxisRow({ label, axisColor, value, step, onSetValue, onNudge }: SizeAxisRowProps) {
  return (
    <div className="grid grid-cols-[60px_1fr_28px_28px] items-center gap-1.5">
      <span className={`${BUILDER_CSS.inlineLabel} inline-flex items-center gap-1.5`}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: axisColor, boxShadow: `0 0 6px ${axisColor}` }} />
        {label}
      </span>
      <input
        className={BUILDER_CSS.fieldNumber}
        type="number"
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number.parseFloat(event.target.value);
          if (!Number.isNaN(next)) onSetValue(next);
        }}
      />
      <button type="button" className={BUILDER_CSS.arrowBtn} title={`${label} -${step}m`} onClick={() => onNudge(-step)}>
        −
      </button>
      <button type="button" className={BUILDER_CSS.arrowBtn} title={`${label} +${step}m`} onClick={() => onNudge(step)}>
        +
      </button>
    </div>
  );
}

function MovePad({ step }: { step: number }) {
  return (
    <div className="grid gap-1.5">
      <div className="mx-auto">
        <div className={BUILDER_CSS.arrowPad}>
          <span />
          <button type="button" title={`Forward +${step}m`} className={BUILDER_CSS.arrowBtn} onClick={() => BuilderStore.moveSelection(0, 0, step, false, true)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <span />
          <button type="button" title={`Left -${step}m`} className={BUILDER_CSS.arrowBtn} onClick={() => BuilderStore.moveSelection(-step, 0, 0, false, true)}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div className={BUILDER_CSS.arrowPadCenter}>{step}m</div>
          <button type="button" title={`Right +${step}m`} className={BUILDER_CSS.arrowBtn} onClick={() => BuilderStore.moveSelection(step, 0, 0, false, true)}>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <span />
          <button type="button" title={`Back -${step}m`} className={BUILDER_CSS.arrowBtn} onClick={() => BuilderStore.moveSelection(0, 0, -step, false, true)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <span />
        </div>
      </div>
      <div className="mx-auto flex items-center gap-1">
        <button type="button" title={`Lower -${step}m`} className={BUILDER_CSS.arrowBtn} onClick={() => BuilderStore.moveSelection(0, -step, 0, false, true)}>
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <span className="px-1 text-[10px] text-[var(--brand-cream-dim)]">Y</span>
        <button type="button" title={`Raise +${step}m`} className={BUILDER_CSS.arrowBtn} onClick={() => BuilderStore.moveSelection(0, step, 0, false, true)}>
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

