/** @jsxImportSource @jgengine/core/ui/jsx */
import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from "@jgengine/core/ui/jsx";

import {
  moveSelectionFocus,
  selectionWindow,
  summarizeSelection,
  type EntitySummaryDef,
  type EntityVital,
  type SelectionFocusDirection,
  type SelectionGroup,
  type SelectionView,
  type SelectionWindow,
} from "@jgengine/core/ui/selectionModel";
import { hudType } from "./hudTokens";
import type { KitTone } from "@jgengine/core/ui/kit/uiKit.view";
import { KitMeter } from "@jgengine/core/ui/kit/uiKitRoot.view";

const SELECTION_KEYS: Record<string, SelectionFocusDirection> = {
  ArrowRight: "next",
  ArrowDown: "next",
  ArrowLeft: "prev",
  ArrowUp: "prev",
  Home: "first",
  End: "last",
};

export interface SelectionKeyEvent {
  key: string;
  preventDefault(): void;
}

export interface UseSelectionViewOptions {
  groupThreshold?: number | undefined;
  labelOf?: ((kind: string) => string) | undefined;
  onFocusChange?: ((id: string) => void) | undefined;
}

export interface SelectionModel {
  view: SelectionView;
  focusId: string | null;
  setFocus: (id: string) => void;
  onKeyDown: (event: SelectionKeyEvent) => void;
  window: (scroll: number, size: number) => SelectionWindow;
}

/** @capability selection-model headless multi-entity selection model with primary focus, grouping, and virtualization */
export function useSelectionView(
  members: readonly EntitySummaryDef[],
  options?: UseSelectionViewOptions,
): SelectionModel {
  const [focusId, setFocusId] = useState<string | null>(null);
  const summarizeOptions = useMemo(() => {
    const opts: Parameters<typeof summarizeSelection>[1] = {};
    if (focusId !== null) opts.primaryId = focusId;
    if (options?.groupThreshold !== undefined) opts.groupThreshold = options.groupThreshold;
    if (options?.labelOf !== undefined) opts.labelOf = options.labelOf;
    return opts;
  }, [focusId, options?.groupThreshold, options?.labelOf]);
  const view = useMemo(() => summarizeSelection(members, summarizeOptions), [members, summarizeOptions]);
  const setFocus = useCallback(
    (id: string) => {
      setFocusId(id);
      options?.onFocusChange?.(id);
    },
    [options],
  );
  const onKeyDown = useCallback(
    (event: SelectionKeyEvent) => {
      const dir = SELECTION_KEYS[event.key];
      if (dir === undefined) return;
      const next = moveSelectionFocus(view.count, view.focusIndex, dir);
      const nextMember = view.members[next];
      if (nextMember !== undefined) setFocus(nextMember.id);
      event.preventDefault();
    },
    [view, setFocus],
  );
  const windowFn = useCallback(
    (scroll: number, size: number) => selectionWindow(members, scroll, size),
    [members],
  );
  return { view, focusId, setFocus, onKeyDown, window: windowFn };
}

const VITAL_TONES: Record<string, [string, string]> = {
  health: ["#22c55e", "#4ade80"],
  shield: ["#0891b2", "#22d3ee"],
  energy: ["#2563eb", "#60a5fa"],
  neutral: ["#64748b", "#94a3b8"],
};

const PORTRAIT_BASE: CSSProperties = {
  position: "relative",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 8,
  background: "rgba(14,17,22,0.72)",
  color: "#eef2f8",
  cursor: "pointer",
  userSelect: "none",
  padding: 2,
};

