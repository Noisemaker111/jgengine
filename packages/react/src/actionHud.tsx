import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { AbilitySlotSnapshot } from "@jgengine/core/combat/abilityKit";
import {
  actionByHotkey,
  actionCooldownFromFraction,
  actionCost,
  moveGridFocus,
  resolveActionCollection,
  type ActionDef,
  type FocusDirection,
  type ResolvedAction,
} from "@jgengine/core/ui/actionModel";
import { actionTooltip, placePopover, type PopoverSide, type TooltipContent } from "@jgengine/core/ui/tooltipModel";

import { Keycap } from "./keyHint";

/**
 * Composable React renderers over the headless action view model (`@jgengine/core/ui/actionModel`) —
 * the data/renderer/chrome split for an RTS command card, an ability action bar, a build menu, or a
 * radial. `useActionBar` is the DATA/HOOK layer (resolution + focus/hover/keyboard/hotkey), `ActionBarChrome`
 * is the composable RENDERER (swap `renderItem` for custom chrome, or ignore it and consume the model
 * directly for a radial), and `ActionBar` is the batteries-included default. A game swaps renderer or
 * chrome without forking the logic. Layout, dimensions, hotkeys, and catalog-id mapping stay caller-owned.
 */

/**
 * Adapt a combat {@link AbilitySlotSnapshot} into an {@link ActionDef} — the glue that binds an
 * `AbilityKit` (via `useAbilitySlots`) to the action renderers without the game re-deriving cooldown
 * and cost shapes. `extra` supplies the caller-owned bits the snapshot cannot know (label, icon,
 * hotkey, description, resource name). Pure, so it is unit-testable.
 *
 * @capability action-from-ability-slot adapt a combat ability-kit snapshot into an action-bar action def
 */
export function actionFromAbilitySlot(
  slot: AbilitySlotSnapshot,
  extra?: Partial<ActionDef> & { resourceId?: string },
): ActionDef {
  const def: ActionDef = { id: slot.id };
  if (slot.cooldownRemainingMs > 0) {
    def.cooldown = actionCooldownFromFraction(slot.cooldownRemainingMs, slot.cooldownFraction);
  }
  if (slot.resourceCost > 0) {
    const available = slot.state === "no-resource" ? 0 : slot.resourceCost;
    def.costs = [actionCost(extra?.resourceId ?? "resource", slot.resourceCost, available)];
  }
  if (extra?.label !== undefined) def.label = extra.label;
  if (extra?.description !== undefined) def.description = extra.description;
  if (extra?.icon !== undefined) def.icon = extra.icon;
  if (extra?.hotkey !== undefined) def.hotkey = extra.hotkey;
  if (extra?.group !== undefined) def.group = extra.group;
  if (extra?.active !== undefined) def.active = extra.active;
  if (extra?.disabled !== undefined) def.disabled = extra.disabled;
  if (extra?.reasons !== undefined) def.reasons = extra.reasons;
  return def;
}

const ARROW_DIRECTIONS: Record<string, FocusDirection> = {
  ArrowRight: "right",
  ArrowLeft: "left",
  ArrowUp: "up",
  ArrowDown: "down",
  Home: "first",
  End: "last",
};

/** The intent a key press resolves to over an action bar: move focus, activate, or ignore. */
export interface ActionBarKeyResult {
  handled: boolean;
  focusId?: string;
  activateId?: string;
}

/**
 * Pure keyboard/controller resolver for an action bar: arrows/Home/End move grid focus, Enter/Space
 * activate the focused action, and any other single key routes through {@link actionByHotkey}. Returns
 * the resulting intent without touching the DOM, so it unit-tests headless and `useActionBar` is a
 * thin shell over it.
 */
