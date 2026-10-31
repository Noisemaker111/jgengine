import { Component, createContext, useContext, useEffect, useId, useLayoutEffect, useState, type ErrorInfo, type ReactNode } from "react";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { suspendPlayControls } from "@jgengine/core/game/controlGate";

import { ErrorReportActions, errorReportContext } from "@jgengine/core/devtools/diagnosticOverlay.view";

const handledPresentationErrors = new WeakSet<object>();
const codeLoadFailures = new WeakSet<object>();

/** Marks only a rejected presentation import for page reload; browser module failures are cached. @internal */
export function markPresentationCodeLoadFailure(error: unknown): Error {
  const failure = error instanceof Error ? error : new Error(String(error));
  codeLoadFailures.add(failure);
  return failure;
}

/** @internal Distinguishes module loading from recoverable assets without guessing from error text. */
export function presentationRecoveryAction(error: unknown): "reload" | "retry" {
  return typeof error === "object" && error !== null && codeLoadFailures.has(error) ? "reload" : "retry";
}

function markPresentationErrorHandled(error: unknown): void {
  if ((typeof error === "object" && error !== null) || typeof error === "function") handledPresentationErrors.add(error);
}

function forgetPresentationError(error: unknown): void {
  if ((typeof error === "object" && error !== null) || typeof error === "function") handledPresentationErrors.delete(error);
}

/** @internal Classifies a reported React error after its owning boundary commits. */
export function deferUnhandledPresentationError(error: unknown, report: () => void): void {
  queueMicrotask(() => {
    if (((typeof error === "object" && error !== null) || typeof error === "function") && handledPresentationErrors.has(error)) return;
    report();
  });
}

/** @internal Exact pending texture groups owned by one presentation, including uncommitted Suspense. */
export function createPresentationRetryRegistry(defaultClear?: (inputs: string[]) => void) {
  type Group = { inputs: string[]; loaded: boolean };
  const loaders = new Map<(inputs: string[]) => void, Map<string, Group>>();
  return {
    register(inputs: readonly string[], clear = defaultClear) {
      if (clear === undefined) throw new Error("A recoverable loader must provide its cache clear callback");
      let groups = loaders.get(clear);
      if (groups === undefined) { groups = new Map(); loaders.set(clear, groups); }
      const key = JSON.stringify(inputs);
      let group = groups.get(key);
      if (group === undefined) {
        group = { inputs: [...inputs], loaded: false };
        groups.set(key, group);
      }
      const registered = group;
      return () => { registered.loaded = true; };
    },
    retry() {
      for (const [clear, groups] of loaders) {
        for (const [key, group] of groups) {
          if (group.loaded) continue;
          clear(group.inputs);
          groups.delete(key);
        }
      }
    },
  };
}

type RetryRegistry = ReturnType<typeof createPresentationRetryRegistry>;
type PresentationRetryScope = { registry: RetryRegistry; fail: (error: unknown, stack?: string) => void; recoveredDraw: () => void };
const PresentationRetryContext = createContext<PresentationRetryScope | null>(null);

/** Renderer-only loader adapters share the DOM owner without importing their libraries here. @internal */
export function usePresentationRetryScope() {
  return useContext(PresentationRetryContext);
}

class AssetErrorBoundary extends Component<{ children: ReactNode; onError: PresentationRetryScope["fail"] }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(error: unknown, info: ErrorInfo): void { this.props.onError(error, info.componentStack ?? undefined); }
  override render(): ReactNode { return this.state.failed ? null : this.props.children; }
}

/** @internal Forwards renderer-local loader errors to the owning DOM presentation. */
export function PresentationAssetBoundary({ children }: { children: ReactNode }): ReactNode {
  const scope = useContext(PresentationRetryContext);
  return scope === null ? children : <AssetErrorBoundary onError={scope.fail}>{children}</AssetErrorBoundary>;
}

/** @internal Retires only diagnostics belonging to this exact handled presentation error. */
export function createPresentationDiagnosticOwnership() {
  const ids = new WeakMap<object, Set<number>>();
  return {
    register(error: unknown, id: number, phase: string) {
      if (phase !== "presentation" || typeof error !== "object" || error === null) return;
      const owned = ids.get(error) ?? new Set<number>();
      owned.add(id); ids.set(error, owned);
    },
    recovered(error: unknown): ReadonlySet<number> {
      if (typeof error !== "object" || error === null) return new Set<number>();
      const owned = ids.get(error) ?? new Set<number>(); ids.delete(error); return owned;
    },
  };
}

