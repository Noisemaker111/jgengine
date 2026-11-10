/* tslint:disable */
/* eslint-disable */

export function canvas_frame(id: number, source: HTMLElement): void;

/**
 * Mount options: `{"fonts": ["/fonts/x.ttf", ...], "sans": "Family", "mono": "Family"}`.
 * Font files must be TrueType/OpenType (not WOFF); they are fetched relative to
 * the page while the GPU starts.
 */
declare function mount2(canvas_id: string, options_json: string): void;
export { mount2 as mount }

/**
 * Replace CSS boxes in place: `[{"k":"x","id":N,...}, ...]`, each taking the place of the box
 * that has its id. A box that is not in the tree is skipped. This is how a changed subtree
 * reaches Rune without the whole tree being sent again.
 */
export function patch(json: string): void;

/**
 * Replace one CSS box's text: `json` is its text record, or `null` for none. The per-change
 * path for a number or label that moves: no layout or paint field is parsed again.
 */
export function patch_text(id: number, json: string): void;

export function remove_canvas(id: number): void;

/**
 * Move a keyed CSS scroller without rebuilding its view.
 */
export function scroll_to(id: number, x: number, y: number, smooth: boolean): void;

/**
 * Replace the whole widget tree. Rare: structure changes, not per-frame values.
 * Field edits for ids that survive are kept.
 */
export function set_spec(json: string): void;

export function unmount(): void;

/**
 * JS wrote bound values that may have changed pixels: commit one frame.
 * Called only when the JS-side diff saw a value move, never per frame.
 */
export function values_changed(): void;

export function values_len(): number;

export function values_ptr(): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly canvas_frame: (a: number, b: number, c: any) => void;
    readonly mount: (a: number, b: number, c: number, d: number) => void;
    readonly patch: (a: number, b: number) => void;
    readonly patch_text: (a: number, b: number, c: number) => void;
    readonly remove_canvas: (a: number) => void;
    readonly scroll_to: (a: number, b: number, c: number, d: number) => void;
    readonly set_spec: (a: number, b: number) => void;
    readonly unmount: () => void;
    readonly values_changed: () => void;
    readonly values_len: () => number;
    readonly values_ptr: () => number;
    readonly __wasm_bindgen_func_elem_13820: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_13820_22: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_13820_23: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_15301: (a: number, b: number, c: any, d: any) => void;
    readonly __wasm_bindgen_func_elem_16498: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_1770: (a: number, b: number, c: number, d: number) => void;
    readonly __wasm_bindgen_func_elem_15298: (a: number, b: number, c: number) => void;
    readonly __wasm_bindgen_func_elem_15299: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_15299_14: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_15299_15: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_15299_16: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_15299_18: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_15299_19: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_15299_20: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_15299_21: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_15297: (a: number, b: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export4: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_export5: (a: number) => void;
    readonly __wbindgen_export6: (a: number, b: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export7: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
