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
  | { hold?: readonly TCode[]; toggle?: readonly TCode[]; repeatMs?: number };

export type ActionCodesMap<TAction extends string = string, TCode extends string = string> = Record<
  TAction,
  ActionCodes<TCode>
>;

export function actionRepeatMs(codes: ActionCodes | undefined): number | undefined {
  if (codes === undefined || Array.isArray(codes)) return undefined;
  return (codes as { repeatMs?: number }).repeatMs;
}

export interface ShouldDispatchActionInput {
  pressed: boolean;
  down: boolean;
  repeatMs: number | undefined;
  lastFiredAt: number | null;
  now: number;
}

export function shouldDispatchAction({ pressed, down, repeatMs, lastFiredAt, now }: ShouldDispatchActionInput): boolean {
  if (pressed) return true;
  if (repeatMs === undefined || repeatMs <= 0) return false;
  if (!down || lastFiredAt === null) return false;
  return now - lastFiredAt >= repeatMs;
}

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

const HOTBAR_DIGIT_CODES = [
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Digit7",
  "Digit8",
  "Digit9",
  "Digit0",
] as const;

export function hotbarSlotBindings(
  count: number,
  options?: { action?: (slot: number) => string },
): ActionCodesMap {
  if (!Number.isInteger(count) || count < 1 || count > HOTBAR_DIGIT_CODES.length) {
    throw new Error(`hotbarSlotBindings: count must be an integer in [1, ${HOTBAR_DIGIT_CODES.length}]`);
  }
  const action = options?.action ?? ((slot: number) => `hotbarSlot${slot}`);
  const map: ActionCodesMap = {};
  for (let slot = 1; slot <= count; slot += 1) {
    map[action(slot)] = [HOTBAR_DIGIT_CODES[slot - 1]];
  }
  return map;
}

const HOTBAR_SLOT_ACTION = /^(?:hotbar)?slot(\d+)$/i;

/** 0-based slot index for a hotbar-slot action name (`slot1`, `hotbarSlot1`), or null. */
export function hotbarSlotActionIndex(action: string): number | null {
  const match = HOTBAR_SLOT_ACTION.exec(action);
  return match === null ? null : Number(match[1]) - 1;
}

export function isHotbarSlotAction(action: string): boolean {
  return HOTBAR_SLOT_ACTION.test(action);
}

/**
 * Convention mapping a bound input action to the command it fires: the action's
 * own name when a command by that name exists, otherwise a `ui.<action>`
 * fallback. Reserved actions (consumed natively by the shell) and hotbar slots
 * yield null so the shell can handle them itself.
 */
export function resolveActionCommand(
  action: string,
  has: (command: string) => boolean,
  reserved: ReadonlySet<string>,
): string | null {
  if (reserved.has(action) || isHotbarSlotAction(action)) return null;
  if (has(action)) return action;
  const uiCommand = `ui.${action}`;
  return has(uiCommand) ? uiCommand : null;
}

const CODE_LABELS: Record<string, string> = {
  mouse0: "LMB",
  mouse1: "MMB",
  mouse2: "RMB",
  Space: "Space",
  space: "Space",
  Escape: "Esc",
  Tab: "Tab",
  Enter: "Enter",
  Backspace: "Bksp",
  Shift: "Shift",
  ShiftLeft: "Shift",
  ShiftRight: "Shift",
  Control: "Ctrl",
  ControlLeft: "Ctrl",
  ControlRight: "Ctrl",
  AltLeft: "Alt",
  AltRight: "Alt",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

export function bindingLabel(code: string): string {
  const direct = CODE_LABELS[code];
  if (direct !== undefined) return direct;
  if (code.startsWith("Key") && code.length === 4) return code.slice(3);
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  return code.length === 1 ? code.toUpperCase() : code;
}

/** Short display label for an action's first bound code, or null when unbound. */
export function actionLabel(map: ActionCodesMap, action: string): string | null {
  const codes = map[action];
  if (codes === undefined) return null;
  let list: readonly string[];
  if (Array.isArray(codes)) {
    list = codes as readonly string[];
  } else {
    const modes = codes as { hold?: readonly string[]; toggle?: readonly string[] };
    list = modes.hold ?? modes.toggle ?? [];
  }
  const first = list[0];
  return first === undefined ? null : bindingLabel(first);
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
