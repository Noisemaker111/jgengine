import {
  createSelectionBookmarks,
  recallSelectionBookmark,
  resolveControlGroupIntent,
  type ControlGroupIntent,
  type SelectionBookmarks,
} from "@jgengine/core/world";
import { createSelectionSet, type SelectionSet } from "@jgengine/core/scene/selection";

/**
 * First adopter of the selection-bookmark seam (issue #916). The showcase keeps a
 * single control-group store shared by two idioms:
 *   - numbered RTS control groups ("1"…"9") via the optional `@jgengine/core`
 *     input composition (Ctrl+digit binds, digit recalls, double-tap focuses);
 *   - one non-numbered `"home"` bookmark, recalled by a dedicated key.
 * The store stays pure — this module owns the focus hook (camera follow) and the
 * validity predicate (entity still present), exactly the caller-owned seams the
 * primitive exposes.
 */

/** The non-numbered bookmark demonstrating that keys are opaque strings, not just digits. */
export const HOME_BOOKMARK = "home";
const DOUBLE_TAP_MS = 300;

/** The slice of `GameContext` the control-group manager needs — narrow so it unit-tests without a full runtime. */
export interface ControlGroupDeps {
  /** Prune predicate source: an entity id still resolves to a live entity. */
  entityExists(id: string): boolean;
  /** Focus hook: center/follow the camera on the primary recalled entity. */
  focus(entityId: string): void;
}

export interface ControlGroupManager {
  /** The shared bookmark store, so callers can bind the "home" bookmark or serialize for saves. */
  readonly bookmarks: SelectionBookmarks;
  /** The active selection the bookmarks fold into on recall. */
  readonly selection: SelectionSet;
  /** Bind the current selection under a numbered group. */
  bindGroup(digit: number): void;
  /** Recall a numbered group; a second recall within the double-tap window focuses the camera. Returns the applied ids. */
  recallGroup(digit: number): string[];
  /** Recall the non-numbered `"home"` bookmark, always focusing. Returns the applied ids. */
  recallHome(): string[];
}

/**
 * Wire the selection-bookmark primitive to the showcase's entity store and camera.
 * Stale refs are pruned on every recall through `entityExists`, so a control group
 * that outlived its entities self-heals instead of selecting ghosts.
 */
export function createControlGroupManager(deps: ControlGroupDeps): ControlGroupManager {
  const bookmarks = createSelectionBookmarks();
  const selection = createSelectionSet();
  let lastRecall: { key: string; at: number } | null = null;

  const isValid = (id: string): boolean => deps.entityExists(id);
  const onFocus = (ids: readonly string[]): void => {
    const primary = ids[0];
    if (primary !== undefined) deps.focus(primary);
  };

  function apply(intent: ControlGroupIntent, now: number): string[] {
    if (intent.kind === "bind") {
      bookmarks.bind(intent.key, selection.list());
      return selection.list();
    }
    const ids = recallSelectionBookmark(bookmarks, intent.key, selection, {
      isValid,
      onFocus: intent.kind === "focus" ? onFocus : undefined,
    });
    lastRecall = { key: intent.key, at: now };
    return ids;
  }

  return {
    bookmarks,
    selection,
    bindGroup(digit) {
      apply(resolveControlGroupIntent({ digit, bindModifier: true, now: 0, lastRecall: null }), 0);
    },
    recallGroup(digit) {
      const now = Date.now();
      const intent = resolveControlGroupIntent(
        { digit, bindModifier: false, now, lastRecall },
        { doubleTapMs: DOUBLE_TAP_MS },
      );
      return apply(intent, now);
    },
    recallHome() {
      return recallSelectionBookmark(bookmarks, HOME_BOOKMARK, selection, { isValid, onFocus });
    },
  };
}
