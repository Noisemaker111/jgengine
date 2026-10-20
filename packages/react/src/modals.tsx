import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  MODAL_CANCEL,
  MODAL_CONFIRM,
  type ModalRecord,
  type ModalStack,
} from "@jgengine/core/ui/modalStack";

import { useReducedMotion } from "./accessibility";
import { useDialogBehavior } from "./dialogBehavior";
import { useEngineStyles } from "./engineStyles";
import { HudButton } from "./hudButton";
import { useHudInteract, type HudInteractListener } from "./hudInteract";
import { HudPanel } from "./hudPanel";
import { hudType } from "./hudTokens";
import { usePresence } from "./presence";

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
  /** Called with `open` / `close` as modals show and the stack empties (`cue` is the modal kind) — the UI sound seam. */
  onInteract?: HudInteractListener;
  className?: string;
  style?: CSSProperties;
}

const MODAL_EXIT_MS = 140;

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
  onInteract,
  className,
  style,
}: ModalHostProps): ReactNode {
  useEngineStyles();
  const { top: live } = useModalStack(stack);
  const last = useRef<ModalRecord | null>(live);
  if (live !== null) last.current = live;
  const presence = usePresence(live !== null, useReducedMotion() ? 0 : MODAL_EXIT_MS);
  const top = live ?? (presence === "closed" ? last.current : null);
  const report = useHudInteract("modal", top?.kind, onInteract);
  const reportedId = useRef<string | null>(null);
  useEffect(() => {
    const id = live?.id ?? null;
    if (id === reportedId.current) return;
    const wasOpen = reportedId.current !== null;
    reportedId.current = id;
    if (id !== null) report("open");
    else if (wasOpen) report("close");
  }, [live, report]);

  const controls: ModalControls = {
    resolve: useCallback((result: string, payload?: unknown) => stack.resolve(result, payload !== undefined ? { payload } : undefined), [stack]) as ModalControls["resolve"],
    confirm: useCallback((payload?: unknown) => stack.resolve(MODAL_CONFIRM, payload !== undefined ? { payload } : undefined), [stack]),
    cancel: useCallback(() => stack.resolve(MODAL_CANCEL), [stack]),
  };

  const panelRef = useDialogBehavior({
    open: top !== null,
    focusKey: top?.id,
    onClose: closeOnEsc ? controls.cancel : undefined,
  });

  if (top === null) return null;
  const dim = backdrop ?? "var(--jg-backdrop, rgba(4,7,12,0.62))";

  return (
    <div
      data-modal-host=""
      data-state={live === null ? "closed" : "open"}
      className={className}
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
          style={{ position: "fixed", inset: 0, background: dim, pointerEvents: live === null ? "none" : undefined }}
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
        style={{ position: "relative", pointerEvents: live === null ? "none" : "auto", outline: "none", maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 32px)" }}
      >
        {children(top, controls)}
      </div>
    </div>
  );
}

const DIALOG_TITLE: CSSProperties = { margin: 0, fontFamily: "var(--jg-font-display, inherit)", fontSize: hudType("lg"), fontWeight: 700, letterSpacing: 0.1, lineHeight: 1.3 };
const DIALOG_BODY: CSSProperties = { margin: "10px 0 0", fontSize: hudType("md"), lineHeight: 1.55, color: "var(--jg-text-dim, rgba(226,232,240,0.82))" };
const BUTTON_ROW: CSSProperties = { display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" };

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
 * a `HudTheme`-token-driven {@link HudPanel}. Presentation-only: wire `onConfirm`/`onCancel` to a
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
    <HudPanel elevation="modal" width={width} padding={20} className={className} style={style}>
      <h2 data-confirm-title="" style={DIALOG_TITLE}>{title}</h2>
      {body !== undefined ? <p data-confirm-body="" style={DIALOG_BODY}>{body}</p> : null}
      <div style={BUTTON_ROW}>
        <HudButton data-confirm-cancel="" cue="cancel" onClick={onCancel}>{cancelLabel}</HudButton>
        <HudButton data-confirm-accept="" cue="confirm" variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</HudButton>
      </div>
    </HudPanel>
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
  fontSize: hudType("xs"),
  fontWeight: 700,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  textAlign: "center",
  color: "var(--jg-accent, #38bdf8)",
};

const PAUSE_ITEM: CSSProperties = { marginTop: 8 };
const PAUSE_DANGER_ITEM: CSSProperties = { ...PAUSE_ITEM, color: "var(--jg-danger, #e5484d)", borderColor: "rgba(229,72,77,0.45)" };

/**
 * A reskinnable pause-menu building block: a primary Resume button plus a game-filled list of slot
 * items (Settings, Save, Quit, …), stacked in a `HudTheme`-token-driven {@link HudPanel}. It ships
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
    <HudPanel elevation="modal" width={width} padding={20} className={className} style={style}>
      <div data-pause-title="" style={PAUSE_TITLE}>{title}</div>
      <HudButton data-pause-resume="" cue="resume" variant="primary" size="lg" block onClick={onResume}>
        {resumeLabel}
      </HudButton>
      {items.map((item) => (
        <HudButton
          key={item.id}
          data-pause-item={item.id}
          cue={`pause:${item.id}`}
          size="lg"
          block
          onClick={item.onSelect}
          disabled={item.disabled}
          style={item.danger ? PAUSE_DANGER_ITEM : PAUSE_ITEM}
        >
          {item.label}
        </HudButton>
      ))}
    </HudPanel>
  );
}
