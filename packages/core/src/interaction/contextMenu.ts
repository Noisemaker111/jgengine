export type ContextTargetKind = "entity" | "object";

/** One right-click verb: a label plus the command it dispatches (walk-then-act supported by args). */
export interface ContextVerb {
  label: string;
  command: string;
  args?: Record<string, unknown>;
  /** Greyed-out and non-dispatchable when true (e.g. requirement unmet). */
  disabled?: boolean;
}

/** Builds a {@link ContextVerb} for a right-click menu entry. */
export function contextVerb(
  label: string,
  command: string,
  args?: Record<string, unknown>,
): ContextVerb {
  return args === undefined ? { label, command } : { label, command, args };
}

export interface ContextMenu {
  kind: ContextTargetKind;
  targetId: string;
  /** World point the click landed on, forwarded to dispatched commands for walk-then-act. */
  point?: readonly [number, number, number];
  verbs: readonly ContextVerb[];
}

export interface BuildContextMenuInput {
  kind: ContextTargetKind;
  targetId: string;
  verbs: readonly ContextVerb[] | undefined;
  point?: readonly [number, number, number];
}

/** Assemble a menu from a target's catalog verbs; null when the target lists none. */
export function buildContextMenu(input: BuildContextMenuInput): ContextMenu | null {
  if (input.verbs === undefined || input.verbs.length === 0) return null;
  const menu: ContextMenu = { kind: input.kind, targetId: input.targetId, verbs: input.verbs };
  if (input.point !== undefined) menu.point = input.point;
  return menu;
}

/**
 * Command input a chosen verb dispatches: the verb's own args, plus the target id and
 * the world point, so a single handler can walk the actor to the target then perform it.
 */
export function contextVerbInput(menu: ContextMenu, verb: ContextVerb): Record<string, unknown> {
  const base: Record<string, unknown> = { ...verb.args, target: menu.targetId, targetKind: menu.kind };
  if (menu.point !== undefined) base.point = menu.point;
  return base;
}
