//! The wasm build of [`jg_shader::translate`] the engine's WebGPU backend links three's programs
//! with. No bindings generator: the host writes the two sources into memory from [`jg_alloc`],
//! calls [`jg_translate`], and reads a length-prefixed UTF-8 JSON result, then frees both.
//! The result is `{"ok": Translated}` or `{"error": "..."}`.

use std::alloc::{Layout, alloc, dealloc};

/// Allocate `len` bytes (at least 1) for the host to write into.
#[unsafe(no_mangle)]
pub extern "C" fn jg_alloc(len: usize) -> *mut u8 {
    unsafe { alloc(Layout::from_size_align(len.max(1), 8).unwrap()) }
}

/// Free memory from [`jg_alloc`] or a result from [`jg_translate`] (`len` as allocated).
#[unsafe(no_mangle)]
pub extern "C" fn jg_free(ptr: *mut u8, len: usize) {
    unsafe { dealloc(ptr, Layout::from_size_align(len.max(1), 8).unwrap()) }
}

fn text(ptr: *const u8, len: usize) -> String {
    String::from_utf8_lossy(unsafe { std::slice::from_raw_parts(ptr, len) }).into_owned()
}

/// Translate one program. Returns a pointer to a little-endian u32 byte length followed by that
/// many bytes of JSON; free it with `jg_free(ptr, 4 + length)`.
#[unsafe(no_mangle)]
pub extern "C" fn jg_translate(vert: *const u8, vert_len: usize, frag: *const u8, frag_len: usize) -> *mut u8 {
    let (v, f) = (text(vert, vert_len), text(frag, frag_len));
    let result = std::panic::catch_unwind(|| jg_shader::translate_with(&v, &f, false));
    let json = match result {
        Ok(Ok(t)) => serde_json::json!({ "ok": t }).to_string(),
        Ok(Err(e)) => serde_json::json!({ "error": e }).to_string(),
        Err(_) => serde_json::json!({ "error": "the translator panicked" }).to_string(),
    };
    let bytes = json.as_bytes();
    let out = jg_alloc(4 + bytes.len());
    unsafe {
        std::ptr::copy_nonoverlapping((bytes.len() as u32).to_le_bytes().as_ptr(), out, 4);
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), out.add(4), bytes.len());
    }
    out
}