export function actionBarKeyAction(
  actions: readonly ResolvedAction[],
  focusedId: string | null,
  columns: number,
  key: string,
  options?: { wrap?: boolean },
): ActionBarKeyResult {
  const index = focusedId === null ? -1 : actions.findIndex((a) => a.id === focusedId);
  const dir = ARROW_DIRECTIONS[key];
  if (dir !== undefined) {
    const next = moveGridFocus(index, actions.length, columns, dir, { wrap: options?.wrap === true });
    const nextId = actions[next]?.id;
    return nextId === undefined ? { handled: false } : { handled: true, focusId: nextId };
  }
  if (key === "Enter" || key === " " || key === "Spacebar") {
    return focusedId === null ? { handled: false } : { handled: true, activateId: focusedId };
  }
  const hotkeyId = actionByHotkey(actions, key);
  return hotkeyId === null ? { handled: false } : { handled: true, focusId: hotkeyId, activateId: hotkeyId };
}

/** A minimal keyboard-event shape — a real `KeyboardEvent`/React synthetic satisfies it. */
export interface ActionKeyEvent {
  key: string;
  preventDefault(): void;
}

/** Options for {@link useActionBar}. */
export interface UseActionBarOptions {
  /** Grid width for keyboard focus math and the default grid renderer (default: number of actions). */
  columns?: number;
  /** Wrap focus at the grid edges (default false). */
  wrap?: boolean;
  /** Fired when an action is activated by click, Enter/Space, or its hotkey. */
  onActivate?: (id: string) => void;
  /** Set false to ignore single-key hotkeys (default true). */
  hotkeys?: boolean;
}

/** The live action-bar model returned by {@link useActionBar}. */
export interface ActionBarModel {
  actions: readonly ResolvedAction[];
  columns: number;
  focusedId: string | null;
  hoveredId: string | null;
  setFocus: (id: string | null) => void;
  setHover: (id: string | null) => void;
  activate: (id: string) => void;
  onKeyDown: (event: ActionKeyEvent) => void;
}

/**
 * The DATA/HOOK layer: resolve `defs` into a live view model with focus, hover, keyboard grid
 * navigation, and hotkey activation. Rendering-agnostic — feed the returned model to
 * {@link ActionBarChrome}, or read it directly to lay out a radial or a bespoke card.
 *
 * @capability action-bar-model headless action-collection model with focus, hover, keyboard, and hotkey routing
 */
export function useActionBar(defs: readonly ActionDef[], options?: UseActionBarOptions): ActionBarModel {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const actions = useMemo(() => resolveActionCollection(defs), [defs]);
  const columns = options?.columns ?? Math.max(1, actions.length);
  const activate = useCallback((id: string) => options?.onActivate?.(id), [options]);
  const onKeyDown = useCallback(
    (event: ActionKeyEvent) => {
      const result = actionBarKeyAction(actions, focusedId, columns, event.key, { wrap: options?.wrap === true });
      if (!result.handled) return;
      if (result.activateId !== undefined && options?.hotkeys === false && result.focusId === result.activateId) {
        // hotkey routing suppressed
      } else {
        if (result.focusId !== undefined) setFocusedId(result.focusId);
        if (result.activateId !== undefined) activate(result.activateId);
      }
      event.preventDefault();
    },
    [actions, focusedId, columns, options, activate],
  );
  return {
    actions,
    columns,
    focusedId,
    hoveredId,
    setFocus: setFocusedId,
    setHover: setHoveredId,
    activate,
    onKeyDown,
  };
}

// Slot chrome reads the shared HudTheme tokens (#1034) with the built-in look as fallbacks, so a
// theme restyles action slots alongside the bars/frames and a bare game is byte-identical to before.
const ITEM_BASE: CSSProperties = {
  position: "relative",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  border: "var(--jg-slot-border, 1px solid rgba(255,255,255,0.14))",
  borderRadius: "var(--jg-slot-radius, 8px)",
  background: "var(--jg-slot-bg, rgba(14,17,22,0.72))",
  color: "#eef2f8",
  font: "600 12px/1.1 ui-sans-serif, system-ui, sans-serif",
  cursor: "pointer",
  userSelect: "none",
  overflow: "hidden",
};

