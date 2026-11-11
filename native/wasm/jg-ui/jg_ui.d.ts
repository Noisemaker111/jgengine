/* tslint:disable */
/* eslint-disable */

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
 * Mount options: `{"fonts": ["/fonts/x.ttf", ...], "sans": "Family", "mono": "Family"}`.
 * Font files must be TrueType/OpenType (not WOFF); they are fetched relative to
 * the page while the GPU starts.
 */
declare function mount2(canvas_id: string, options_json: string): void;
export { mount2 as mount }

/**
 * Patch native leaf properties without replacing the tree or invalidating sibling memo entries.
 */
export function patch_native(json: string): void;

/**
 * Scroll a keyed native node into view without rebuilding the tree.
 */
export function scroll_native_into_view(id: string): void;

/**
 * Replace the whole widget tree. Rare: structure changes, not per-frame values.
 * Field edits for ids that survive are kept.
 */
export function set_spec(json: string, revision: number): void;

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
    readonly blur_native: () => void;
    readonly focus_native: (a: number, b: number) => void;
    readonly frames_drawn: () => number;
    readonly mount: (a: number, b: number, c: number, d: number) => void;
    readonly patch_native: (a: number, b: number) => void;
    readonly scroll_native_into_view: (a: number, b: number) => void;
    readonly set_spec: (a: number, b: number, c: number) => void;
    readonly unmount: () => void;
    readonly values_changed: () => void;
    readonly values_len: () => number;
    readonly values_ptr: () => number;
    readonly __wasm_bindgen_func_elem_13382: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_13382_22: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_13382_23: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_14862: (a: number, b: number, c: any, d: any) => void;
    readonly __wasm_bindgen_func_elem_16058: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_1638: (a: number, b: number, c: number, d: number) => void;
    readonly __wasm_bindgen_func_elem_14859: (a: number, b: number, c: number) => void;
    readonly __wasm_bindgen_func_elem_14860: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_14860_14: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_14860_15: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_14860_16: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_14860_18: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_14860_19: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_14860_20: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_14860_21: (a: number, b: number, c: any) => void;
    readonly __wasm_bindgen_func_elem_14858: (a: number, b: number) => void;
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
