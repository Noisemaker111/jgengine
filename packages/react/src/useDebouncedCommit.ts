import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Live-mirrored, trailing-debounced commit binding for a single control value.
 *
 * A raw slider/number/color input fires an event on every pointer step (~50 per drag). When each
 * event commits straight into an expensive owner (a scene-document patch that regenerates streets,
 * scatter, or grass), the drag lags. This binding decouples the two: {@link DebouncedCommit.value}
 * mirrors the raw input locally for instant visual feedback, while {@link DebouncedCommit.onInput}
 * schedules the real `commit` on a trailing debounce so the owner only sees one write per pause.
 * Call {@link DebouncedCommit.flush} on pointer-up / blur / keyboard-commit to land the value
 * immediately. The binding also flushes on unmount, and re-syncs the local mirror when the external
 * `value` changes (undo, RPC echo) — but never mid-edit, so an in-flight drag is not fought.
 *
 * Render the control's `value` and any readout from {@link DebouncedCommit.value}, not the prop, so
 * the thumb tracks the pointer instantly.
 */
export interface DebouncedCommit<T> {
  /** The live, locally-mirrored value. Always render the control + readout from this. */
  value: T;
  /** Feed a raw input value: mirrors it locally now, schedules the trailing `commit`. */
  onInput: (next: T) => void;
  /** Commit any pending value immediately (pointer-up / blur / Enter). No-op when clean. */
  flush: () => void;
}

/** Injectable timer seam so the controller is testable with a manual clock. */
export interface DebounceTimer {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const defaultTimer: DebounceTimer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Framework-free core of {@link useDebouncedCommit}: owns the live value, the dirty flag, and the
 * trailing-debounce timer. Notifies the caller of local-value changes through `onLocalChange` (the
 * hook wires this to `setState`). Exposed for focused testing with an injected {@link DebounceTimer}.
 * @internal
 */
export function createDebouncedCommit<T>(options: {
  initial: T;
  commit: (value: T) => void;
  onLocalChange: (value: T) => void;
  delayMs: () => number;
  timer?: DebounceTimer;
}): {
  getValue: () => T;
  isDirty: () => boolean;
  input: (next: T) => void;
  flush: () => void;
  sync: (external: T) => void;
  dispose: () => void;
} {
  const timer = options.timer ?? defaultTimer;
  let local = options.initial;
  let dirty = false;
  let handle: unknown = null;

  const cancel = () => {
    if (handle !== null) {
      timer.clear(handle);
      handle = null;
    }
  };
  const commitPending = () => {
    cancel();
    if (dirty) {
      dirty = false;
      options.commit(local);
    }
  };

  return {
    getValue: () => local,
    isDirty: () => dirty,
    input: (next) => {
      local = next;
      dirty = true;
      options.onLocalChange(next);
      cancel();
      handle = timer.set(commitPending, options.delayMs());
    },
    flush: commitPending,
    sync: (external) => {
      // Adopt an external change (undo / RPC) only when not mid-edit, so an in-flight drag wins.
      if (dirty) return;
      if (!Object.is(external, local)) {
        local = external;
        options.onLocalChange(external);
      }
    },
    dispose: commitPending,
  };
}

/**
 * See {@link DebouncedCommit}. `commit` and `delayMs` may change between renders (kept in refs); the
 * binding identity stays stable except when `value` (the local mirror) changes.
 * @capability debounced-commit bind a slider/number/color control to an expensive commit path (scene-document patch, settings persist) — instant local mirror, one trailing commit per pause, flush on release/blur/unmount; no raw onChange→patch wiring
 */
export function useDebouncedCommit<T>(
  value: T,
  commit: (value: T) => void,
  delayMs = 180,
): DebouncedCommit<T> {
  const [local, setLocal] = useState(value);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const delayRef = useRef(delayMs);
  delayRef.current = delayMs;

  const controllerRef = useRef<ReturnType<typeof createDebouncedCommit<T>> | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createDebouncedCommit<T>({
      initial: value,
      commit: (next) => commitRef.current(next),
      onLocalChange: setLocal,
      delayMs: () => delayRef.current,
    });
  }
  const controller = controllerRef.current;

  // Re-sync the local mirror when the external value changes (undo / RPC), unless mid-edit.
  useEffect(() => {
    controller.sync(value);
  }, [value, controller]);

  // Flush any pending commit when the control unmounts.
  useEffect(() => () => controller.dispose(), [controller]);

  return useMemo(
    () => ({ value: local, onInput: controller.input, flush: controller.flush }),
    [local, controller],
  );
}
