import { BuilderIcon } from "@/dev/builder/components/builderIcons";
import { BUILDER_CSS } from "@/dev/builder/components/builderStyles";
import {
  BuilderStore,
  type BuilderItemType,
  useBuilderState,
} from "@/dev/builder/builderStore";
import { BUILDER_CATEGORY_LABELS, placeablesForCategory } from "@/dev/builder/builderPlaceableCatalog";

const CATEGORY_OPTIONS: readonly { id: BuilderItemType; label: string }[] = [
  { id: "asset", label: BUILDER_CATEGORY_LABELS.asset },
  { id: "gpu", label: BUILDER_CATEGORY_LABELS.gpu },
];

export function BuilderHeader() {
  const state = useBuilderState();
  const placeables = placeablesForCategory(state.itemType);

  return (
    <header className={BUILDER_CSS.topBar} aria-label="Builder scene selector">
      <div className="flex items-center gap-2.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[var(--brand-teal)]/15 text-[var(--brand-teal)]">
          <BuilderIcon id="library" active />
        </div>
        <div className="grid leading-tight">
          <span className={BUILDER_CSS.topBarSubLabel}>Workbench</span>
          <span className={BUILDER_CSS.topBarLabel}>Builder 3D</span>
        </div>
      </div>

      <div className="ml-4 flex min-w-0 flex-1 items-center gap-3">
        <label className="grid min-w-0 max-w-[140px] flex-1 gap-1">
          <span className={BUILDER_CSS.inlineLabel}>Category</span>
          <select
            value={state.itemType}
            onChange={(event) => BuilderStore.setItemType(event.target.value as BuilderItemType)}
            className={BUILDER_CSS.compactSelect}
            aria-label="Scene category"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 flex-[2] gap-1">
          <span className={BUILDER_CSS.inlineLabel}>Scene</span>
          <select
            value={state.selectedPlaceableId}
            onChange={(event) => BuilderStore.setSelectedPlaceable(event.target.value)}
            className={BUILDER_CSS.compactSelect}
            aria-label="Scene item"
          >
            {placeables.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}