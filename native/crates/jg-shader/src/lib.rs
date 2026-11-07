//! Translate the GLSL ES 3.00 programs three.js linked into WGSL with the same behaviour, plus
//! the layout the renderer needs to feed them: vertex inputs by attribute name, the uniform
//! block's offsets by three's uniform names, and texture/sampler bindings.
//!
//! Steps: preprocess (macros out), rewrite to Vulkan-style GLSL 4.50 (loose uniforms into one
//! std140 block, combined samplers split into texture + sampler, explicit locations, bool and
//! scalar-array uniforms into host-shareable types, GL clip space into WebGPU's), then naga's GLSL
//! frontend, validation and WGSL backend.

pub mod preprocess;
mod rewrite;

use serde::{Deserialize, Serialize};

pub use rewrite::{SamplerKind, TextureDim};

/// One vertex input: a three attribute name, or one column of a matrix attribute.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VertexInput {
    pub name: String,
    /// Column of a matrix attribute (`instanceMatrix`), else 0.
    pub column: u32,
    pub location: u32,
    pub components: u32,
    /// `f` float, `i` signed int, `u` unsigned int.
    pub kind: char,
}

/// Where one of three's uniform names lives in the block.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UniformSlot {
    pub name: String,
    pub offset: u32,
    /// Scalar kind: `f`, `i`, `u`.
    pub kind: char,
    /// Columns x rows for a matrix; 1 x n for a vector or scalar.
    pub columns: u32,
    pub rows: u32,
    /// Bytes between matrix columns (16 in std140).
    pub column_stride: u32,
    /// Array element count (1 when not an array) and stride.
    pub count: u32,
    pub stride: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SamplerSlot {
    /// three's uniform name (`map`, `spotShadowMap`); arrays list one slot per element.
    pub name: String,
    pub element: u32,
    pub texture_binding: u32,
    pub sampler_binding: u32,
    pub kind: SamplerKind,
    pub dim: TextureDim,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgramLayout {
    pub vertex_inputs: Vec<VertexInput>,
    pub uniform_size: u32,
    pub uniforms: Vec<UniformSlot>,
    pub samplers: Vec<SamplerSlot>,
    pub fragment_outputs: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Translated {
    pub vertex_wgsl: String,
    pub fragment_wgsl: String,
    pub layout: ProgramLayout,
}

fn to_wgsl(src: &str, stage: naga::ShaderStage) -> Result<(naga::Module, String), String> {
    let mut fe = naga::front::glsl::Frontend::default();
    let module = fe.parse(&naga::front::glsl::Options::from(stage), src).map_err(|e| {
        let mut msg = String::new();
        for err in e.errors.iter().take(6) {
            let r = err.meta.to_range().unwrap_or(0..0);
            let at = src[..r.start.min(src.len())].lines().count();
            let snippet: String = src[r.start.min(src.len())..r.end.min(src.len())].chars().take(120).collect();
            msg.push_str(&format!("{stage:?} line {at}: {} `{snippet}`\n", err.kind));
        }
        msg
    })?;
    // Uniformity is relaxed in the WGSL with a diagnostic directive, as three's shaders sample in
    // branches; everything else validates in full.
    let flags = naga::valid::ValidationFlags::all() - naga::valid::ValidationFlags::CONTROL_FLOW_UNIFORMITY;
    let info = naga::valid::Validator::new(flags, naga::valid::Capabilities::all()).validate(&module).map_err(|e| format!("{stage:?} validation: {}", e.emit_to_string(src)))?;
    let wgsl = naga::back::wgsl::write_string(&module, &info, naga::back::wgsl::WriterFlags::empty()).map_err(|e| format!("{stage:?} wgsl: {e}"))?;
    Ok((module, format!("diagnostic(off, derivative_uniformity);\n{wgsl}")))
}

/// Translate one program. `vert`/`frag` are the sources exactly as three passed them to GL.
pub fn translate(vert: &str, frag: &str) -> Result<Translated, String> {
    // A GLSL ES 1.00 RawShaderMaterial: WebGL 2 compiles it as is; here it gets the prefix three
    // gives its GLSL 3 shaders, which is the same program in GLSL ES 3.00.
    let (vert, frag) = if vert.contains("#version 300 es") {
        (vert.to_string(), frag.to_string())
    } else {
        (
            format!("#define attribute in\n#define varying out\n#define texture2D texture\n{vert}"),
            format!("#define varying in\nlayout(location = 0) out highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n#define texture2D texture\n#define textureCube texture\n{frag}"),
        )
    };
    let v = preprocess::Preprocessor::new().run(&vert).map_err(|e| format!("vertex preprocess: {e}"))?;
    let f = preprocess::Preprocessor::new().run(&frag).map_err(|e| format!("fragment preprocess: {e}"))?;
    let out = rewrite::rewrite(&v, &f)?;
    let (vmod, vertex_wgsl) = to_wgsl(&out.vertex, naga::ShaderStage::Vertex).map_err(|e| format!("{e}\n--- rewritten vertex ---\n{}", numbered(&out.vertex, &e)))?;
    let (fmod, fragment_wgsl) = to_wgsl(&out.fragment, naga::ShaderStage::Fragment).map_err(|e| format!("{e}\n--- rewritten fragment ---\n{}", numbered(&out.fragment, &e)))?;
    let mut uniforms = Vec::new();
    let mut size = 16;
    for module in [&vmod, &fmod] {
        let (slots, s) = rewrite::uniform_slots(module, &out.renames);
        size = size.max(s);
        for slot in slots {
            if !uniforms.iter().any(|u: &UniformSlot| u.name == slot.name) {
                uniforms.push(slot);
            }
        }
    }
    Ok(Translated { vertex_wgsl, fragment_wgsl, layout: ProgramLayout { vertex_inputs: out.inputs, uniform_size: size.max(out.block_size_hint), uniforms, samplers: out.samplers, fragment_outputs: out.fragment_outputs } })
}

/// The lines around the first reported line number, numbered, for an error report.
fn numbered(src: &str, err: &str) -> String {
    let line = err.split("line ").nth(1).and_then(|s| s.split(':').next()).and_then(|s| s.trim().parse::<usize>().ok()).unwrap_or(1);
    src.lines().enumerate().skip(line.saturating_sub(8)).take(16).map(|(i, l)| format!("{:5} {l}\n", i + 1)).collect()
}