/** Restores an owned recovered surface only after Suspense has attached and revealed it. @internal */
export function createPlaySurfaceFocusOwnership<Owner>() {
  let pending: Owner | null = null;
  return {
    request(owner: Owner) { pending = owner; },
    reveal(owner: Owner, surface: HTMLElement | null, active: Element | null, body: HTMLElement): boolean {
      if (pending === null) return false;
      if (pending !== owner) { pending = null; return false; }
      if (surface === null || !surface.isConnected || surface.getClientRects().length === 0) return false;
      const bounds = surface.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return false;
      pending = null;
      if (active !== null && active !== body && !surface.contains(active)) return false;
      surface.focus({ preventScroll: true });
      return true;
    },
  };
}

function RecoveryFailure({ ctx, error, retry }: { ctx: GameContext; error: unknown; retry: () => void }) {
  useLayoutEffect(() => suspendPlayControls(ctx), [ctx]);
  const descriptionId = useId();
  const message = error instanceof Error ? error.message : String(error);
  const reload = presentationRecoveryAction(error) === "reload";
  const report = ["JGengine presentation error", message, error instanceof Error ? error.stack : null, errorReportContext()]
    .filter((line): line is string => line !== null && line !== undefined).join("\n");
  return (
    <div style={{ display: "grid", width: "100%", height: "100%", placeItems: "center", padding: 24, background: "#08151d", color: "#e9f6ee", fontFamily: "system-ui" }} data-presentation-recovery="failed">
      <section role="alert" aria-describedby={descriptionId} style={{ width: "100%", maxWidth: 480, padding: 28, border: "1px solid #35616b", borderRadius: 16, background: "#102735", boxShadow: "0 20px 60px #0006" }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 650 }}>The game view couldn’t load</h2>
        <p id={descriptionId} style={{ margin: "12px 0 20px", color: "#c3d9dd", lineHeight: 1.5 }}>{reload ? "Reload the game to reconnect and load its view. If the problem continues, the technical details can help the game’s author investigate." : "Retry to load the view again. If the problem continues, the technical details can help the game’s author investigate."}</p>
        <button type="button" autoFocus style={{ border: "1px solid #8ce0c2", borderRadius: 8, background: "#8ce0c2", color: "#082b22", padding: "10px 18px", font: "inherit", fontWeight: 650, cursor: "pointer" }} onClick={retry}>{reload ? "Reload game" : "Retry display"}</button>
        <details style={{ marginTop: 24, borderTop: "1px solid #35616b", paddingTop: 16 }}>
          <summary style={{ cursor: "pointer", color: "#b7d3da" }}>Technical details</summary>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 160, overflow: "auto", fontSize: 12, color: "#c3d9dd" }}>{message}</pre>
          <ErrorReportActions report={report} issueTitle={`Presentation: ${message}`} />
        </details>
      </section>
    </div>
  );
}

/** Reports the owning presentation attempt and recovery lifecycle. @internal */
export type PresentationRecoveryEvent = { phase: string; attempt: number; scope: number; sameOwner: boolean; pending: boolean; failed: boolean };

type RecoveryProps = {
  ctx: GameContext;
  children: ReactNode;
  onRuntimeError: (error: unknown, phase: string, componentStack?: string) => void;
  onRetryCommitted?: () => void;
  onRecoveredDraw?: (error: unknown) => void;
  onRecoveryEvent?: (event: PresentationRecoveryEvent) => void;
};
type RecoveryState = { owner: GameContext; failed: boolean; error: unknown; registry: RetryRegistry };

