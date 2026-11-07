//! Draw a recorded frame with wgpu: the same programs (translated), the same draws in the same
//! passes with the same state, uniforms and textures three used.
//!
//! Hot path rules: nothing allocates per draw once caches are warm. One uniform ring per frame,
//! written with one `write_buffer`; programs whose uniforms did not change since their last draw
//! in the frame reuse their slot. Pipelines and bind groups are created once and memoised by
//! small integer keys. Redundant pipeline, bind group and vertex buffer binds are skipped.

use crate::copy::Copier;
use crate::gl;
use crate::resources::{Binding, Resources, SamplerKey};
use jg_scene::{Draw, Event, Recording, GL_COLOR_BUFFER_BIT, GL_DEPTH_BUFFER_BIT};
use jg_shader::{ProgramLayout, SamplerKind, TextureDim, UniformSlot};
use std::collections::HashMap;
use std::num::NonZeroU64;
use std::sync::Arc;

const UNIFORM_ALIGN: usize = 256;
const RING_BYTES: u64 = 32 << 20;

/// What one of three's uniform leaves feeds.
enum Leaf {
    Uniform(UniformSlot),
    /// Sampler slots (indices into the layout's samplers), one per array element.
    Samplers(Vec<usize>),
    Unused,
}

struct Program {
    vertex: wgpu::ShaderModule,
    fragment: wgpu::ShaderModule,
    layout: ProgramLayout,
    leaves: Vec<Leaf>,
    /// The uniform block as GL holds it for this program: persists across draws and frames.
    block: Vec<u8>,
    /// Texture handle bound to each sampler slot.
    bound: Vec<i64>,
    block_dirty: bool,
    /// Ring offset of this frame's latest copy of the block.
    slot: Option<(u64, u32)>,
    bound_dirty: bool,
    bind_group: Option<(u32, wgpu::BindGroup)>,
    texsig: u32,
    uniform_size: u32,
}

struct Target {
    colors: Vec<(wgpu::TextureView, wgpu::TextureFormat)>,
    depth: Option<(wgpu::TextureView, wgpu::TextureFormat)>,
    size: [u32; 2],
    signature: u32,
}

#[derive(Clone, Copy, Default)]
struct PendingClear {
    color: Option<wgpu::Color>,
    depth: Option<f32>,
}

/// Counters for one replayed frame.
#[derive(Debug, Default, Clone, Copy)]
pub struct FrameStats {
    pub draws: u32,
    pub passes: u32,
    pub pipeline_binds: u32,
    pub uniform_bytes: u64,
    pub new_pipelines: u32,
    pub new_bind_groups: u32,
}

pub struct Replayer {
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
    pub rec: Recording,
    frames: Arc<Vec<Vec<Event>>>,
    res: Resources,
    programs: Vec<Program>,
    targets: HashMap<i64, Target>,
    /// three's canvas: GL's default framebuffer, RGBA8 + depth, rows bottom first.
    pub canvas: wgpu::Texture,
    target_signatures: Vec<(Vec<wgpu::TextureFormat>, Option<wgpu::TextureFormat>)>,
    texsigs: Vec<Vec<(Binding, wgpu::TextureViewDimension)>>,
    pipelines: Vec<wgpu::RenderPipeline>,
    pipeline_memo: HashMap<(u32, u32, u32, u32, u32), u32>,
    layouts: HashMap<(usize, u32), (wgpu::BindGroupLayout, wgpu::PipelineLayout)>,
    vertex_memo: HashMap<(u32, u32), Arc<VertexBinding>>,
    samplers: HashMap<(SamplerKey, u8), wgpu::Sampler>,
    bind_groups: HashMap<(usize, Vec<i64>), wgpu::BindGroup>,
    uniform_layout: wgpu::BindGroupLayout,
    ring: wgpu::Buffer,
    ring_groups: HashMap<u32, wgpu::BindGroup>,
    staging: Vec<u8>,
    dummies: HashMap<(Binding, wgpu::TextureViewDimension), (wgpu::Texture, wgpu::TextureView)>,
    copier: Copier,
    cur_fb: i64,
    frame_serial: u64,
    pub warnings: HashMap<String, u32>,
}

/// One vertex buffer slot of a (program, geometry) pair.
struct VertexSlot {
    /// Attribute id, or None for GL's default attribute value.
    attribute: Option<usize>,
    stride: u64,
    step: wgpu::VertexStepMode,
    attributes: Vec<wgpu::VertexAttribute>,
}

struct VertexBinding {
    slots: Vec<VertexSlot>,
    index: Option<(usize, wgpu::IndexFormat)>,
}

fn texture_dim(d: TextureDim) -> wgpu::TextureViewDimension {
    match d {
        TextureDim::D2 => wgpu::TextureViewDimension::D2,
        TextureDim::Cube => wgpu::TextureViewDimension::Cube,
        TextureDim::D3 => wgpu::TextureViewDimension::D3,
        TextureDim::D2Array => wgpu::TextureViewDimension::D2Array,
    }
}

/// GL sampler uniform types.
fn is_sampler_type(t: u32) -> bool {
    matches!(t, 0x8B5E..=0x8B62 | 0x8DC1 | 0x8DC4 | 0x8DC5 | 0x8DCA..=0x8DCF | 0x8DD2..=0x8DD7)
}

