//! A JGengine scene recording, as written by `bun run perf native export <game>`.
//!
//! The recording is what three.js really drew while the game played the perf walk: every linked
//! program (GLSL), every draw of every pass with its GL state and uniform values, the render
//! targets and clears between them, buffer and texture contents as they changed, and canvas
//! readbacks of chosen frames as the reference image.

use serde::Deserialize;
use std::path::Path;

/// A byte range in `stream.bin` or `readbacks.bin`.
#[derive(Debug, Clone, Copy, Deserialize, Default)]
pub struct Range {
    pub offset: usize,
    pub bytes: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub blend: bool,
    pub blend_eq: [u32; 2],
    pub blend_func: [u32; 4],
    pub blend_color: [f32; 4],
    pub depth_test: bool,
    pub depth_func: u32,
    pub depth_mask: bool,
    pub color_mask: [bool; 4],
    pub cull: bool,
    pub cull_face: u32,
    pub front_face: u32,
    pub polygon_offset: Option<[f32; 2]>,
    pub stencil: Option<serde_json::Value>,
    pub alpha_to_coverage: bool,
    pub draw_buffers: Option<Vec<u32>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Geometry {
    pub id: usize,
    pub name: String,
    pub object: String,
    pub attributes: std::collections::BTreeMap<String, usize>,
    pub index: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attribute {
    pub id: usize,
    pub item_size: u32,
    pub count: u32,
    pub normalized: bool,
    /// The JS typed-array name of the data: `Float32Array`, `Uint16Array`, ...
    pub array: String,
    pub instanced: bool,
    pub mesh_per_attribute: u32,
    pub offset: usize,
    pub bytes: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Object {
    pub id: usize,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Mip {
    pub width: u32,
    pub height: u32,
    pub offset: usize,
    pub bytes: usize,
}

/// One face of one mip of a cube render target read back from the GPU (the PMREM environment),
/// RGBA Float32, rows bottom first like every GL readback.
#[derive(Debug, Clone, Deserialize)]
pub struct Face {
    pub level: u32,
    pub face: u32,
    pub size: u32,
    pub offset: usize,
    pub bytes: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Texture {
    pub handle: i64,
    pub name: Option<String>,
    pub kind: Option<String>,
    pub width: u32,
    pub height: u32,
    pub depth: Option<u32>,
    pub format: Option<serde_json::Value>,
    #[serde(rename = "type")]
    pub kind_type: Option<u32>,
    pub internal_format: Option<serde_json::Value>,
    pub color_space: Option<String>,
    pub wrap_s: Option<u32>,
    pub wrap_t: Option<u32>,
    pub wrap_r: Option<u32>,
    pub mag_filter: Option<u32>,
    pub min_filter: Option<u32>,
    pub anisotropy: Option<f32>,
    pub generate_mipmaps: Option<bool>,
    pub flip_y: Option<bool>,
    pub compare_function: Option<u32>,
    pub is_render_target: bool,
    pub is_depth: bool,
    pub is_cube: bool,
    pub is_3d: Option<bool>,
    pub is_array: Option<bool>,
    pub is_compressed: bool,
    pub mipmaps: Option<Vec<Mip>>,
    pub faces: Option<Vec<Face>>,
    pub source: Option<String>,
    pub array: Option<String>,
    pub offset: Option<usize>,
    pub bytes: Option<usize>,
    pub missing: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DataRef {
    pub frame: usize,
    pub offset: usize,
    pub bytes: usize,
    pub handle: Option<i64>,
    pub attribute: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Framebuffer {
    pub handle: i64,
    pub width: u32,
    pub height: u32,
    pub samples: u32,
    pub depth_buffer: Option<bool>,
    pub stencil_buffer: Option<bool>,
    pub multisampled: Option<bool>,
    pub textures: Vec<i64>,
    pub depth: i64,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProgramAttribute {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: u32,
    pub size: u32,
    pub location: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProgramUniform {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: u32,
    pub size: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Program {
    pub index: usize,
    pub name: String,
    pub cache_key: String,
    pub attributes: Vec<ProgramAttribute>,
    pub uniforms: Vec<ProgramUniform>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Readback {
    pub frame: usize,
    pub width: u32,
    pub height: u32,
    pub offset: usize,
    pub bytes: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Events {
    pub offset: usize,
    pub bytes: usize,
    pub rows: usize,
    pub row_lengths: Range,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub canvas: [u32; 2],
    pub frames: usize,
    pub frame_starts: Vec<usize>,
    pub times: Vec<f64>,
    pub events: Events,
    pub states: Vec<State>,
    pub geometries: Vec<Geometry>,
    pub attributes: Vec<Attribute>,
    pub objects: Vec<Object>,
    pub textures: Vec<Texture>,
    pub texture_data: Vec<DataRef>,
    #[serde(default)]
    pub buffer_data: Vec<DataRef>,
    pub framebuffers: Vec<Framebuffer>,
    pub programs: Vec<Program>,
    pub readbacks: Vec<Readback>,
}

/// One uniform value change carried by a draw: the program's leaf index and its new values
/// (numbers, or texture handles for a sampler).
#[derive(Debug, Clone)]
pub struct UniformDelta {
    pub leaf: usize,
    pub values: Vec<f32>,
}

#[derive(Debug, Clone, Copy)]
pub struct ViewScissor {
    pub viewport: [i32; 4],
    pub scissor: Option<[i32; 4]>,
}

#[derive(Debug, Clone)]
pub struct Draw {
    pub program: usize,
    pub state: usize,
    pub geometry: usize,
    pub mode: u32,
    pub start: u32,
    pub count: u32,
    pub instances: u32,
    pub indexed: bool,
    pub object: usize,
    /// The object's world matrix mirrors (negative determinant): three flips the front face.
    pub mirrored: bool,
    pub view: ViewScissor,
    pub deltas: Vec<UniformDelta>,
}

#[derive(Debug, Clone)]
pub enum Event {
    /// Bind a framebuffer by GL handle id; -1 is the canvas.
    Framebuffer(i64),
    Clear { mask: u32, color: [f32; 4], depth: f32, stencil: i32, color_mask_all: bool, depth_mask: bool, view: ViewScissor },
    Draw(Draw),
    /// A draw three issued outside `renderBufferDirect` (none expected).
    Foreign,
    Mipmap(i64),
    Blit { read: i64, draw: i64, src: [i32; 4], dst: [i32; 4], mask: u32, filter: u32 },
    CopyTexture { read: i64, texture: i64, level: u32, dst: [i32; 2], src: [i32; 4] },
    Buffer { attribute: usize, data: usize },
    TextureData { handle: i64, data: usize },
}

pub const GL_COLOR_BUFFER_BIT: u32 = 0x4000;
pub const GL_DEPTH_BUFFER_BIT: u32 = 0x0100;
pub const GL_STENCIL_BUFFER_BIT: u32 = 0x0400;

/// A loaded recording: the manifest, its binary data and every frame's decoded events.
pub struct Recording {
    pub manifest: Manifest,
    pub data: Vec<u8>,
    pub readbacks: Vec<u8>,
    /// `frames[i]` holds frame i's events in issue order.
    pub frames: Vec<Vec<Event>>,
    pub dir: std::path::PathBuf,
}

fn view_at(r: &[f32], i: usize) -> ViewScissor {
    let v = |k: usize| r[i + k] as i32;
    ViewScissor { viewport: [v(0), v(1), v(2), v(3)], scissor: if r[i + 4] != 0.0 { Some([v(5), v(6), v(7), v(8)]) } else { None } }
}

fn decode(row: &[f32]) -> Result<Event, String> {
    let op = row[0] as i32;
    let i = |k: usize| row[k] as i64;
    Ok(match op {
        1 => Event::Framebuffer(i(1)),
        2 => Event::Clear { mask: row[1] as u32, color: [row[2], row[3], row[4], row[5]], depth: row[6], stencil: row[7] as i32, color_mask_all: row[8] != 0.0, depth_mask: row[9] != 0.0, view: view_at(row, 10) },
        3 if row.len() == 2 => Event::Foreign,
        3 => {
            let n = row[20] as usize;
            let mut deltas = Vec::new();
            let mut k = 21;
            while k < 21 + n {
                let leaf = row[k] as usize;
                let len = row[k + 1] as usize;
                deltas.push(UniformDelta { leaf, values: row[k + 2..k + 2 + len].to_vec() });
                k += 2 + len;
            }
            Event::Draw(Draw {
                program: row[1] as usize,
                state: row[2] as usize,
                geometry: row[3] as usize,
                mode: row[4] as u32,
                start: row[5] as u32,
                count: row[6] as u32,
                instances: row[7] as u32,
                indexed: row[8] != 0.0,
                object: row[9] as usize,
                mirrored: row[10] != 0.0,
                view: view_at(row, 11),
                deltas,
            })
        }
        4 => Event::Mipmap(i(1)),
        5 => Event::Blit { read: i(1), draw: i(2), src: [i(3) as i32, i(4) as i32, i(5) as i32, i(6) as i32], dst: [i(7) as i32, i(8) as i32, i(9) as i32, i(10) as i32], mask: row[11] as u32, filter: row[12] as u32 },
        6 => Event::CopyTexture { read: i(1), texture: i(2), level: row[3] as u32, dst: [i(4) as i32, i(5) as i32], src: [i(6) as i32, i(7) as i32, i(8) as i32, i(9) as i32] },
        7 => Event::Buffer { attribute: row[1] as usize, data: row[2] as usize },
        8 => Event::TextureData { handle: i(1), data: row[2] as usize },
        other => return Err(format!("unknown event op {other}")),
    })
}

impl Recording {
    pub fn load(dir: &Path) -> Result<Recording, String> {
        let read = |name: &str| std::fs::read(dir.join(name)).map_err(|e| format!("{}: {e}", dir.join(name).display()));
        let manifest: Manifest = serde_json::from_slice(&read("stream.json")?).map_err(|e| format!("stream.json: {e}"))?;
        let data = read("stream.bin")?;
        let readbacks = read("readbacks.bin").unwrap_or_default();
        let lens: &[i32] = bytemuck::cast_slice(&data[manifest.events.row_lengths.offset..manifest.events.row_lengths.offset + manifest.events.row_lengths.bytes]);
        let flat: &[f32] = bytemuck::cast_slice(&data[manifest.events.offset..manifest.events.offset + manifest.events.bytes]);
        let mut rows = Vec::with_capacity(lens.len());
        let mut at = 0usize;
        for &n in lens {
            rows.push(decode(&flat[at..at + n as usize])?);
            at += n as usize;
        }
        let starts = &manifest.frame_starts;
        let mut frames = Vec::new();
        for f in 0..manifest.frames.min(starts.len().saturating_sub(1)) {
            frames.push(rows[starts[f]..starts[f + 1]].to_vec());
        }
        Ok(Recording { manifest, data, readbacks, frames, dir: dir.to_path_buf() })
    }

    pub fn bytes(&self, offset: usize, bytes: usize) -> &[u8] {
        &self.data[offset..offset + bytes]
    }

    pub fn program_source(&self, index: usize) -> Result<(String, String), String> {
        let read = |ext: &str| {
            let p = self.dir.join("programs").join(format!("{index:03}.{ext}"));
            std::fs::read_to_string(&p).map_err(|e| format!("{}: {e}", p.display()))
        };
        Ok((read("vert")?, read("frag")?))
    }

    /// The RGBA8 canvas pixels three produced for `frame`, bottom row first (GL order).
    pub fn readback(&self, frame: usize) -> Option<(&Readback, &[u8])> {
        let r = self.manifest.readbacks.iter().find(|r| r.frame == frame)?;
        Some((r, &self.readbacks[r.offset..r.offset + r.bytes]))
    }
}
