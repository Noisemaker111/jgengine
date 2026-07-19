import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import {
  MODAL_CANCEL,
  MODAL_CONFIRM,
  type ModalRecord,
  type ModalStack,
} from "@jgengine/core/ui/modalStack";

import { HudFrame } from "./hudFrame";

/**
 * React chrome over the headless modal stack (`@jgengine/core/ui/modalStack`) — the blocking-overlay
 * layer a game raises over its scene: a pause menu, a "quit to menu?" confirm, a reward popup.
 * {@link useModalStack} is the DATA/HOOK layer (subscribe + the active record), {@link ModalHost}
 * renders the top modal with a backdrop, focus trap, and Esc-to-cancel, and {@link ConfirmDialog} /
 * {@link PauseMenu} are ready-to-wire, HudTheme-token-driven building blocks. All unskinned and
 * game-owned: the model never interprets a modal's `kind`, so a game switches on it to pick which of
 * these (or its own) content to show, and reskins everything via `HudTheme` tokens and the frame.
 */

/** The live modal view returned by {@link useModalStack}: the active record (or `null`) plus the stack depth. */
export interface ModalStackView {
  /** The topmost open modal, or `null` when nothing is open. */
  top: ModalRecord | null;
  /** Number of stacked modals (for a "2 of 3"-style affordance or a dim-per-layer backdrop). */
  depth: number;
}

/**
 * Subscribe to a modal stack and re-render on every change, returning the active modal and depth.
 *
 * @capability use-modal-stack React hook binding a modal stack to a component — re-renders on push/pop/resolve
 */
export function useModalStack(stack: ModalStack): ModalStackView {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => stack.subscribe(bump), [stack]);
  return { top: stack.top(), depth: stack.depth() };
}

/** @internal Focusable descendants of `root`, in DOM order, skipping disabled/hidden ones. */
function focusableWithin(root: HTMLElement): HTMLElement[] {
  const selector =
    'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/** Props for {@link ModalHost}. */
export interface ModalHostProps {
  /** The stack to render the top of. */
  stack: ModalStack;
  /**
   * Render the active modal's content. Receives the record and controls bound to the stack —
   * `resolve(result)` closes it with a free-form outcome, `cancel()` is the Esc/backdrop shortcut
   * (`resolve(MODAL_CANCEL)`). Switch on `record.kind` to pick a {@link ConfirmDialog}, a
   * {@link PauseMenu}, or your own content.
   */
  children: (record: ModalRecord, controls: ModalControls) => ReactNode;
  /** Dim the scene behind the modal. Default `true`. */
  showBackdrop?: boolean;
  /** Backdrop color (default `rgba(4,7,12,0.62)`, or the `--jg-backdrop` token). */
  backdrop?: string;
  /** Close the top modal (cancel) on backdrop click. Default `true`. */
  closeOnBackdrop?: boolean;
  /** Close the top modal (cancel) on Escape. Default `true`. */
  closeOnEsc?: boolean;
  /** z-index of the host's stacking context — sits above the HUD/windows. Default 80. */
  zIndexBase?: number;
  className?: string;
  style?: CSSProperties;
}

/** Stack-bound controls handed to a {@link ModalHost} render callback. */
export interface ModalControls {
  /** Resolve the active modal with a free-form result and close it. */
  resolve: (result: string, payload?: unknown) => void;
  /** Resolve the active modal with {@link MODAL_CONFIRM}. */
  confirm: (payload?: unknown) => void;
  /** Resolve the active modal with {@link MODAL_CANCEL} — the Esc / backdrop behavior. */
  cancel: () => void;
}

/**
 * Full-screen modal host: watches a stack, renders only the topmost modal centered over a dimmed
 * backdrop, and manages accessibility — the panel is a `role="dialog" aria-modal`, focus moves into
 * it on open and is trapped with Tab/Shift+Tab cycling, Escape and (optionally) a backdrop click
 * cancel the top modal, and focus returns to the previously focused element on close. It renders
 * nothing when the stack is empty. Skin the panel and backdrop via `HudTheme` tokens.
 *
 * @capability modal-host full-screen modal/dialog host over a modal stack — dimmed backdrop, focus trap, Esc/backdrop-to-cancel, aria-modal dialog
 */
export function ModalHost({
  stack,
  children,
  showBackdrop = true,
  backdrop,
  closeOnBackdrop = true,
  closeOnEsc = true,
  zIndexBase = 80,
  className,
  style,
}: ModalHostProps): ReactNode {
  const { top } = useModalStack(stack);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const stepId = top?.id ?? null;

  const controls: ModalControls = {
    resolve: useCallback((result: string, payload?: unknown) => stack.resolve(result, payload !== undefined ? { payload } : undefined), [stack]) as ModalControls["resolve"],
    confirm: useCallback((payload?: unknown) => stack.resolve(MODAL_CONFIRM, payload !== undefined ? { payload } : undefined), [stack]),
    cancel: useCallback(() => stack.resolve(MODAL_CANCEL), [stack]),
  };

  // Move focus into the dialog on open; restore it on close.
  useEffect(() => {
    if (stepId === null || typeof document === "undefined") return undefined;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (panel !== null) {
      const first = focusableWithin(panel)[0] ?? panel;
      first.focus();
    }
    return () => {
      restoreRef.current?.focus?.();
    };
  }, [stepId]);

  if (top === null) return null;
  const dim = backdrop ?? "var(--jg-backdrop, rgba(4,7,12,0.62))";

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (closeOnEsc && event.key === "Escape") {
      event.stopPropagation();
      controls.cancel();
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (panel === null) return;
    const focusable = focusableWithin(panel);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      data-modal-host=""
      className={className}
      onKeyDown={onKeyDown}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: zIndexBase,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "auto",
        ...style,
      }}
    >
      {showBackdrop ? (
        <div
          data-modal-backdrop=""
          onClick={closeOnBackdrop ? () => controls.cancel() : undefined}
          style={{ position: "fixed", inset: 0, background: dim }}
        />
      ) : null}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal
        aria-label={typeof top.payload === "object" && top.payload !== null && "title" in top.payload ? String((top.payload as { title?: unknown }).title ?? top.kind) : top.kind}
        data-modal={top.kind}
        data-modal-id={top.id}
        tabIndex={-1}
        style={{ position: "relative", pointerEvents: "auto", outline: "none", maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 32px)" }}
      >
        {children(top, controls)}
      </div>
    </div>
  );
}

