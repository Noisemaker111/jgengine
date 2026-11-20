/* tslint:disable */
/* eslint-disable */

/**
 * Fetch and register additional font URLs on a live Rune instance without blocking or remounting.
 */
export function add_fonts(urls_json: string): void;

/**
 * Drop native keyboard focus: Escape leaving a field.
 */
export function blur_native(): void;

/**
 * Give a native field keyboard focus (the page's keyboard or pad chose it).
 */
export function focus_native(id: string): void;

/**
 * Actual native render submissions, including frames with no JS event payload.
 */
export function frames_drawn(): number;

/**
 * Mount options: `{"fonts": ["/fonts/x.woff2", ...], "sans": "Family", "mono": "Family"}`.
 * Fonts download in parallel without blocking the first frame.
 */
declare function mount2(canvas_id: string, options_json: string, on_frame: Function): void;
export { mount2 as mount }

/**
 * Patch native leaf properties on a specific layer; silently ignored if that layer has unmounted.
 */
export function patch_layer_native(layer_id: number, json: string): void;

/**
 * Remove one mounted layer without disturbing sibling layers on the shared canvas.
 */
export function remove_layer(layer_id: number): void;

/**
 * Scroll a keyed native node into view without rebuilding the tree.
 */
export function scroll_native_into_view(id: string): void;

/**
 * Replace one z-ordered layer's widget tree. Lower `z` draws first, higher `z` composites on top.
 */
export function set_layer_spec(layer_id: number, z: number, json: string, revision: number): void;

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
    readonly add_fonts: (a: number, b: number) => void;
    readonly blur_native: () => void;
    readonly focus_native: (a: number, b: number) => void;
    readonly frames_drawn: () => number;
    readonly mount: (a: number, b: number, c: number, d: number, e: any) => void;
    readonly patch_layer_native: (a: number, b: number, c: number) => void;
    readonly remove_layer: (a: number) => void;
    readonly scroll_native_into_view: (a: number, b: number) => void;
    readonly set_layer_spec: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly unmount: () => void;
    readonly values_changed: () => void;
    readonly values_len: () => number;
    readonly values_ptr: () => number;
    readonly __wasm_bindgen_func_elem_1969: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly __wasm_bindgen_func_elem_14269: (a: number, b: number, c: any, d: any) => void;
    readonly __wasm_bindgen_func_elem_14877: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_14877_26: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_14877_27: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_1967: (a: number, b: number, c: number, d: number) => void;
    readonly __wasm_bindgen_func_elem_22483: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_14266: (a: number, b: number, c: number) => void;
    readonly __wasm_bindgen_func_elem_14267: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_14267_16: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_14267_17: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_14267_18: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_14267_22: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_14267_23: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_14267_24: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_14267_25: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_14879: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_14879_21: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_14265: (a: number, b: number) => void;
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
