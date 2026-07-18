import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

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

/**
 * Composable React renderers over the headless selection view model
 * (`@jgengine/core/ui/selectionModel`) — the data/renderer/chrome split for an RTS selection panel, a
 * party frame, or a squad summary. `useSelectionView` is the DATA/HOOK layer (summary + focus +
 * virtualization), `EntityPortrait`/`EntitySummary`/`SelectionCollectionChrome` are composable
 * renderers, and `SelectionPanel` is the batteries-included default. A game supplies the entity data
 * from wherever selection lives and swaps renderer or chrome without forking the logic.
 */

/** A move that steps the selection focus by keyboard/controller. */
const SELECTION_KEYS: Record<string, SelectionFocusDirection> = {
  ArrowRight: "next",
  ArrowDown: "next",
  ArrowLeft: "prev",
  ArrowUp: "prev",
  Home: "first",
  End: "last",
};

/** A minimal keyboard-event shape — a real `KeyboardEvent`/React synthetic satisfies it. */
export interface SelectionKeyEvent {
  key: string;
  preventDefault(): void;
}

/** Options for {@link useSelectionView}. */
export interface UseSelectionViewOptions {
  /** Member count above which `grouped` flips true (default 12). */
  groupThreshold?: number;
  /** Map a member `kind` to a display label for its group. */
  labelOf?: (kind: string) => string;
  /** Fired when the focused (primary) member changes. */
  onFocusChange?: (id: string) => void;
}

/** The live selection model returned by {@link useSelectionView}. */
export interface SelectionModel {
  view: SelectionView;
  focusId: string | null;
  setFocus: (id: string) => void;
  onKeyDown: (event: SelectionKeyEvent) => void;
  /** A virtualization window over the members, for a large selection strip. */
  window: (scroll: number, size: number) => SelectionWindow;
}

/**
 * The DATA/HOOK layer: summarize a selected-entity list into a live model with a focused primary,
 * ordered members, same-kind groups, keyboard focus stepping, and a virtualization window.
 * Rendering-agnostic — feed it to {@link SelectionPanel} or read the `view` directly.
 *
 * @capability selection-model headless multi-entity selection model with primary focus, grouping, and virtualization
 */
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

/**
 * A compact current/max vital meter for an entity summary; tone maps to a colour ramp. Reuse it as
 * the vital row inside {@link EntitySummary} or any custom entity panel.
 *
 * @deprecated The `tone`/`vital`-API umbrella is retired (#1033). Use the atomic, purpose-named,
 * token-themed bars from `@jgengine/react/bars` (`HealthBar`, `ShieldBar`, `ManaBar`, …) and compose
 * your own panel — each does one readout and restyles globally via the shared `--jg-*` tokens.
 * @capability vital-bar compact current/max vital meter for an entity summary
 */
export function VitalBar({
  vital,
  width = 120,
  showLabel = true,
  className,
  style,
}: {
  vital: EntityVital;
  width?: number;
  showLabel?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const denom = vital.max <= 0 ? 1 : vital.max;
  const fraction = Math.max(0, Math.min(1, vital.current / denom));
  const [from, to] = VITAL_TONES[vital.tone ?? "neutral"] ?? VITAL_TONES.neutral!;
  return (
    <div className={className} data-vital={vital.id} style={{ width, ...style }}>
      {showLabel ? (
        <div style={{ display: "flex", fontSize: 10, opacity: 0.75, marginBottom: 2 }}>
          <span>{vital.label ?? vital.id}</span>
          <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
            {Math.round(vital.current)}/{Math.round(vital.max)}
          </span>
        </div>
      ) : null}
      <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
        <div style={{ width: `${fraction * 100}%`, height: "100%", background: `linear-gradient(90deg, ${from}, ${to})` }} />
      </div>
    </div>
  );
}

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

/**
 * A selectable entity portrait tile — icon/initials, an optional thin health strip, and complete
 * selected/hover/focus states as a real `<button>` (`aria-pressed`). The unit-of-a-selection chrome;
 * swap the face via `renderIcon`. Accessible and keyboard-focusable.
 *
 * @capability entity-portrait selectable entity portrait tile with vitals and selected/focus states
 */
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
              background: (VITAL_TONES[vital.tone ?? "health"] ?? VITAL_TONES.neutral!)[0],
            }}
          />
        </div>
      ) : null}
    </button>
  );
}

/**
 * The primary-entity detail chrome — name, tags, and full vital bars for the focused member. The
 * "who is selected" summary a single-selection or the head of a multi-selection shows. Swap the vital
 * rows via `renderVital`.
 *
 * @deprecated Bundling a whole vitals array in one component is the combo anti-pattern #1033 retires.
 * Compose your own summary — name/tags plus the atomic `@jgengine/react/bars` (`HealthBar`, …) you
 * need — so no engine component packages multiple readouts by default. Kept during migration.
 * @capability entity-summary primary selected-entity detail panel (name, tags, vitals)
 */
export function EntitySummary({
  entity,
  renderVital,
  className,
  style,
}: {
  entity: EntitySummaryDef;
  renderVital?: (vital: EntityVital) => ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={className} data-entity-summary={entity.id} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 140, ...style }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <strong style={{ fontSize: 14 }}>{entity.name ?? entity.id}</strong>
        {entity.kind !== undefined ? (
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.6 }}>{entity.kind}</span>
        ) : null}
      </div>
      {entity.tags !== undefined && entity.tags.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {entity.tags.map((tag) => (
            <span key={tag} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 999, background: "rgba(255,255,255,0.1)" }}>{tag}</span>
          ))}
        </div>
      ) : null}
      {(entity.vitals ?? []).map((vital) => (
        <div key={vital.id}>{renderVital ? renderVital(vital) : <VitalBar vital={vital} />}</div>
      ))}
    </div>
  );
}

/**
 * A same-kind selection chip — icon plus count — for the grouped large-selection view. The default
 * chrome {@link SelectionCollectionChrome} renders per group; swap it via `renderGroup`.
 *
 * @capability selection-group-chip same-kind selection chip (icon + count) for a grouped selection
 */
export function SelectionGroupChip({
  group,
  onSelect,
  renderIcon,
  className,
  style,
}: {
  group: SelectionGroup;
  onSelect?: (group: SelectionGroup) => void;
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
      <span style={{ position: "absolute", right: 2, bottom: 1, fontSize: 10, fontWeight: 700 }}>{group.count}</span>
    </button>
  );
}

/**
 * The composable RENDERER for the member collection: a portrait strip for a small selection, or the
 * same-kind group chips once the model is `grouped`. Roving tabindex + arrow-key focus. Swap
 * `renderMember`/`renderGroup` for custom chrome, or read the model and lay it out yourself. No panel
 * skin — a behavior/accessibility layer only.
 *
 * @capability selection-collection accessible portrait-strip / group-chip renderer over a selection model
 */
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
  /** Cap the mounted portraits; the model virtualizes past this many members. */
  windowSize?: number;
  scroll?: number;
  ariaLabel?: string;
  renderMember?: (entity: EntitySummaryDef, selected: boolean) => ReactNode;
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
  background: "rgba(10,12,16,0.6)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
  color: "#eef2f8",
  font: "500 12px/1.2 ui-sans-serif, system-ui, sans-serif",
};

/**
 * Convenience composition: skinned glass panel with {@link EntitySummary} for the primary member
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
        <div>{renderPrimary ? renderPrimary(view.primary) : <EntitySummary entity={view.primary} renderVital={renderVital} />}</div>
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
