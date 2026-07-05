/**
 * Action-binding model: games bind semantic actions ("jump", "interact") to
 * physical control codes; capture layers resolve raw events through this map
 * so gameplay code never sees keycodes. Control codes are plain strings, so
 * the same model serves keyboard codes, mouse buttons, touch controls, or
 * gamepad inputs.
 */

export interface ActionBinding<TCode extends string = string> {
  primary: TCode;
  secondary: TCode | null;
}

export type ActionBindingMap<TAction extends string, TCode extends string = string> = Record<
  TAction,
  ActionBinding<TCode>
>;

export function bindingMatches<TCode extends string>(code: TCode, binding: ActionBinding<TCode>): boolean {
  return code === binding.primary || code === binding.secondary;
}

/** First action (in the map's key order) bound to the given control code, or null. */
export function resolveBoundAction<TAction extends string, TCode extends string>(
  code: TCode,
  bindings: ActionBindingMap<TAction, TCode>,
): TAction | null {
  for (const action of Object.keys(bindings) as TAction[]) {
    if (bindingMatches(code, bindings[action])) return action;
  }
  return null;
}

/**
 * Collapse left/right modifier variants of a KeyboardEvent.code so bindings
 * store one logical key.
 */
export function normalizeKeyCode(code: string): string {
  if (code === "ShiftLeft" || code === "ShiftRight") return "Shift";
  if (code === "ControlLeft" || code === "ControlRight") return "Control";
  return code;
}

export interface ActionBindingModes<TCode extends string = string> {
  hold?: ActionBinding<TCode>[];
  toggle?: ActionBinding<TCode>[];
}

export type ActionBindingConfig<TCode extends string = string> = ActionBinding<TCode>[] | ActionBindingModes<TCode>;

export type ActionStateBindingMap<TAction extends string, TCode extends string = string> = Record<
  TAction,
  ActionBindingConfig<TCode>
>;

export type ActionCodes<TCode extends string = string> =
  | readonly TCode[]
  | { hold?: readonly TCode[]; toggle?: readonly TCode[] };

export type ActionCodesMap<TAction extends string = string, TCode extends string = string> = Record<
  TAction,
  ActionCodes<TCode>
>;

function toBindings<TCode extends string>(codes: readonly TCode[]): ActionBinding<TCode>[] {
  return codes.map((code) => ({ primary: code, secondary: null }));
}

export function toActionStateBindingMap<TAction extends string, TCode extends string>(
  map: ActionCodesMap<TAction, TCode>,
): ActionStateBindingMap<TAction, TCode> {
  const result = {} as ActionStateBindingMap<TAction, TCode>;
  for (const action of Object.keys(map) as TAction[]) {
    const codes = map[action];
    if (Array.isArray(codes)) {
      result[action] = toBindings(codes as readonly TCode[]);
    } else {
      const modes = codes as { hold?: readonly TCode[]; toggle?: readonly TCode[] };
      result[action] = { hold: toBindings(modes.hold ?? []), toggle: toBindings(modes.toggle ?? []) };
    }
  }
  return result;
}

export interface ActionStateTracker<TAction extends string> {
  handleDown(code: string): TAction | null;
  handleUp(code: string): TAction | null;
  isDown(action: TAction): boolean;
  wasPressed(action: TAction): boolean;
  endFrame(): void;
  reset(): void;
}

function resolveActionBindingModes<TCode extends string>(
  config: ActionBindingConfig<TCode>,
): Required<ActionBindingModes<TCode>> {
  if (Array.isArray(config)) return { hold: config, toggle: [] };
  return { hold: config.hold ?? [], toggle: config.toggle ?? [] };
}

export function createActionStateTracker<TAction extends string, TCode extends string = string>(
  map: ActionStateBindingMap<TAction, TCode>,
): ActionStateTracker<TAction> {
  const actions = Object.keys(map) as TAction[];
  const modesByAction = new Map(actions.map((action) => [action, resolveActionBindingModes(map[action])]));
  const heldCodesByAction = new Map<TAction, Set<TCode>>(actions.map((action) => [action, new Set()]));
  const toggledActions = new Set<TAction>();
  const pressedThisFrame = new Set<TAction>();
  const activeCodes = new Set<TCode>();

  function findAction(
    code: TCode,
    pick: (modes: Required<ActionBindingModes<TCode>>) => ActionBinding<TCode>[],
  ): TAction | null {
    for (const action of actions) {
      if (pick(modesByAction.get(action)!).some((binding) => bindingMatches(code, binding))) return action;
    }
    return null;
  }

  return {
    handleDown(code) {
      const normalized = normalizeKeyCode(code) as TCode;
      if (activeCodes.has(normalized)) return null;
      activeCodes.add(normalized);

      let matched: TAction | null = null;

      const holdAction = findAction(normalized, (modes) => modes.hold);
      if (holdAction !== null) {
        heldCodesByAction.get(holdAction)!.add(normalized);
        pressedThisFrame.add(holdAction);
        matched = holdAction;
      }

      const toggleAction = findAction(normalized, (modes) => modes.toggle);
      if (toggleAction !== null) {
        if (toggledActions.has(toggleAction)) toggledActions.delete(toggleAction);
        else toggledActions.add(toggleAction);
        pressedThisFrame.add(toggleAction);
        matched = matched ?? toggleAction;
      }

      return matched;
    },
    handleUp(code) {
      const normalized = normalizeKeyCode(code) as TCode;
      activeCodes.delete(normalized);

      const holdAction = findAction(normalized, (modes) => modes.hold);
      if (holdAction !== null) heldCodesByAction.get(holdAction)!.delete(normalized);
      return holdAction;
    },
    isDown(action) {
      return (heldCodesByAction.get(action)?.size ?? 0) > 0 || toggledActions.has(action);
    },
    wasPressed(action) {
      return pressedThisFrame.has(action);
    },
    endFrame() {
      pressedThisFrame.clear();
    },
    reset() {
      for (const codes of heldCodesByAction.values()) codes.clear();
      toggledActions.clear();
      pressedThisFrame.clear();
      activeCodes.clear();
    },
  };
}