impl Replayer {
    pub fn new(device: wgpu::Device, queue: wgpu::Queue, mut rec: Recording) -> Result<Replayer, String> {
        let float32_filterable = device.features().contains(wgpu::Features::FLOAT32_FILTERABLE);
        let res = Resources::load(&device, &queue, &rec, float32_filterable)?;
        // Translate every program (in parallel: naga is single-threaded per module).
        let sources: Vec<(String, String)> = (0..rec.manifest.programs.len()).map(|i| rec.program_source(rec.manifest.programs[i].index)).collect::<Result<_, _>>()?;
        #[cfg(not(target_arch = "wasm32"))]
        let translated: Vec<Result<jg_shader::Translated, String>> = std::thread::scope(|s| {
            let handles: Vec<_> = sources.iter().map(|(v, f)| s.spawn(move || jg_shader::translate(v, f))).collect();
            handles.into_iter().map(|h| h.join().unwrap_or_else(|_| Err("translator panicked".into()))).collect()
        });
        // The browser has no threads here: translate in turn.
        #[cfg(target_arch = "wasm32")]
        let translated: Vec<Result<jg_shader::Translated, String>> = sources.iter().map(|(v, f)| jg_shader::translate(v, f)).collect();
        let mut programs = Vec::new();
        for (i, t) in translated.into_iter().enumerate() {
            let p = &rec.manifest.programs[i];
            let t = t.map_err(|e| format!("program {} ({}): {e}", p.index, p.name))?;
            let module = |src: &str, stage: &str| device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some(&format!("{} {stage}", p.index)), source: wgpu::ShaderSource::Wgsl(src.into()) });
            let leaves = p
                .uniforms
                .iter()
                .map(|u| {
                    if is_sampler_type(u.kind) {
                        let mut slots: Vec<(u32, usize)> = t.layout.samplers.iter().enumerate().filter(|(_, s)| s.name == u.name).map(|(k, s)| (s.element, k)).collect();
                        slots.sort();
                        if slots.is_empty() { Leaf::Unused } else { Leaf::Samplers(slots.into_iter().map(|(_, k)| k).collect()) }
                    } else {
                        match t.layout.uniforms.iter().find(|s| s.name == u.name) {
                            Some(s) => Leaf::Uniform(s.clone()),
                            None => Leaf::Unused,
                        }
                    }
                })
                .collect();
            let uniform_size = t.layout.uniform_size.max(16).next_multiple_of(16);
            programs.push(Program {
                vertex: module(&t.vertex_wgsl, "vertex"),
                fragment: module(&t.fragment_wgsl, "fragment"),
                bound: vec![-1; t.layout.samplers.len()],
                block: vec![0; uniform_size as usize],
                layout: t.layout,
                leaves,
                block_dirty: true,
                slot: None,
                bound_dirty: true,
                bind_group: None,
                texsig: u32::MAX,
                uniform_size,
            });
        }
        let [w, h] = rec.manifest.canvas;
        let canvas = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("canvas"),
            size: wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let uniform_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("uniforms"),
            entries: &[wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::VERTEX_FRAGMENT, ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: true, min_binding_size: None }, count: None }],
        });
        let ring = device.create_buffer(&wgpu::BufferDescriptor { label: Some("uniform ring"), size: RING_BYTES, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
        let frames = Arc::new(std::mem::take(&mut rec.frames));
        let copier = Copier::new(&device);
        let mut me = Replayer {
            device,
            queue,
            rec,
            frames,
            res,
            programs,
            targets: HashMap::new(),
            canvas,
            target_signatures: Vec::new(),
            texsigs: Vec::new(),
            pipelines: Vec::new(),
            pipeline_memo: HashMap::new(),
            layouts: HashMap::new(),
            vertex_memo: HashMap::new(),
            samplers: HashMap::new(),
            bind_groups: HashMap::new(),
            uniform_layout,
            ring,
            ring_groups: HashMap::new(),
            staging: Vec::with_capacity(4 << 20),
            dummies: HashMap::new(),
            copier,
            cur_fb: -1,
            frame_serial: 0,
            warnings: HashMap::new(),
        };
        me.build_targets()?;
        Ok(me)
    }

    pub fn frame_count(&self) -> usize {
        self.frames.len()
    }

    fn warn(&mut self, what: String) {
        *self.warnings.entry(what).or_insert(0) += 1;
    }

    fn signature(&mut self, colors: Vec<wgpu::TextureFormat>, depth: Option<wgpu::TextureFormat>) -> u32 {
        let key = (colors, depth);
        if let Some(i) = self.target_signatures.iter().position(|s| *s == key) {
            return i as u32;
        }
        self.target_signatures.push(key);
        (self.target_signatures.len() - 1) as u32
    }

    fn build_targets(&mut self) -> Result<(), String> {
        let [w, h] = self.rec.manifest.canvas;
        let depth = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("canvas depth"),
            size: wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth24Plus,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let sig = self.signature(vec![wgpu::TextureFormat::Rgba8Unorm], Some(wgpu::TextureFormat::Depth24Plus));
        self.targets.insert(-1, Target { colors: vec![(self.canvas.create_view(&Default::default()), wgpu::TextureFormat::Rgba8Unorm)], depth: Some((depth.create_view(&Default::default()), wgpu::TextureFormat::Depth24Plus)), size: [w, h], signature: sig });
        for fb in self.rec.manifest.framebuffers.clone() {
            if fb.multisampled == Some(true) || self.targets.contains_key(&fb.handle) {
                continue;
            }
            let mut colors = Vec::new();
            for t in &fb.textures {
                let tex = self.res.textures.get(t).ok_or(format!("framebuffer {} uses unknown texture {t}", fb.handle))?;
                let view = tex.texture.create_view(&wgpu::TextureViewDescriptor { base_mip_level: 0, mip_level_count: Some(1), dimension: Some(wgpu::TextureViewDimension::D2), base_array_layer: 0, array_layer_count: Some(1), ..Default::default() });
                colors.push((view, tex.format));
            }
            let depth = if fb.depth >= 0 {
                let tex = self.res.textures.get(&fb.depth).ok_or(format!("framebuffer {} uses unknown depth texture {}", fb.handle, fb.depth))?;
                Some((tex.texture.create_view(&wgpu::TextureViewDescriptor { mip_level_count: Some(1), dimension: Some(wgpu::TextureViewDimension::D2), array_layer_count: Some(1), ..Default::default() }), tex.format))
            } else if fb.depth_buffer.unwrap_or(false) {
                let format = if fb.stencil_buffer.unwrap_or(false) { wgpu::TextureFormat::Depth24PlusStencil8 } else { wgpu::TextureFormat::Depth24Plus };
                let t = self.device.create_texture(&wgpu::TextureDescriptor {
                    label: Some("renderbuffer depth"),
                    size: wgpu::Extent3d { width: fb.width, height: fb.height, depth_or_array_layers: 1 },
                    mip_level_count: 1,
                    sample_count: 1,
                    dimension: wgpu::TextureDimension::D2,
                    format,
                    usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                    view_formats: &[],
                });
                Some((t.create_view(&Default::default()), format))
            } else {
                None
            };
            let sig = self.signature(colors.iter().map(|c| c.1).collect(), depth.as_ref().map(|d| d.1));
            self.targets.insert(fb.handle, Target { colors, depth, size: [fb.width, fb.height], signature: sig });
        }
        Ok(())
    }

    fn dummy(&mut self, binding: Binding, dim: wgpu::TextureViewDimension) -> wgpu::TextureView {
        let device = &self.device;
        self.dummies
            .entry((binding, dim))
            .or_insert_with(|| {
                let format = match binding {
                    Binding::Depth => wgpu::TextureFormat::Depth32Float,
                    Binding::Uint => wgpu::TextureFormat::R32Uint,
                    Binding::Sint => wgpu::TextureFormat::R32Sint,
                    Binding::Unfilterable => wgpu::TextureFormat::R32Float,
                    Binding::Filterable => wgpu::TextureFormat::Rgba8Unorm,
                };
                let layers = if dim == wgpu::TextureViewDimension::Cube { 6 } else { 1 };
                let t = device.create_texture(&wgpu::TextureDescriptor {
                    label: Some("unbound texture"),
                    size: wgpu::Extent3d { width: 1, height: 1, depth_or_array_layers: layers },
                    mip_level_count: 1,
                    sample_count: 1,
                    dimension: if dim == wgpu::TextureViewDimension::D3 { wgpu::TextureDimension::D3 } else { wgpu::TextureDimension::D2 },
                    format,
                    usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                    view_formats: &[],
                });
                if format == wgpu::TextureFormat::Rgba8Unorm {
                    for layer in 0..layers {
                        self.queue.write_texture(
                            wgpu::TexelCopyTextureInfo { texture: &t, mip_level: 0, origin: wgpu::Origin3d { x: 0, y: 0, z: layer }, aspect: wgpu::TextureAspect::All },
                            &[0, 0, 0, 255],
                            wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(4), rows_per_image: Some(1) },
                            wgpu::Extent3d { width: 1, height: 1, depth_or_array_layers: 1 },
                        );
                    }
                }
                let v = t.create_view(&wgpu::TextureViewDescriptor { dimension: Some(dim), ..Default::default() });
                (t, v)
            })
            .1
            .clone()
    }

    /// The binding kind a sampler slot needs given the texture bound to it.
    fn slot_binding(&self, kind: SamplerKind, handle: i64) -> Binding {
        match kind {
            SamplerKind::Depth => Binding::Depth,
            SamplerKind::Uint => Binding::Uint,
            SamplerKind::Sint => Binding::Sint,
            SamplerKind::Float => match self.res.textures.get(&handle).map(|t| t.binding) {
                Some(Binding::Depth) | Some(Binding::Unfilterable) => Binding::Unfilterable,
                _ => Binding::Filterable,
            },
        }
    }

    fn texsig_of(&mut self, p: usize) -> u32 {
        let prog = &self.programs[p];
        let sig: Vec<(Binding, wgpu::TextureViewDimension)> = prog.layout.samplers.iter().zip(&prog.bound).map(|(s, h)| (self.slot_binding(s.kind, *h), texture_dim(s.dim))).collect();
        if let Some(i) = self.texsigs.iter().position(|s| *s == sig) {
            return i as u32;
        }
        self.texsigs.push(sig);
        (self.texsigs.len() - 1) as u32
    }

    fn layouts_for(&mut self, p: usize, texsig: u32) -> (wgpu::BindGroupLayout, wgpu::PipelineLayout) {
        if let Some(l) = self.layouts.get(&(p, texsig)) {
            return l.clone();
        }
        let prog = &self.programs[p];
        let sig = &self.texsigs[texsig as usize];
        let mut entries = Vec::new();
        for (s, (binding, dim)) in prog.layout.samplers.iter().zip(sig) {
            let (sample_type, sampler) = match binding {
                Binding::Filterable => (wgpu::TextureSampleType::Float { filterable: true }, wgpu::SamplerBindingType::Filtering),
                Binding::Unfilterable => (wgpu::TextureSampleType::Float { filterable: false }, wgpu::SamplerBindingType::NonFiltering),
                Binding::Depth => (wgpu::TextureSampleType::Depth, wgpu::SamplerBindingType::Comparison),
                Binding::Uint => (wgpu::TextureSampleType::Uint, wgpu::SamplerBindingType::NonFiltering),
                Binding::Sint => (wgpu::TextureSampleType::Sint, wgpu::SamplerBindingType::NonFiltering),
            };
            entries.push(wgpu::BindGroupLayoutEntry { binding: s.texture_binding, visibility: wgpu::ShaderStages::VERTEX_FRAGMENT, ty: wgpu::BindingType::Texture { sample_type, view_dimension: *dim, multisampled: false }, count: None });
            entries.push(wgpu::BindGroupLayoutEntry { binding: s.sampler_binding, visibility: wgpu::ShaderStages::VERTEX_FRAGMENT, ty: wgpu::BindingType::Sampler(sampler), count: None });
        }
        let bgl = self.device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: None, entries: &entries });
        let pl = self.device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: None, bind_group_layouts: &[Some(&self.uniform_layout), Some(&bgl)], immediate_size: 0 });
        self.layouts.insert((p, texsig), (bgl.clone(), pl.clone()));
        (bgl, pl)
    }

    fn vertex_binding(&mut self, p: usize, g: usize) -> Result<Arc<VertexBinding>, String> {
        if let Some(v) = self.vertex_memo.get(&(p as u32, g as u32)) {
            return Ok(v.clone());
        }
        let geom = &self.rec.manifest.geometries[g];
        let prog = &self.programs[p];
        let mut slots: Vec<VertexSlot> = Vec::new();
        for input in &prog.layout.vertex_inputs {
            match geom.attributes.get(&input.name) {
                Some(&a) => {
                    let attr = &self.rec.manifest.attributes[a];
                    let el = gl::element_bytes(&attr.array);
                    let format = gl::vertex_format(&attr.array, input.components, attr.normalized, input.kind)?;
                    let stride = attr.item_size as u64 * el;
                    let offset = input.column as u64 * input.components as u64 * el;
                    let step = if attr.instanced { wgpu::VertexStepMode::Instance } else { wgpu::VertexStepMode::Vertex };
                    let va = wgpu::VertexAttribute { format, offset, shader_location: input.location };
                    match slots.iter_mut().find(|s| s.attribute == Some(a)) {
                        Some(s) => s.attributes.push(va),
                        None => slots.push(VertexSlot { attribute: Some(a), stride, step, attributes: vec![va] }),
                    }
                }
                None => {
                    let format = match (input.components, input.kind) {
                        (1, 'f') => wgpu::VertexFormat::Float32,
                        (2, 'f') => wgpu::VertexFormat::Float32x2,
                        (3, 'f') => wgpu::VertexFormat::Float32x3,
                        (4, 'f') => wgpu::VertexFormat::Float32x4,
                        (n, k) => return Err(format!("missing {k}x{n} attribute {} has no default", input.name)),
                    };
                    // Missing inputs share default slots, four to a slot, each at its own 16-byte copy.
                    match slots.iter_mut().find(|s| s.attribute.is_none() && s.attributes.len() < 4) {
                        Some(s) => {
                            let offset = s.attributes.len() as u64 * 16;
                            s.attributes.push(wgpu::VertexAttribute { format, offset, shader_location: input.location });
                        }
                        None => slots.push(VertexSlot { attribute: None, stride: 0, step: wgpu::VertexStepMode::Vertex, attributes: vec![wgpu::VertexAttribute { format, offset: 0, shader_location: input.location }] }),
                    }
                }
            }
        }
        let index = if geom.index >= 0 {
            let a = geom.index as usize;
            let format = match self.rec.manifest.attributes[a].array.as_str() {
                "Uint32Array" => wgpu::IndexFormat::Uint32,
                "Uint16Array" => wgpu::IndexFormat::Uint16,
                other => return Err(format!("index array {other}")),
            };
            Some((a, format))
        } else {
            None
        };
        let limit = self.device.limits().max_vertex_buffers;
        if slots.len() as u32 > limit {
            return Err(format!("program {p} with geometry {g} needs {} vertex buffers; this device allows {limit}", slots.len()));
        }
        let v = Arc::new(VertexBinding { slots, index });
        self.vertex_memo.insert((p as u32, g as u32), v.clone());
        Ok(v)
    }

    fn pipeline(&mut self, d: &Draw, fb_sig: u32, texsig: u32) -> Result<u32, String> {
        let key = (d.program as u32, d.state as u32, d.geometry as u32, fb_sig, texsig);
        if let Some(&p) = self.pipeline_memo.get(&key) {
            return Ok(p);
        }
        let vb = self.vertex_binding(d.program, d.geometry)?;
        let (_, layout) = self.layouts_for(d.program, texsig);
        let state = self.rec.manifest.states[d.state].clone();
        let (colors, depth) = self.target_signatures[fb_sig as usize].clone();
        let prog = &self.programs[d.program];
        let buffers: Vec<Option<wgpu::VertexBufferLayout>> = vb.slots.iter().map(|s| Some(wgpu::VertexBufferLayout { array_stride: s.stride, step_mode: s.step, attributes: &s.attributes })).collect();
        let blend = gl::blend_state(&state);
        let write_mask = gl::write_mask(&state);
        let targets: Vec<Option<wgpu::ColorTargetState>> = colors
            .iter()
            .enumerate()
            .map(|(i, f)| if (i as u32) < prog.layout.fragment_outputs { Some(wgpu::ColorTargetState { format: *f, blend: if f.has_depth_aspect() { None } else { blend }, write_mask }) } else { None })
            .collect();
        let pipeline = self.device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some(&format!("program {} state {}", d.program, d.state)),
            layout: Some(&layout),
            vertex: wgpu::VertexState { module: &prog.vertex, entry_point: Some("main"), compilation_options: Default::default(), buffers: &buffers },
            primitive: gl::primitive(&state),
            depth_stencil: depth.map(|f| gl::depth_state(&state, f)),
            multisample: wgpu::MultisampleState::default(),
            fragment: Some(wgpu::FragmentState { module: &prog.fragment, entry_point: Some("main"), compilation_options: Default::default(), targets: &targets }),
            multiview_mask: None,
            cache: None,
        });
        self.pipelines.push(pipeline);
        let id = (self.pipelines.len() - 1) as u32;
        self.pipeline_memo.insert(key, id);
        Ok(id)
    }

    fn sampler(&mut self, key: SamplerKey, binding: Binding) -> wgpu::Sampler {
        let mode = match binding {
            Binding::Depth => 2u8,
            Binding::Filterable => 0,
            _ => 1,
        };
        let device = &self.device;
        self.samplers
            .entry((key, mode))
            .or_insert_with(|| {
                let mut k = key;
                if mode == 1 {
                    k.mag = 0;
                    k.min = 0;
                    k.mip = 0;
                    k.anisotropy = 1;
                }
                if mode == 2 && k.compare == 0 {
                    k.compare = 4; // LessEqual, three's default for shadow maps
                }
                k.create(device, mode == 2)
            })
            .clone()
    }

    fn bind_group(&mut self, p: usize) -> wgpu::BindGroup {
        if !self.programs[p].bound_dirty
            && let Some((_, g)) = &self.programs[p].bind_group
        {
            return g.clone();
        }
        let texsig = self.texsig_of(p);
        self.programs[p].texsig = texsig;
        let key = (p, self.programs[p].bound.clone());
        let group = match self.bind_groups.get(&key) {
            Some(g) => g.clone(),
            None => {
                let (bgl, _) = self.layouts_for(p, texsig);
                let sig = self.texsigs[texsig as usize].clone();
                let mut views = Vec::new();
                let mut samplers = Vec::new();
                for (k, (binding, dim)) in sig.iter().enumerate() {
                    let h = self.programs[p].bound[k];
                    let (view, skey) = match self.res.textures.get(&h) {
                        Some(t) if t.dim == *dim && (t.binding == *binding || (*binding == Binding::Unfilterable && matches!(t.binding, Binding::Depth | Binding::Unfilterable))) => (t.view.clone(), t.sampler),
                        Some(_) => {
                            self.warn(format!("program {p}: texture {h} does not fit slot {k} ({binding:?} {dim:?})"));
                            (self.dummy(*binding, *dim), SamplerKey { wrap: [0; 3], mag: 0, min: 0, mip: 0, anisotropy: 1, compare: 0 })
                        }
                        None => (self.dummy(*binding, *dim), SamplerKey { wrap: [0; 3], mag: 0, min: 0, mip: 0, anisotropy: 1, compare: 0 }),
                    };
                    views.push(view);
                    samplers.push(self.sampler(skey, *binding));
                }
                let slots = self.programs[p].layout.samplers.clone();
                let mut entries = Vec::new();
                for (k, s) in slots.iter().enumerate() {
                    entries.push(wgpu::BindGroupEntry { binding: s.texture_binding, resource: wgpu::BindingResource::TextureView(&views[k]) });
                    entries.push(wgpu::BindGroupEntry { binding: s.sampler_binding, resource: wgpu::BindingResource::Sampler(&samplers[k]) });
                }
                let g = self.device.create_bind_group(&wgpu::BindGroupDescriptor { label: None, layout: &bgl, entries: &entries });
                self.bind_groups.insert(key, g.clone());
                g
            }
        };
        let prog = &mut self.programs[p];
        prog.bind_group = Some((texsig, group.clone()));
        prog.bound_dirty = false;
        group
    }

    fn ring_group(&mut self, size: u32) -> wgpu::BindGroup {
        let device = &self.device;
        let layout = &self.uniform_layout;
        let ring = &self.ring;
        self.ring_groups
            .entry(size)
            .or_insert_with(|| {
                device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: None,
                    layout,
                    entries: &[wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding { buffer: ring, offset: 0, size: NonZeroU64::new(size as u64) }) }],
                })
            })
            .clone()
    }

    fn apply_deltas(&mut self, d: &Draw) {
        let prog = &mut self.programs[d.program];
        for delta in &d.deltas {
            match prog.leaves.get(delta.leaf) {
                Some(Leaf::Uniform(s)) => {
                    let per = (s.columns * s.rows) as usize;
                    if per == 0 {
                        continue;
                    }
                    let n = (delta.values.len() / per).min(s.count as usize);
                    for e in 0..n {
                        for c in 0..s.columns as usize {
                            let at = s.offset as usize + e * s.stride as usize + c * s.column_stride as usize;
                            let src = &delta.values[e * per + c * s.rows as usize..e * per + (c + 1) * s.rows as usize];
                            let dst = &mut prog.block[at..at + 4 * s.rows as usize];
                            match s.kind {
                                'f' => dst.copy_from_slice(bytemuck::cast_slice(src)),
                                _ => {
                                    for (k, v) in src.iter().enumerate() {
                                        dst[k * 4..k * 4 + 4].copy_from_slice(&(*v as i32).to_le_bytes());
                                    }
                                }
                            }
                        }
                    }
                    prog.block_dirty = true;
                }
                Some(Leaf::Samplers(slots)) => {
                    for (k, slot) in slots.iter().enumerate() {
                        if let Some(v) = delta.values.get(k) {
                            let h = *v as i64;
                            if prog.bound[*slot] != h {
                                prog.bound[*slot] = h;
                                prog.bound_dirty = true;
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }

    /// Record one frame's passes into `encoder`. Uniforms reach the GPU in `finish_frame`, which
    /// must run before the encoder is submitted.
    pub fn frame(&mut self, encoder: &mut wgpu::CommandEncoder, index: usize) -> Result<FrameStats, String> {
        self.frame_serial += 1;
        self.staging.clear();
        for p in &mut self.programs {
            p.slot = None;
        }
        if !self.res.needs_mips.is_empty() {
            for h in std::mem::take(&mut self.res.needs_mips) {
                let tex = self.res.textures[&h].texture.clone();
                self.copier.mipmaps(&self.device, encoder, &tex);
            }
        }
        let frames = self.frames.clone();
        let events = &frames[index];
        let mut stats = FrameStats::default();
        let mut pass: Option<wgpu::RenderPass<'static>> = None;
        let mut pending: HashMap<i64, PendingClear> = HashMap::new();
        // What the open pass has bound, to skip redundant binds.
        let mut bound_pipeline = u32::MAX;
        let mut bound_group: Option<wgpu::BindGroup> = None;
        let mut bound_uniform = (u32::MAX, u64::MAX);
        let mut bound_vertex: Vec<Option<usize>> = Vec::new();
        let mut bound_index: Option<usize> = None;
        let mut bound_view = [i32::MIN; 4];
        let mut bound_scissor = [i32::MIN; 4];
        let mut blend_constant: Option<[f32; 4]> = None;
        for ev in events.iter() {
            match ev {
                Event::Framebuffer(h) => {
                    if *h != self.cur_fb {
                        pass = None;
                        if !self.targets.contains_key(h) {
                            self.warn(format!("bind of unknown framebuffer {h}"));
                        }
                        self.cur_fb = *h;
                    }
                }
                Event::Clear { mask, color, depth, depth_mask, color_mask_all, view, .. } => {
                    pass = None;
                    if view.scissor.is_some_and(|s| self.targets.get(&self.cur_fb).is_some_and(|t| s[0] > 0 || s[1] > 0 || (s[2] as u32) < t.size[0] || (s[3] as u32) < t.size[1])) {
                        self.warn("scissored clear drawn as a full clear".into());
                    }
                    let e = pending.entry(self.cur_fb).or_default();
                    if mask & GL_COLOR_BUFFER_BIT != 0 {
                        if !color_mask_all {
                            self.warnings.entry("clear under a partial colour mask".into()).and_modify(|n| *n += 1).or_insert(1);
                        }
                        e.color = Some(wgpu::Color { r: color[0] as f64, g: color[1] as f64, b: color[2] as f64, a: color[3] as f64 });
                    }
                    if mask & GL_DEPTH_BUFFER_BIT != 0 && *depth_mask {
                        e.depth = Some(*depth);
                    }
                }
                Event::Draw(d) => {
                    if pass.is_none() {
                        let clear = pending.remove(&self.cur_fb).unwrap_or_default();
                        pass = Some(self.begin(encoder, self.cur_fb, clear)?);
                        stats.passes += 1;
                        bound_pipeline = u32::MAX;
                        bound_group = None;
                        bound_uniform = (u32::MAX, u64::MAX);
                        bound_vertex.clear();
                        bound_index = None;
                        bound_view = [i32::MIN; 4];
                        bound_scissor = [i32::MIN; 4];
                        blend_constant = None;
                    }
                    let rp = pass.as_mut().unwrap();
                    self.apply_deltas(d);
                    let p = d.program;
                    // Uniforms: one aligned copy per change.
                    let size = self.programs[p].uniform_size;
                    if self.programs[p].block_dirty || self.programs[p].slot.is_none() {
                        let at = self.staging.len().next_multiple_of(UNIFORM_ALIGN);
                        self.staging.resize(at, 0);
                        self.staging.extend_from_slice(&self.programs[p].block);
                        self.programs[p].slot = Some((at as u64, size));
                        self.programs[p].block_dirty = false;
                    }
                    let (offset, size) = self.programs[p].slot.unwrap();
                    let group = self.bind_group(p);
                    let texsig = self.programs[p].texsig;
                    let fb_sig = self.targets.get(&self.cur_fb).map(|t| t.signature).ok_or(format!("draw into unknown framebuffer {}", self.cur_fb))?;
                    let pipe = self.pipeline(d, fb_sig, texsig)?;
                    if pipe != bound_pipeline {
                        rp.set_pipeline(&self.pipelines[pipe as usize]);
                        bound_pipeline = pipe;
                        stats.pipeline_binds += 1;
                    }
                    if bound_uniform != (size, offset) {
                        let rg = self.ring_group(size);
                        rp.set_bind_group(0, &rg, &[offset as u32]);
                        bound_uniform = (size, offset);
                    }
                    if bound_group.as_ref() != Some(&group) {
                        rp.set_bind_group(1, &group, &[]);
                        bound_group = Some(group);
                    }
                    let vb = self.vertex_binding(d.program, d.geometry)?;
                    if bound_vertex.len() < vb.slots.len() {
                        bound_vertex.resize(vb.slots.len(), None);
                    }
                    for (i, s) in vb.slots.iter().enumerate() {
                        let key = s.attribute.unwrap_or(usize::MAX);
                        if bound_vertex[i] != Some(key) {
                            match s.attribute.and_then(|a| self.res.buffers[a].as_ref()) {
                                Some(b) => rp.set_vertex_buffer(i as u32, b.slice(..)),
                                None => rp.set_vertex_buffer(i as u32, self.res.default_attribute.slice(..)),
                            }
                            bound_vertex[i] = Some(key);
                        }
                    }
                    let tsize = self.targets[&self.cur_fb].size;
                    let v = d.view.viewport;
                    if v != bound_view {
                        let x = v[0].max(0) as f32;
                        let y = v[1].max(0) as f32;
                        let w = (v[2] as f32).min(tsize[0] as f32 - x).max(1.0);
                        let h = (v[3] as f32).min(tsize[1] as f32 - y).max(1.0);
                        rp.set_viewport(x, y, w, h, 0.0, 1.0);
                        bound_view = v;
                    }
                    let sc = d.view.scissor.unwrap_or([0, 0, tsize[0] as i32, tsize[1] as i32]);
                    if sc != bound_scissor {
                        let x = (sc[0].max(0) as u32).min(tsize[0]);
                        let y = (sc[1].max(0) as u32).min(tsize[1]);
                        rp.set_scissor_rect(x, y, (sc[2].max(0) as u32).min(tsize[0] - x), (sc[3].max(0) as u32).min(tsize[1] - y));
                        bound_scissor = sc;
                    }
                    let state = &self.rec.manifest.states[d.state];
                    if gl::uses_constant(state) && blend_constant != Some(state.blend_color) {
                        let c = state.blend_color;
                        rp.set_blend_constant(wgpu::Color { r: c[0] as f64, g: c[1] as f64, b: c[2] as f64, a: c[3] as f64 });
                        blend_constant = Some(c);
                    }
                    let instances = d.instances.max(1);
                    match vb.index {
                        Some((a, format)) => {
                            if bound_index != Some(a) {
                                let b = self.res.buffers[a].as_ref().ok_or("empty index buffer")?;
                                rp.set_index_buffer(b.slice(..), format);
                                bound_index = Some(a);
                            }
                            rp.draw_indexed(d.start..d.start + d.count, 0, 0..instances);
                        }
                        None => rp.draw(d.start..d.start + d.count, 0..instances),
                    }
                    stats.draws += 1;
                }
                Event::Buffer { attribute, data } => {
                    let r = &self.rec.manifest.buffer_data[*data];
                    let bytes = &self.rec.data[r.offset..r.offset + r.bytes];
                    let size = (r.bytes as u64).next_multiple_of(4);
                    if size > self.res.buffer_sizes[*attribute] {
                        pass = None;
                        let b = self.device.create_buffer(&wgpu::BufferDescriptor { label: None, size, usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
                        self.res.buffers[*attribute] = Some(b);
                        self.res.buffer_sizes[*attribute] = size;
                    }
                    if let Some(b) = &self.res.buffers[*attribute] {
                        if r.bytes % 4 == 0 {
                            self.queue.write_buffer(b, 0, bytes);
                        } else {
                            let mut padded = bytes.to_vec();
                            padded.resize(size as usize, 0);
                            self.queue.write_buffer(b, 0, &padded);
                        }
                    }
                }
                Event::TextureData { handle, data } => {
                    let r = self.rec.manifest.texture_data[*data].clone();
                    if let Some(t) = self.res.textures.get(handle) {
                        let (bw, _) = t.format.block_dimensions();
                        let row = t.size[0].div_ceil(bw) * t.format.block_copy_size(None).unwrap_or(4);
                        let layers = t.texture.depth_or_array_layers();
                        self.queue.write_texture(
                            wgpu::TexelCopyTextureInfo { texture: &t.texture, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
                            &self.rec.data[r.offset..r.offset + r.bytes],
                            wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(row), rows_per_image: Some(t.size[1]) },
                            wgpu::Extent3d { width: t.size[0], height: t.size[1], depth_or_array_layers: layers },
                        );
                    }
                }
                Event::Mipmap(h) => {
                    pass = None;
                    if let Some(t) = self.res.textures.get(h) {
                        let tex = t.texture.clone();
                        self.copier.mipmaps(&self.device, encoder, &tex);
                    }
                }
                Event::Foreign => self.warn("draw outside three's renderer".into()),
                Event::Blit { .. } => self.warn("blitFramebuffer not replayed".into()),
                Event::CopyTexture { .. } => self.warn("copyTexSubImage2D not replayed".into()),
            }
        }
        drop(pass);
        // Clears no draw consumed still happen (a target cleared and then only sampled).
        for (fb, clear) in pending {
            if clear.color.is_some() || clear.depth.is_some() {
                drop(self.begin(encoder, fb, clear)?);
                stats.passes += 1;
            }
        }
        stats.uniform_bytes = self.staging.len() as u64;
        Ok(stats)
    }

    /// Apply a frame's state changes (uniform values, buffer and texture uploads) without drawing it:
    /// what a real-time player does with recorded frames it fell behind on, so the next drawn frame
    /// sees the same state three had.
    pub fn skip(&mut self, index: usize) {
        let frames = self.frames.clone();
        for ev in frames[index].iter() {
            match ev {
                Event::Framebuffer(h) => self.cur_fb = *h,
                Event::Draw(d) => self.apply_deltas(d),
                Event::Buffer { attribute, data } => {
                    let r = &self.rec.manifest.buffer_data[*data];
                    if r.bytes % 4 == 0 && (r.bytes as u64) <= self.res.buffer_sizes[*attribute] {
                        if let Some(b) = &self.res.buffers[*attribute] {
                            self.queue.write_buffer(b, 0, &self.rec.data[r.offset..r.offset + r.bytes]);
                        }
                    }
                }
                _ => {}
            }
        }
    }

    /// Send this frame's uniforms. Call after `frame` and before submitting its encoder.
    pub fn finish_frame(&mut self) {
        if !self.staging.is_empty() {
            let n = self.staging.len().next_multiple_of(4);
            self.staging.resize(n, 0);
            assert!(n as u64 <= RING_BYTES, "uniform ring overflow");
            self.queue.write_buffer(&self.ring, 0, &self.staging);
        }
    }

    fn begin(&mut self, encoder: &mut wgpu::CommandEncoder, fb: i64, clear: PendingClear) -> Result<wgpu::RenderPass<'static>, String> {
        let target = self.targets.get(&fb).ok_or(format!("pass on unknown framebuffer {fb}"))?;
        let colors: Vec<Option<wgpu::RenderPassColorAttachment>> = target
            .colors
            .iter()
            .map(|(view, _)| Some(wgpu::RenderPassColorAttachment { view, depth_slice: None, resolve_target: None, ops: wgpu::Operations { load: clear.color.map_or(wgpu::LoadOp::Load, wgpu::LoadOp::Clear), store: wgpu::StoreOp::Store } }))
            .collect();
        let depth = target.depth.as_ref().map(|(view, format)| wgpu::RenderPassDepthStencilAttachment {
            view,
            depth_ops: Some(wgpu::Operations { load: clear.depth.map_or(wgpu::LoadOp::Load, wgpu::LoadOp::Clear), store: wgpu::StoreOp::Store }),
            stencil_ops: if format.has_stencil_aspect() { Some(wgpu::Operations { load: wgpu::LoadOp::Clear(0), store: wgpu::StoreOp::Store }) } else { None },
        });
        let pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor { label: None, color_attachments: &colors, depth_stencil_attachment: depth, timestamp_writes: None, occlusion_query_set: None, multiview_mask: None });
        Ok(pass.forget_lifetime())
    }

    /// Copy the canvas to a presentable target (flipped to top-down).
    pub fn present_to(&mut self, encoder: &mut wgpu::CommandEncoder, view: &wgpu::TextureView, format: wgpu::TextureFormat) {
        let src = self.canvas.create_view(&Default::default());
        self.copier.copy(&self.device, encoder, &src, view, format, true, false);
    }

    /// The canvas as RGBA8, bottom row first (GL readback order). Blocks until the GPU is done.
    pub fn read_canvas(&self) -> Vec<u8> {
        let [w, h] = self.rec.manifest.canvas;
        let row = (w * 4).next_multiple_of(256);
        let buffer = self.device.create_buffer(&wgpu::BufferDescriptor { label: Some("canvas readback"), size: (row * h) as u64, usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ, mapped_at_creation: false });
        let mut encoder = self.device.create_command_encoder(&Default::default());
        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo { texture: &self.canvas, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
            wgpu::TexelCopyBufferInfo { buffer: &buffer, layout: wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(row), rows_per_image: Some(h) } },
            wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
        );
        self.queue.submit([encoder.finish()]);
        buffer.map_async(wgpu::MapMode::Read, .., |r| r.expect("map canvas readback"));
        self.device.poll(wgpu::PollType::wait_indefinitely()).expect("poll");
        let mapped = buffer.get_mapped_range(..).expect("mapped canvas readback");
        let mut out = Vec::with_capacity((w * h * 4) as usize);
        for y in 0..h {
            out.extend_from_slice(&mapped[(y * row) as usize..(y * row + w * 4) as usize]);
        }
        out
    }
}
