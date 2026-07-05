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
export type ActionBindingMap<TAction extends string, TCode extends string = string> = Record<TAction, ActionBinding<TCode>>;
export declare function bindingMatches<TCode extends string>(code: TCode, binding: ActionBinding<TCode>): boolean;
/** First action (in the map's key order) bound to the given control code, or null. */
export declare function resolveBoundAction<TAction extends string, TCode extends string>(code: TCode, bindings: ActionBindingMap<TAction, TCode>): TAction | null;
/**
 * Collapse left/right modifier variants of a KeyboardEvent.code so bindings
 * store one logical key.
 */
export declare function normalizeKeyCode(code: string): string;
export interface ActionBindingModes<TCode extends string = string> {
    hold?: ActionBinding<TCode>[];
    toggle?: ActionBinding<TCode>[];
}
export type ActionBindingConfig<TCode extends string = string> = ActionBinding<TCode>[] | ActionBindingModes<TCode>;
export type ActionStateBindingMap<TAction extends string, TCode extends string = string> = Record<TAction, ActionBindingConfig<TCode>>;
export type ActionCodes<TCode extends string = string> = readonly TCode[] | {
    hold?: readonly TCode[];
    toggle?: readonly TCode[];
};
export type ActionCodesMap<TAction extends string = string, TCode extends string = string> = Record<TAction, ActionCodes<TCode>>;
export declare function toActionStateBindingMap<TAction extends string, TCode extends string>(map: ActionCodesMap<TAction, TCode>): ActionStateBindingMap<TAction, TCode>;
export interface ActionStateTracker<TAction extends string> {
    handleDown(code: string): TAction | null;
    handleUp(code: string): TAction | null;
    isDown(action: TAction): boolean;
    wasPressed(action: TAction): boolean;
    endFrame(): void;
    reset(): void;
}
export declare function createActionStateTracker<TAction extends string, TCode extends string = string>(map: ActionStateBindingMap<TAction, TCode>): ActionStateTracker<TAction>;