/** @capability entity-portrait selectable entity portrait tile with vitals and selected/focus states */
export function EntityPortrait({
  entity,
  selected = false,
  size = 44,
  vitalId = "health",
  tabIndex,
  onSelect,
  renderIcon,
  className,
  style,
}: {
  entity: EntitySummaryDef;
  selected?: boolean;
  size?: number;
  vitalId?: string;
  tabIndex?: number;
  onSelect?: (id: string) => void;
  renderIcon?: (entity: EntitySummaryDef) => ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const vital = entity.vitals?.find((v) => v.id === vitalId) ?? entity.vitals?.[0];
  return (
    <button
      type="button"
      className={className}
      data-entity-id={entity.id}
      data-selected={selected ? "" : undefined}
      aria-pressed={selected}
      aria-label={entity.name ?? entity.id}
      title={entity.name ?? entity.id}
      tabIndex={tabIndex}
      onClick={() => onSelect?.(entity.id)}
      style={{
        ...PORTRAIT_BASE,
        width: size,
        height: size,
        borderColor: selected ? "rgba(56,189,248,0.95)" : "rgba(255,255,255,0.14)",
        boxShadow: selected ? "0 0 0 2px rgba(56,189,248,0.6)" : "none",
        ...style,
      }}
    >
      <span data-entity-icon aria-hidden style={{ fontSize: renderIcon ? undefined : 16 }}>
        {renderIcon ? renderIcon(entity) : (entity.icon ?? (entity.name ?? entity.id).slice(0, 2))}
      </span>
      {vital !== undefined ? (
        <div style={{ position: "absolute", left: 3, right: 3, bottom: 3, height: 3, borderRadius: 999, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
          <div
            style={{
              width: `${Math.max(0, Math.min(1, vital.max <= 0 ? 0 : vital.current / vital.max)) * 100}%`,
              height: "100%",
              background: (VITAL_TONES[vital.tone ?? "health"] ?? VITAL_TONES["neutral"]!)[0],
            }}
          />
        </div>
      ) : null}
    </button>
  );
}

const VITAL_KIT_TONES: Record<string, KitTone> = { health: "good", shield: "accent", energy: "accent" };

/** The focused member: name, kind, tags and one kit meter per vital. Swap a vital row via `renderVital`. */
function PrimarySummary({ entity, renderVital }: { entity: EntitySummaryDef; renderVital?: ((vital: EntityVital) => ReactNode) | undefined }) {
  return (
    <div data-entity-summary={entity.id} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 140 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <strong style={{ fontSize: 14 }}>{entity.name ?? entity.id}</strong>
        {entity.kind !== undefined ? (
          <span style={{ fontSize: hudType("xs"), textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.6 }}>{entity.kind}</span>
        ) : null}
      </div>
      {entity.tags !== undefined && entity.tags.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {entity.tags.map((tag) => (
            <span key={tag} style={{ fontSize: hudType("xs"), padding: "1px 5px", borderRadius: 999, background: "rgba(255,255,255,0.1)" }}>{tag}</span>
          ))}
        </div>
      ) : null}
      {(entity.vitals ?? []).map((vital) => (
        <div key={vital.id} data-vital={vital.id}>
          {renderVital ? (
            renderVital(vital)
          ) : (
            <KitMeter size="sm" label={vital.label ?? vital.id} value={vital.current} max={vital.max} tone={VITAL_KIT_TONES[vital.tone ?? ""] ?? "neutral"} readout />
          )}
        </div>
      ))}
    </div>
  );
}

/** @capability selection-group-chip same-kind selection chip (icon + count) for a grouped selection */
export function SelectionGroupChip({
  group,
  onSelect,
  renderIcon,
  className,
  style,
}: {
  group: SelectionGroup;
  onSelect?: ((group: SelectionGroup) => void) | undefined;
  renderIcon?: (group: SelectionGroup) => ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      className={className}
      data-selection-group={group.kind}
      aria-label={`${group.count} ${group.label}`}
      title={`${group.count} ${group.label}`}
      onClick={() => onSelect?.(group)}
      style={{ ...PORTRAIT_BASE, width: 44, height: 44, ...style }}
    >
      <span aria-hidden style={{ fontSize: 16 }}>{renderIcon ? renderIcon(group) : (group.icon ?? group.label.slice(0, 2))}</span>
      <span style={{ position: "absolute", right: 2, bottom: 1, fontSize: hudType("xs"), fontWeight: 700 }}>{group.count}</span>
    </button>
  );
}

/** @capability selection-collection accessible portrait-strip / group-chip renderer over a selection model */
export function SelectionCollectionChrome({
  model,
  itemSize = 44,
  gap = 4,
  windowSize,
  scroll = 0,
  ariaLabel = "Selection",
  renderMember,
  renderGroup,
  onGroupSelect,
  className,
  style,
}: {
  model: SelectionModel;
  itemSize?: number;
  gap?: number;
  windowSize?: number | undefined;
  scroll?: number;
  ariaLabel?: string;
  renderMember?: ((entity: EntitySummaryDef, selected: boolean) => ReactNode) | undefined;
  renderGroup?: (group: SelectionGroup) => ReactNode;
  onGroupSelect?: (group: SelectionGroup) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const { view } = model;
  const rovingId = model.focusId ?? view.primary?.id ?? null;
  const containerStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap };

  if (view.grouped) {
    return (
      <div role="group" aria-label={ariaLabel} className={className} data-selection-groups="" style={{ ...containerStyle, ...style }}>
        {view.groups.map((group) =>
          renderGroup ? (
            <div key={group.kind}>{renderGroup(group)}</div>
          ) : (
            <SelectionGroupChip key={group.kind} group={group} onSelect={onGroupSelect} />
          ),
        )}
      </div>
    );
  }

  const win = windowSize !== undefined ? model.window(scroll, windowSize) : { start: 0, end: view.count, items: view.members };
  return (
    <div
      role="listbox"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className={className}
      data-selection-strip=""
      onKeyDown={model.onKeyDown}
      style={{ ...containerStyle, ...style }}
    >
      {win.items.map((entity) => {
        const selected = view.primary?.id === entity.id;
        if (renderMember !== undefined) {
          return (
            <div key={entity.id} role="option" aria-selected={selected}>
              {renderMember(entity, selected)}
            </div>
          );
        }
        return (
          <div key={entity.id} role="option" aria-selected={selected}>
            <EntityPortrait
              entity={entity}
              selected={selected}
              size={itemSize}
              tabIndex={rovingId === entity.id ? 0 : -1}
              onSelect={model.setFocus}
            />
          </div>
        );
      })}
    </div>
  );
}

const PANEL: CSSProperties = {
  padding: 8,
  borderRadius: 12,
  // No backdrop blur: over a live 3D scene it re-renders every frame. A denser fill keeps the text readable.
  background: "rgba(10,12,16,0.78)",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
  color: "#eef2f8",
  font: "500 12px/1.2 ui-sans-serif, system-ui, sans-serif",
};

/**
 * Convenience composition: skinned glass panel with the primary member's name, tags and kit meters
 * beside {@link SelectionCollectionChrome} for the rest — demos/scaffold only, not a finished game
 * face. Pass `members` (or a prebuilt `model`); swap sub-renderers or compose the headless pieces
 * under game-owned chrome for product UI.
 *
 * @capability selection-panel optional selection-panel composition: summary + portrait strip / group chips
 */
export function SelectionPanel({
  members,
  model: providedModel,
  groupThreshold,
  labelOf,
  windowSize,
  renderPrimary,
  renderMember,
  renderVital,
  onFocusChange,
  className,
  style,
}: {
  members?: readonly EntitySummaryDef[];
  model?: SelectionModel;
  groupThreshold?: number;
  labelOf?: (kind: string) => string;
  windowSize?: number;
  renderPrimary?: (entity: EntitySummaryDef) => ReactNode;
  renderMember?: (entity: EntitySummaryDef, selected: boolean) => ReactNode;
  renderVital?: (vital: EntityVital) => ReactNode;
  onFocusChange?: (id: string) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const ownModel = useSelectionView(members ?? [], { groupThreshold, labelOf, onFocusChange });
  const model = providedModel ?? ownModel;
  const { view } = model;
  if (view.count === 0) return null;
  return (
    <div className={className} data-selection-panel="" style={{ ...PANEL, display: "flex", gap: 12, alignItems: "flex-start", ...style }}>
      {view.primary !== null ? (
        <div>{renderPrimary ? renderPrimary(view.primary) : <PrimarySummary entity={view.primary} renderVital={renderVital} />}</div>
      ) : null}
      {view.count > 1 ? (
        <SelectionCollectionChrome
          model={model}
          windowSize={windowSize}
          renderMember={renderMember}
          style={{ maxWidth: 320 }}
        />
      ) : null}
    </div>
  );
}