/** @internal Retains the live context for asset Retry; failed browser modules require page reload. */
export class PresentationRecovery extends Component<RecoveryProps, RecoveryState> {
  override state: RecoveryState = { owner: this.props.ctx, failed: false, error: null, registry: createPresentationRetryRegistry() };
  static getDerivedStateFromProps(props: RecoveryProps, state: RecoveryState): Partial<RecoveryState> | null {
    if (props.ctx === state.owner) return null;
    forgetPresentationError(state.error);
    return { owner: props.ctx, failed: false, error: null, registry: createPresentationRetryRegistry() };
  }
  static getDerivedStateFromError(error: unknown): Partial<RecoveryState> { return { failed: true, error }; }
  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.pendingRecovery = null;
    this.trace("caught");
    markPresentationErrorHandled(error);
    this.props.onRuntimeError(error, "presentation", info.componentStack ?? undefined);
  }
  override componentDidUpdate(previousProps: RecoveryProps, previousState: RecoveryState): void {
    if (previousState.failed && !this.state.failed && previousState.owner === this.state.owner && previousProps.ctx === this.props.ctx) { this.trace("retry-committed"); this.props.onRetryCommitted?.(); }
  }
  override componentWillUnmount(): void { forgetPresentationError(this.state.error); }
  private attempt = 0;
  private scopeId = 0;
  private trace(phase: string) {
    this.props.onRecoveryEvent?.({ phase, attempt: this.attempt, scope: this.scopeId, sameOwner: this.props.ctx === this.state.owner, pending: this.pendingRecovery !== null, failed: this.state.failed });
  }
  private scope: PresentationRetryScope | null = null;
  private pendingRecovery: { owner: GameContext; error: unknown } | null = null;
  private retry = () => {
    if (presentationRecoveryAction(this.state.error) === "reload") { globalThis.location.reload(); return; }
    this.attempt += 1;
    this.pendingRecovery = { owner: this.state.owner, error: this.state.error };
    this.trace("retry-requested");
    this.state.registry.retry();
    forgetPresentationError(this.state.error);
    this.setState({ failed: false, error: null });
  };
  override render(): ReactNode {
    if (this.state.failed) return <RecoveryFailure ctx={this.props.ctx} error={this.state.error} retry={this.retry} />;
    const owner = this.state.owner;
    if (this.scope === null || this.scope.registry !== this.state.registry) { this.scopeId += 1; this.scope = { registry: this.state.registry, fail: (error, stack) => {
      if (this.props.ctx !== owner) return;
      this.pendingRecovery = null;
      this.trace("asset-failed");
      markPresentationErrorHandled(error);
      this.props.onRuntimeError(error, "presentation", stack);
      this.setState({ failed: true, error });
    }, recoveredDraw: () => {
      this.trace("draw-observed");
      const pending = this.pendingRecovery;
      if (pending === null || pending.owner !== owner || this.props.ctx !== owner || this.state.failed) return;
      this.pendingRecovery = null;
      this.trace("draw-accepted");
      this.props.onRecoveredDraw?.(pending.error);
    } }; }
    return <PresentationRetryContext value={this.scope}>{this.props.children}</PresentationRetryContext>;
  }
}

/** Report a canvas's WebGL context as lost or back; asks the browser to restore it. Returns the unsubscribe. @internal */
export function watchContextLoss(canvas: EventTarget, onChange: (lost: boolean) => void): () => void {
  const onLost = (event: Event) => {
    // Without preventDefault the browser never offers the context back.
    event.preventDefault();
    onChange(true);
  };
  const onRestored = () => onChange(false);
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  return () => {
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
  };
}

/**
 * Watches the game canvas for a lost WebGL context and draws a screen over it instead of a silent black
 * frame: play controls stop while it is lost, the browser is asked to restore it, and the player can
 * reload. A restored context removes the screen. @internal
 */
export function ContextLossScreen({ ctx, canvas }: { ctx: GameContext; canvas: HTMLCanvasElement | null }): ReactNode {
  const [lost, setLost] = useState(false);
  useEffect(() => (canvas === null ? undefined : watchContextLoss(canvas, setLost)), [canvas]);
  useLayoutEffect(() => (lost ? suspendPlayControls(ctx) : undefined), [ctx, lost]);
  if (!lost) return null;
  return (
    <div data-context-lost="" style={{ position: "absolute", inset: 0, zIndex: 80, display: "grid", placeItems: "center", padding: 24, background: "rgba(8, 21, 29, 0.92)", color: "#e9f6ee", fontFamily: "system-ui" }}>
      <section role="alert" style={{ width: "100%", maxWidth: 440, padding: 24, border: "1px solid #35616b", borderRadius: 16, background: "#102735" }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 650 }}>The display was lost</h2>
        <p style={{ margin: "10px 0 18px", color: "#c3d9dd", lineHeight: 1.5 }}>The graphics driver reset. The game is paused and will come back on its own; if it does not, reload. Your last checkpoint is kept.</p>
        <button type="button" autoFocus style={{ border: "1px solid #8ce0c2", borderRadius: 8, background: "#8ce0c2", color: "#082b22", padding: "10px 18px", font: "inherit", fontWeight: 650, cursor: "pointer" }} onClick={() => location.reload()}>Reload game</button>
      </section>
    </div>
  );
}