const DIALOG_TITLE: CSSProperties = { margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: 0.2 };
const DIALOG_BODY: CSSProperties = { margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "rgba(226,232,240,0.82)" };
const BUTTON_ROW: CSSProperties = { display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" };

const BUTTON_BASE: CSSProperties = {
  appearance: "none",
  borderRadius: "var(--jg-slot-radius, 8px)",
  border: "1px solid transparent",
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 16px",
  cursor: "pointer",
  font: "inherit",
};

function primaryButtonStyle(danger: boolean): CSSProperties {
  return {
    ...BUTTON_BASE,
    background: danger ? "#e5484d" : "var(--jg-accent, #38bdf8)",
    color: danger ? "#fff" : "#06121b",
  };
}

const GHOST_BUTTON: CSSProperties = {
  ...BUTTON_BASE,
  background: "var(--jg-slot-bg, rgba(148,163,184,0.12))",
  color: "var(--jg-bar-text, #e2e8f0)",
  border: "var(--jg-slot-border, 1px solid rgba(148,163,184,0.28))",
};

/** Props for {@link ConfirmDialog}. */
export interface ConfirmDialogProps {
  title: ReactNode;
  /** Explanatory body copy under the title. */
  body?: ReactNode;
  /** Confirm button label (default `"Confirm"`). */
  confirmLabel?: ReactNode;
  /** Cancel button label (default `"Cancel"`). */
  cancelLabel?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  /** Style the confirm button as destructive (red). Default `false`. */
  danger?: boolean;
  /** Fixed dialog width (default 360). */
  width?: number | string;
  className?: string;
  style?: CSSProperties;
}

/**
 * A generic two-button confirmation dialog — title, optional body, and Cancel / Confirm buttons over
 * a `HudTheme`-token-driven {@link HudFrame}. Presentation-only: wire `onConfirm`/`onCancel` to a
 * modal stack's `resolve` (typically inside a {@link ModalHost} render callback) and reskin via
 * `HudTheme` tokens or `danger` for a destructive action. It interprets nothing — the game supplies
 * the copy.
 *
 * @capability confirm-dialog generic themeable confirm/cancel dialog — title, body, two buttons, danger styling
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  danger = false,
  width = 360,
  className,
  style,
}: ConfirmDialogProps): ReactNode {
  return (
    <HudFrame variation="themed" width={width} padding={20} interactive className={className} style={style}>
      <h2 data-confirm-title="" style={DIALOG_TITLE}>{title}</h2>
      {body !== undefined ? <p data-confirm-body="" style={DIALOG_BODY}>{body}</p> : null}
      <div style={BUTTON_ROW}>
        <button type="button" data-confirm-cancel="" onClick={onCancel} style={GHOST_BUTTON}>{cancelLabel}</button>
        <button type="button" data-confirm-accept="" onClick={onConfirm} style={primaryButtonStyle(danger)}>{confirmLabel}</button>
      </div>
    </HudFrame>
  );
}

/** One selectable row in a {@link PauseMenu}'s slot list (Settings, Save, Quit, …). */
export interface PauseMenuItem {
  /** Stable id (also the `data-pause-item` value). */
  id: string;
  label: ReactNode;
  onSelect: () => void;
  /** Render as destructive (e.g. Quit). Default `false`. */
  danger?: boolean;
  /** Disable the row. Default `false`. */
  disabled?: boolean;
}

/** Props for {@link PauseMenu}. */
export interface PauseMenuProps {
  /** Menu heading (default `"Paused"`). */
  title?: ReactNode;
  /** Resume/close-the-menu action, wired to the primary Resume button. */
  onResume: () => void;
  /** Resume button label (default `"Resume"`). */
  resumeLabel?: ReactNode;
  /** The game-filled slot list beneath Resume (Settings, Save, Quit, …). */
  items?: readonly PauseMenuItem[];
  /** Fixed menu width (default 300). */
  width?: number | string;
  className?: string;
  style?: CSSProperties;
}

const PAUSE_TITLE: CSSProperties = {
  margin: "0 0 14px",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 2,
  textTransform: "uppercase",
  textAlign: "center",
  color: "var(--jg-accent, #38bdf8)",
};

const PAUSE_ITEM_BASE: CSSProperties = {
  ...BUTTON_BASE,
  display: "block",
  width: "100%",
  textAlign: "center",
  padding: "10px 16px",
  marginTop: 8,
};

/**
 * A reskinnable pause-menu building block: a primary Resume button plus a game-filled list of slot
 * items (Settings, Save, Quit, …), stacked in a `HudTheme`-token-driven {@link HudFrame}. It ships
 * the common shape every game's pause screen needs and nothing genre-specific — the game supplies the
 * title, item labels/order, and destructive styling, and reskins with `HudTheme` tokens. Drop it into
 * a {@link ModalHost} keyed on a `"pause"` modal, or render it standalone.
 *
 * @capability pause-menu reskinnable pause-menu building block — Resume plus a game-filled Settings/Quit slot list, HudTheme-driven
 */
export function PauseMenu({
  title = "Paused",
  onResume,
  resumeLabel = "Resume",
  items = [],
  width = 300,
  className,
  style,
}: PauseMenuProps): ReactNode {
  return (
    <HudFrame variation="themed" width={width} padding={20} interactive className={className} style={style}>
      <div data-pause-title="" style={PAUSE_TITLE}>{title}</div>
      <button
        type="button"
        data-pause-resume=""
        onClick={onResume}
        style={{ ...PAUSE_ITEM_BASE, ...primaryButtonStyle(false), marginTop: 0 }}
      >
        {resumeLabel}
      </button>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          data-pause-item={item.id}
          onClick={item.onSelect}
          disabled={item.disabled}
          style={{
            ...PAUSE_ITEM_BASE,
            ...(item.danger
              ? { background: "transparent", color: "#f0787c", border: "1px solid rgba(229,72,77,0.5)" }
              : GHOST_BUTTON),
            opacity: item.disabled === true ? 0.5 : 1,
            cursor: item.disabled === true ? "not-allowed" : "pointer",
          }}
        >
          {item.label}
        </button>
      ))}
    </HudFrame>
  );
}
