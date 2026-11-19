/** @jsxImportSource @jgengine/core/ui/jsx */
import { useCallback, useEffect, useReducer, useRef, type CSSProperties, type ReactNode } from "@jgengine/core/ui/jsx";

import {
  MODAL_CANCEL,
  MODAL_CONFIRM,
  type ModalRecord,
  type ModalStack,
} from "@jgengine/core/dialog/modalStack";

import { useReducedMotion } from "@jgengine/core/ui/accessibility.view";
import { useDialogBehavior } from "./dialogBehavior.view";
import { useEngineStyles } from "@jgengine/ui/engineStyles";
import { HudButton } from "@jgengine/core/hud/hudButton.view";
import { useHudInteract, type HudInteractListener } from "@jgengine/core/hud/hudInteract.view";
import { HudSurface } from "@jgengine/core/hud/hudSurface.view";
import { hudType } from "@jgengine/core/hud/hudTokens";
import { useMountPresence } from "@jgengine/core/ui/presence.view";

/**
 * UI chrome over the headless modal stack (`@jgengine/core/dialog/modalStack`) — the blocking-overlay
 * layer a game raises over its scene: a pause menu, a "quit to menu?" confirm, a reward popup.
 * {@link useModalStack} is the DATA/HOOK layer (subscribe + the active record), {@link ModalHost}
 * renders the top modal with a backdrop, focus trap, and Esc-to-cancel, and {@link ConfirmDialog} /
 * {@link PauseMenu} (`menu/pauseMenu`) are ready-to-wire, HudTheme-token-driven building blocks. All unskinned and
 * game-owned: the model never interprets a modal's `kind`, so a game switches on it to pick which of
 * these (or its own) content to show, and reskins everything via `HudTheme` tokens and the frame.
 */

export interface ModalStackView {
  top: ModalRecord | null;
  depth: number;
}

/** @capability use-modal-stack UI hook binding a modal stack to a component — re-renders on push/pop/resolve */
export function useModalStack(stack: ModalStack): ModalStackView {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => stack.subscribe(bump), [stack]);
  return { top: stack.top(), depth: stack.depth() };
}

export interface ModalHostProps {
  stack: ModalStack;
  children: (record: ModalRecord, controls: ModalControls) => ReactNode;
  showBackdrop?: boolean;
  backdrop?: string;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  /** z-index of the host's stacking context — sits above the HUD/windows. Default 80. */
  zIndexBase?: number;
  onInteract?: HudInteractListener;
  className?: string;
  style?: CSSProperties;
}

const MODAL_EXIT_MS = 140;

export interface ModalControls {
  resolve: (result: string, payload?: unknown) => void;
  confirm: (payload?: unknown) => void;
  cancel: () => void;
}

/** @capability modal-host full-screen modal/dialog host over a modal stack — dimmed backdrop, focus trap, Esc/backdrop-to-cancel, aria-modal dialog */
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
  const presence = useMountPresence(live !== null, useReducedMotion() ? 0 : MODAL_EXIT_MS);
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

export interface ConfirmDialogProps {
  title: ReactNode;
  body?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
}

/** @capability confirm-dialog generic themeable confirm/cancel dialog — title, body, two buttons, danger styling */
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
    <HudSurface elevation="modal" width={width} padding={20} className={className} style={style}>
      <h2 data-confirm-title="" style={DIALOG_TITLE}>{title}</h2>
      {body !== undefined ? <p data-confirm-body="" style={DIALOG_BODY}>{body}</p> : null}
      <div style={BUTTON_ROW}>
        <HudButton data-confirm-cancel="" cue="cancel" onClick={onCancel}>{cancelLabel}</HudButton>
        <HudButton data-confirm-accept="" cue="confirm" variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</HudButton>
      </div>
    </HudSurface>
  );
}