/** Render context passed to a custom {@link ActionBarChrome} item renderer. */
export interface ActionItemContext {
  focused: boolean;
  hovered: boolean;
  model: ActionBarModel;
}

/**
 * The default per-item chrome — a cooldown-aware action button with hotkey cap, cost line, radial
 * cooldown wipe, and full rest/hover/focus/pressed/active/disabled states. Accessible: it is a real
 * `<button>` with `aria-disabled`, `aria-pressed` for toggles, `aria-keyshortcuts`, and a native
 * `title` describing why it is blocked. Swap it via `ActionBarChrome`'s `renderItem`, or drop it into
 * a radial layout yourself.
 *
 * @capability action-button cooldown/cost/hotkey action button with complete interaction states
 */
export function ActionButton({
  action,
  focused = false,
  hovered = false,
  size = 52,
  showHotkey = true,
  tabIndex,
  buttonRef,
  onActivate,
  onFocus,
  onHover,
  renderIcon,
  className,
  style,
}: {
  action: ResolvedAction;
  focused?: boolean;
  hovered?: boolean;
  size?: number;
  showHotkey?: boolean;
  tabIndex?: number;
  buttonRef?: (node: HTMLButtonElement | null) => void;
  onActivate?: (id: string) => void;
  onFocus?: (id: string) => void;
  onHover?: (id: string | null) => void;
  renderIcon?: (action: ResolvedAction) => ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const tip = actionTooltip(action);
  const title = [tip.title, ...(tip.notes ?? [])].join("\n");
  const cooldown = action.cooldown;
  const wipeDeg = cooldown !== null && !cooldown.ready ? Math.round(cooldown.fraction * 360) : 0;
  return (
    <button
      type="button"
      ref={buttonRef}
      className={className}
      data-action-id={action.id}
      data-active={action.active ? "" : undefined}
      data-enabled={action.enabled ? "" : undefined}
      data-focused={focused ? "" : undefined}
      aria-disabled={!action.enabled}
      aria-pressed={action.active}
      aria-keyshortcuts={action.hotkey}
      aria-label={action.label}
      title={title}
      tabIndex={tabIndex}
      onClick={() => onActivate?.(action.id)}
      onFocus={() => onFocus?.(action.id)}
      onPointerEnter={() => onHover?.(action.id)}
      onPointerLeave={() => onHover?.(null)}
      style={{
        ...ITEM_BASE,
        width: size,
        height: size,
        opacity: action.enabled ? 1 : 0.5,
        borderColor: action.active
          ? "rgba(56,189,248,0.95)"
          : focused
            ? "rgba(148,197,255,0.9)"
            : hovered
              ? "rgba(255,255,255,0.3)"
              : "rgba(255,255,255,0.14)",
        boxShadow: focused
          ? "0 0 0 2px rgba(96,165,250,0.7)"
          : action.active
            ? "0 0 0 1px rgba(56,189,248,0.6)"
            : "none",
        transform: hovered && action.enabled ? "translateY(-1px)" : "none",
        transition: "transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease",
        ...style,
      }}
    >
      {showHotkey && action.hotkey !== undefined ? (
        <span style={{ position: "absolute", top: 2, left: 3 }} aria-hidden>
          <Keycap style={{ fontSize: 9, padding: "0 3px", opacity: 0.85 }}>{action.hotkey}</Keycap>
        </span>
      ) : null}
      <span style={{ fontSize: renderIcon ? undefined : 18, lineHeight: 1 }} data-action-icon aria-hidden>
        {renderIcon ? renderIcon(action) : (action.icon ?? action.label.slice(0, 2))}
      </span>
      {action.costs.length > 0 ? (
        <span data-action-costs style={{ display: "flex", gap: 4, fontSize: 9 }}>
          {action.costs.map((cost) => (
            <span key={cost.resourceId} style={{ color: cost.met ? "rgba(147,197,253,0.9)" : "#f87171" }}>
              {cost.amount}
            </span>
          ))}
        </span>
      ) : null}
      {wipeDeg > 0 ? (
        <span
          data-action-cooldown
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: `conic-gradient(rgba(4,6,10,0.62) ${wipeDeg}deg, transparent 0deg)`,
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {(action.cooldown!.remainingMs / 1000).toFixed(action.cooldown!.remainingMs < 10000 ? 1 : 0)}
          </span>
        </span>
      ) : null}
    </button>
  );
}

/**
 * The composable RENDERER: lay the model's actions out as a `grid` or `list` toolbar with roving
 * tabindex, arrow-key navigation, and a moved DOM focus. `renderItem` swaps per-item chrome; omit it
 * for {@link ActionButton}. A radial or bespoke UI can skip this entirely and read the model. Purely
 * a wiring/behavior layer — no panel skin — so a game art-directs freely.
 *
 * @capability action-bar-chrome accessible grid/list toolbar renderer over an action-bar model with swappable item chrome
 */
export function ActionBarChrome({
  model,
  layout = "grid",
  itemSize = 52,
  gap = 6,
  ariaLabel = "Actions",
  renderItem,
  className,
  style,
}: {
  model: ActionBarModel;
  layout?: "grid" | "list";
  itemSize?: number;
  gap?: number;
  ariaLabel?: string;
  renderItem?: (action: ResolvedAction, ctx: ActionItemContext) => ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const { actions, focusedId, hoveredId, columns } = model;
  const rovingId = focusedId ?? actions[0]?.id ?? null;

  useEffect(() => {
    if (focusedId === null) return;
    refs.current.get(focusedId)?.focus();
  }, [focusedId]);

  const containerStyle: CSSProperties =
    layout === "grid"
      ? { display: "grid", gridTemplateColumns: `repeat(${Math.max(1, columns)}, ${itemSize}px)`, gap }
      : { display: "flex", flexDirection: "column", gap };

  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      aria-orientation={layout === "list" ? "vertical" : "horizontal"}
      className={className}
      data-action-bar=""
      onKeyDown={model.onKeyDown}
      style={{ ...containerStyle, ...style }}
    >
      {actions.map((action) => {
        const ctx: ActionItemContext = {
          focused: focusedId === action.id,
          hovered: hoveredId === action.id,
          model,
        };
        if (renderItem !== undefined) return <div key={action.id}>{renderItem(action, ctx)}</div>;
        return (
          <ActionButton
            key={action.id}
            action={action}
            focused={ctx.focused}
            hovered={ctx.hovered}
            size={itemSize}
            tabIndex={rovingId === action.id ? 0 : -1}
            buttonRef={(node) => {
              if (node === null) refs.current.delete(action.id);
              else refs.current.set(action.id, node);
            }}
            onActivate={model.activate}
            onFocus={model.setFocus}
            onHover={model.setHover}
          />
        );
      })}
    </div>
  );
}

const PANEL: CSSProperties = {
  padding: 8,
  borderRadius: "var(--jg-frame-radius, 12px)",
  background: "var(--jg-frame-bg, rgba(10,12,16,0.6))",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  border: "var(--jg-frame-border, 1px solid rgba(255,255,255,0.1))",
  boxShadow: "var(--jg-frame-glow, 0 4px 16px rgba(0,0,0,0.35))",
};

/**
 * Convenience composition of {@link useActionBar} + glass {@link ActionBarChrome} for demos and
 * scaffolding — not a shipped game face. Pass `defs`, choose `grid`/`list`, and hand it `onActivate`.
 * Games that own their UI compose the headless hook + custom chrome (or swap `renderItem`) instead
 * of shipping this default panel.
 *
 * @capability action-bar optional skinned action-bar composition over the headless model — games own chrome
 */
export function ActionBar({
  defs,
  columns,
  layout = "grid",
  wrap,
  hotkeys,
  itemSize,
  ariaLabel,
  onActivate,
  renderItem,
  className,
  style,
}: {
  defs: readonly ActionDef[];
  columns?: number;
  layout?: "grid" | "list";
  wrap?: boolean;
  hotkeys?: boolean;
  itemSize?: number;
  ariaLabel?: string;
  onActivate?: (id: string) => void;
  renderItem?: (action: ResolvedAction, ctx: ActionItemContext) => ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const model = useActionBar(defs, { columns, wrap, hotkeys, onActivate });
  return (
    <div className={className} data-action-panel="" style={{ ...PANEL, display: "inline-block", ...style }}>
      <ActionBarChrome
        model={model}
        layout={layout}
        itemSize={itemSize}
        ariaLabel={ariaLabel}
        renderItem={renderItem}
      />
    </div>
  );
}

/**
 * An accessible popover shell positioned by the pure {@link placePopover} math — flips and clamps
 * against the viewport, renders nothing while closed, and defaults to `role="tooltip"`. Reuse it for
 * an action's hover/focus description or any anchored panel.
 *
 * @capability popover viewport-flipping, viewport-clamped anchored popover/tooltip shell
 */
export function Popover({
  open,
  anchorRef,
  side = "top",
  gap = 8,
  role = "tooltip",
  id,
  children,
  className,
  style,
}: {
  open: boolean;
  anchorRef: { current: HTMLElement | null };
  side?: PopoverSide;
  gap?: number;
  role?: string;
  id?: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const anchor = anchorRef.current;
    const node = ref.current;
    if (anchor === null || node === null) return;
    const a = anchor.getBoundingClientRect();
    const c = node.getBoundingClientRect();
    const placement = placePopover(
      { x: a.left, y: a.top, width: a.width, height: a.height },
      { width: c.width, height: c.height },
      { width: window.innerWidth, height: window.innerHeight },
      { preferred: side, gap },
    );
    setPos({ left: placement.left, top: placement.top });
  }, [open, side, gap, anchorRef]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      role={role}
      id={id}
      data-popover=""
      className={className}
      style={{
        position: "fixed",
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        zIndex: 1000,
        pointerEvents: "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Render {@link TooltipContent} (from `actionTooltip`) as a styled block: title, subtitle, body,
 * hotkey, cost lines, cooldown, and a warning footer of blocking notes. Drop it inside a
 * {@link Popover} for an action's hover/focus description.
 *
 * @capability action-tooltip structured action tooltip body (title, cost, cooldown, blocking notes)
 */
export function ActionTooltip({
  content,
  className,
  style,
}: {
  content: TooltipContent;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={className}
      data-action-tooltip=""
      style={{
        maxWidth: 240,
        padding: "8px 10px",
        borderRadius: 8,
        background: "rgba(8,10,14,0.95)",
        border: "1px solid rgba(255,255,255,0.14)",
        color: "#eef2f8",
        font: "500 12px/1.35 ui-sans-serif, system-ui, sans-serif",
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>{content.title}</strong>
        {content.hotkey !== undefined ? (
          <Keycap style={{ marginLeft: "auto", fontSize: 10 }}>{content.hotkey}</Keycap>
        ) : null}
      </div>
      {content.subtitle !== undefined ? (
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.6 }}>{content.subtitle}</div>
      ) : null}
      {content.body !== undefined ? <div style={{ marginTop: 4, opacity: 0.9 }}>{content.body}</div> : null}
      {content.costs !== undefined && content.costs.length > 0 ? (
        <div style={{ marginTop: 4, display: "flex", gap: 8, fontSize: 11 }}>
          {content.costs.map((cost) => (
            <span key={cost.resourceId} style={{ color: cost.met ? "rgba(147,197,253,0.95)" : "#f87171" }}>
              {cost.amount} {cost.resourceId}
            </span>
          ))}
        </div>
      ) : null}
      {content.cooldown != null ? (
        <div style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}>
          {(content.cooldown.remainingMs / 1000).toFixed(1)}s cooldown
        </div>
      ) : null}
      {content.notes !== undefined && content.notes.length > 0 ? (
        <div style={{ marginTop: 6, paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.1)", fontSize: 11, color: "#fca5a5" }}>
          {content.notes.map((note) => (
            <div key={note}>{note}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
