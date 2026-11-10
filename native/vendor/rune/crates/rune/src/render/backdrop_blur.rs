//! In-window backdrop blur (`El::backdrop_blur`, `KIND_BACKDROP_BLUR` records). At each record
//! the pass splits (`ActivePass::split`) and copies what is below into the pooled backdrop, a
//! separable Gaussian blurs it inside the record's rect plus the blur's reach,
//! and a composite quad draws the result inside the record's rounded rect and clip. The scratch
//! covers only that region, not the window, and grows to the largest one seen. Built on the
//! first record; frames without one never touch it.
use super::*;

/// Uniform slot stride: the largest `min_uniform_buffer_offset_alignment` WebGPU allows.
const SLOT: u64 = 256;
/// Vertical/composite uniforms, then horizontal uniforms for the source backdrop.
const SLOTS: usize = 2;
/// Stable texture buckets avoid reallocating for small changes in a region's size.
const STEP: u32 = 64;

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Level {
    /// x: standard deviation in device pixels.
    w: [f32; 4],
    /// The region's bounds in the source's uv, clamping every tap.
    region: [f32; 4],
    /// Source uv from target uv: `uv * xy + zw`.
    map: [f32; 4],
    /// Scratch window origin xy and extent zw.
    place: [f32; 4],
}

/// One record's two passes, prepared with their uniforms.
#[derive(Clone, Copy)]
struct Record {
    at: u32,
    slot: usize,
    /// Window device pixels blurred: the rect plus the blur's reach, inside the viewport.
    region: [f32; 4],
    /// Scratch window origin in device pixels.
    origin: [f32; 2],
}

struct Scratch {
    size: [u32; 2],
    horizontal: wgpu::TextureView,
    vertical: wgpu::TextureView,
    vertical_input: wgpu::BindGroup,
    result: wgpu::BindGroup,
}

pub(super) struct BackdropBlur {
    down: wgpu::RenderPipeline,
    up: wgpu::RenderPipeline,
    level_layout: wgpu::BindGroupLayout,
    result_layout: wgpu::BindGroupLayout,
    composite_layout: wgpu::PipelineLayout,
    composite_shader: wgpu::ShaderModule,
    composites: Vec<(wgpu::TextureFormat, wgpu::RenderPipeline)>,
    sampler: wgpu::Sampler,
    uniforms: wgpu::Buffer,
    level_data: Vec<u8>,
    scratch: Option<Scratch>,
    /// Horizontal pass input, reading the pooled backdrop of each format.
    first: Vec<(wgpu::TextureFormat, wgpu::BindGroup)>,
    records: Vec<Record>,
}

impl BackdropBlur {
    pub(super) fn new(device: &wgpu::Device, uber: &wgpu::BindGroupLayout) -> Self {
        let texture = |binding| wgpu::BindGroupLayoutEntry {
            binding,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                view_dimension: wgpu::TextureViewDimension::D2,
                multisampled: false,
            },
            count: None,
        };
        let sampler_entry = |binding| wgpu::BindGroupLayoutEntry {
            binding,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
            count: None,
        };
        let levels_entry = |binding, visibility| wgpu::BindGroupLayoutEntry {
            binding,
            visibility,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: true,
                min_binding_size: wgpu::BufferSize::new(std::mem::size_of::<Level>() as u64),
            },
            count: None,
        };
        let level_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("backdrop blur level"),
            entries: &[texture(0), sampler_entry(2), levels_entry(3, wgpu::ShaderStages::FRAGMENT)],
        });
        let result_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("backdrop blur result"),
            entries: &[texture(0), sampler_entry(1), levels_entry(2, wgpu::ShaderStages::FRAGMENT)],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("backdrop blur"),
            source: wgpu::ShaderSource::Wgsl(include_str!("../backdrop_blur.wgsl").into()),
        });
        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("backdrop blur"),
            bind_group_layouts: &[Some(&level_layout)],
            immediate_size: 0,
        });
        let pass = |entry| device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("backdrop blur"),
            layout: Some(&layout),
            vertex: wgpu::VertexState { module: &shader, entry_point: Some("vs"), compilation_options: Default::default(), buffers: &[] },
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some(entry),
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState { format: layers::FORMAT, blend: None, write_mask: wgpu::ColorWrites::ALL })],
            }),
            multiview_mask: None,
            cache: None,
        });
        let (down, up) = (pass("fs_down"), pass("fs_up"));
        let composite_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("backdrop blur composite"),
            source: wgpu::ShaderSource::Wgsl(format!("{CLIP_WGSL}\n{}", include_str!("../backdrop_composite.wgsl")).into()),
        });
        let composite_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("backdrop blur composite"),
            bind_group_layouts: &[Some(uber), Some(&result_layout)],
            immediate_size: 0,
        });
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("backdrop blur"),
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });
        let uniforms = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("backdrop blur levels"),
            size: SLOTS as u64 * SLOT,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        BackdropBlur {
            down, up, level_layout, result_layout, composite_layout, composite_shader,
            composites: Vec::new(), sampler, uniforms, level_data: Vec::new(), scratch: None, first: Vec::new(), records: Vec::new(),
        }
    }

    fn ensure_uniforms(&mut self, device: &wgpu::Device, count: usize) -> bool {
        let required = count as u64 * SLOTS as u64 * SLOT;
        if required <= self.uniforms.size() { return false; }
        let limit = device.limits().max_buffer_size.min(u32::MAX as u64 + 1);
        assert!(required <= limit, "backdrop blur uniforms exceed the device buffer or dynamic-offset limit");
        let size = required.checked_next_power_of_two().filter(|size| *size <= limit).unwrap_or(required);
        self.uniforms = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("backdrop blur axes"), size,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false,
        });
        if let Some(mut scratch) = self.scratch.take() {
            scratch.vertical_input = self.level_bind(device, &scratch.horizontal);
            scratch.result = self.result_bind(device, &scratch.vertical);
            self.scratch = Some(scratch);
        }
        true
    }

    fn levels_binding(&self) -> wgpu::BindingResource<'_> {
        wgpu::BindingResource::Buffer(wgpu::BufferBinding {
            buffer: &self.uniforms,
            offset: 0,
            size: wgpu::BufferSize::new(std::mem::size_of::<Level>() as u64),
        })
    }

    fn level_bind(&self, device: &wgpu::Device, src: &wgpu::TextureView) -> wgpu::BindGroup {
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("backdrop blur level"),
            layout: &self.level_layout,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(src) },
                wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::Sampler(&self.sampler) },
                wgpu::BindGroupEntry { binding: 3, resource: self.levels_binding() },
            ],
        })
    }

    /// Points the first down pass at the pooled backdrop of `format` (new or resized).
    pub(super) fn bind_backdrop(&mut self, device: &wgpu::Device, format: wgpu::TextureFormat, view: &wgpu::TextureView) {
        let bind = self.level_bind(device, view);
        match self.first.iter_mut().find(|(f, _)| *f == format) {
            Some(slot) => slot.1 = bind,
            None => self.first.push((format, bind)),
        }
    }

    pub(super) fn ensure_composite(&mut self, device: &wgpu::Device, format: wgpu::TextureFormat) {
        if self.composites.iter().any(|(f, _)| *f == format) { return; }
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("backdrop blur composite"),
            layout: Some(&self.composite_layout),
            vertex: wgpu::VertexState {
                module: &self.composite_shader,
                entry_point: Some("vs"),
                compilation_options: Default::default(),
                buffers: &[Some(metallib::uber_vertex_layout())],
            },
            primitive: metallib::uber_primitive(),
            depth_stencil: None,
            multisample: Default::default(),
            fragment: Some(wgpu::FragmentState {
                module: &self.composite_shader,
                entry_point: Some("fs"),
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: Some(Blend::SourceOver.state()),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            multiview_mask: None,
            cache: None,
        });
        self.composites.push((format, pipeline));
    }

    /// Scratch at least `need` texels, grown in `STEP`s and never past `cap`.
    fn ensure_scratch(&mut self, device: &wgpu::Device, need: [u32; 2], cap: [u32; 2]) {
        let have = self.scratch.as_ref().map_or([0; 2], |p| p.size);
        let size = [0, 1].map(|k| have[k].min(cap[k]).max(need[k]));
        if size == have { return; }
        let chain = |label| {
            let t = device.create_texture(&wgpu::TextureDescriptor {
                label: Some(label),
                size: wgpu::Extent3d { width: size[0], height: size[1], depth_or_array_layers: 1 },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: layers::FORMAT,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
                view_formats: &[],
            });
            t.create_view(&Default::default())
        };
        let (horizontal, vertical) = (chain("backdrop blur horizontal"), chain("backdrop blur vertical"));
        let vertical_input = self.level_bind(device, &horizontal);
        let result = self.result_bind(device, &vertical);
        self.scratch = Some(Scratch { size, horizontal, vertical, vertical_input, result });
    }

    fn result_bind(&self, device: &wgpu::Device, vertical: &wgpu::TextureView) -> wgpu::BindGroup {
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("backdrop blur result"),
            layout: &self.result_layout,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(vertical) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(&self.sampler) },
                wgpu::BindGroupEntry { binding: 2, resource: self.levels_binding() },
            ],
        })
    }

    /// Records both Gaussian axes for `record`, reading the backdrop of `format`.
    fn encode(&self, encoder: &mut wgpu::CommandEncoder, format: wgpu::TextureFormat, record: &Record) {
        let (Some(scratch), Some((_, first))) = (&self.scratch, self.first.iter().find(|(f, _)| *f == format)) else { return };
        let [pw, ph] = scratch.size;
        let ([x0, y0, x1, y1], [ox, oy]) = (record.region, record.origin);
        // Only texels in the copied region can contribute to either Gaussian axis.
        let scissor = || {
            let k = 1.0;
            let (w, h) = (pw, ph);
            let x = (((x0 - ox) / k).floor() as u32).saturating_sub(2).min(w - 1);
            let y = (((y0 - oy) / k).floor() as u32).saturating_sub(2).min(h - 1);
            let r = (((x1 - ox) / k).ceil() as u32 + 2).min(w);
            let b = (((y1 - oy) / k).ceil() as u32 + 2).min(h);
            (x, y, r.max(x + 1) - x, b.max(y + 1) - y)
        };
        let mut run = |pipeline: &wgpu::RenderPipeline, dst: &wgpu::TextureView, bind: &wgpu::BindGroup, uniform: usize| {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("backdrop blur"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: dst,
                    depth_slice: None,
                    resolve_target: None,
                    // Taps never read past the scissor, so nothing outside it needs loading.
                    ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT), store: wgpu::StoreOp::Store },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            let (x, y, w, h) = scissor();
            pass.set_scissor_rect(x, y, w, h);
            pass.set_pipeline(pipeline);
            pass.set_bind_group(0, bind, &[((record.slot * SLOTS + uniform) as u64 * SLOT) as u32]);
            pass.draw(0..3, 0..1);
        };
        run(&self.down, &scratch.horizontal, first, 1);
        run(&self.up, &scratch.vertical, &scratch.vertical_input, 0);
    }
}

impl Renderer {
    pub(super) fn has_backdrop_blur(&self) -> bool {
        self.backdrop_blur.as_ref().is_some_and(|b| !b.records.is_empty())
    }

    /// Builds this frame's backdrop blur scratch and axis uniforms.
    pub(super) fn prepare_backdrop_blur(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, (vw, vh): (u32, u32)) {
        let any = self.effects.iter().any(|(_, i)| i.params[1] == KIND_BACKDROP_BLUR);
        if let Some(b) = &mut self.backdrop_blur { b.records.clear(); }
        if !any || vw == 0 || vh == 0 { return; }
        let staging = self.uploads.staging(device, queue);
        if self.backdrop_blur.is_none() {
            let mut blur = BackdropBlur::new(device, &self.bind_layout);
            for bd in &self.backdrops { blur.bind_backdrop(device, bd.format, &bd.view); }
            self.backdrop_blur = Some(blur);
        }
        let Some(blur) = &mut self.backdrop_blur else { return };
        blur.ensure_composite(device, self.format);
        for (format, _) in &self.extra { blur.ensure_composite(device, *format); }
        if self.layers.targets.iter().any(Option::is_some) { blur.ensure_composite(device, layers::FORMAT); }
        let viewport = [vw as f32, vh as f32];
        let mut placed = Vec::new();
        let mut need = [STEP; 2];
        let records = self.effects.iter().filter(|(_, i)| i.params[1] == KIND_BACKDROP_BLUR);
        for (at, i) in records {
            let sigma = i.params[0].clamp(0.001, 156.2);
            let reach = sigma * 3.0 + 2.0;
            let region = [
                (i.rect[0] - reach).max(0.0),
                (i.rect[1] - reach).max(0.0),
                (i.rect[0] + i.rect[2] + reach).min(viewport[0]),
                (i.rect[1] + i.rect[3] + reach).min(viewport[1]),
            ];
            if region[2] <= region[0] || region[3] <= region[1] { continue; }
            // Device-pixel alignment keeps sampling stable while content scrolls underneath.
            let origin = [region[0].floor(), region[1].floor()];
            for k in 0..2 { need[k] = need[k].max(((region[k + 2] - origin[k]).ceil() as u32).next_multiple_of(STEP)); }
            placed.push((*at, sigma, region, origin));
        }
        if placed.is_empty() { return; }
        if blur.ensure_uniforms(device, placed.len()) {
            for backdrop in &self.backdrops { blur.bind_backdrop(device, backdrop.format, &backdrop.view); }
        }
        // The window plus the most an aligned origin can sit before it.
        let cap = [vw, vh].map(|v| (v + STEP).next_multiple_of(STEP));
        blur.ensure_scratch(device, need, cap);
        let Some(scratch) = &blur.scratch else { return };
        let extent = scratch.size.map(|v| v as f32);
        blur.level_data.resize(placed.len() * SLOTS * SLOT as usize, 0);
        for (slot, (at, sigma, region, origin)) in placed.into_iter().enumerate() {
            let inside = [(region[0] - origin[0]) / extent[0], (region[1] - origin[1]) / extent[1],
                (region[2] - origin[0]) / extent[0], (region[3] - origin[1]) / extent[1]];
            let place = [origin[0], origin[1], extent[0], extent[1]];
            for m in 0..SLOTS {
                // Horizontal reads the copied backdrop; vertical reads the horizontal result.
                let (region, map) = if m == 1 {
                    ([region[0] / viewport[0], region[1] / viewport[1], region[2] / viewport[0], region[3] / viewport[1]],
                        [extent[0] / viewport[0], extent[1] / viewport[1], origin[0] / viewport[0], origin[1] / viewport[1]])
                } else {
                    (inside, [1.0, 1.0, 0.0, 0.0])
                };
                let level = Level { w: [sigma, 0.0, 0.0, 0.0], region, map, place };
                let at = (slot * SLOTS + m) * SLOT as usize;
                blur.level_data[at..at + std::mem::size_of::<Level>()].copy_from_slice(bytemuck::bytes_of(&level));
            }
            blur.records.push(Record { at, slot, region, origin });
        }
        let used = blur.records.last().map_or(0, |r| (r.slot + 1) * SLOTS * SLOT as usize);
        staging.write_buffer(&blur.uniforms, 0, &blur.level_data[..used]);
    }

    /// Draws the backdrop blur record at `at`: splits the pass to copy and blur what is below,
    /// then composites the blur inside the record's rounded rect and clip. Draws nothing (the
    /// element shows only its fill) when the pass can't be split or the record wasn't prepared.
    pub(super) fn draw_backdrop_blur(&self, pass: &mut ActivePass<'_, '_>, format: wgpu::TextureFormat, at: u32, instance: &Instance, target: Option<usize>) {
        let Some(blur) = &self.backdrop_blur else { return };
        let Ok(k) = blur.records.binary_search_by_key(&at, |r| r.at) else { return };
        let record = &blur.records[k];
        let (Some((_, composite)), Some(scratch)) = (blur.composites.iter().find(|(f, _)| *f == format), &blur.scratch) else { return };
        let (origin, size) = self.target_frame(target);
        let (r, c) = (instance.rect, instance.clip);
        let edge = |v: f32, o: f32, max: u32| (v - o).clamp(0.0, max as f32) as u32;
        let (x0, y0) = (edge(r[0].max(c[0]).floor(), origin[0], size[0]), edge(r[1].max(c[1]).floor(), origin[1], size[1]));
        let (x1, y1) = (edge((r[0] + r[2]).min(c[2]).ceil(), origin[0], size[0]), edge((r[1] + r[3]).min(c[3]).ceil(), origin[1], size[1]));
        if x1 <= x0 || y1 <= y0 { return; }
        let split = pass.split(self, format, origin, size, target.is_some(), Some(record.region), |encoder, backdrop| {
            blur.encode(encoder, backdrop.format, record);
        });
        if split.is_none() { return; }
        let scope = pass.scissor();
        let [sx, sy, sw, sh] = scope.unwrap_or([0, 0, size[0], size[1]]);
        let (x0, y0, x1, y1) = (x0.max(sx), y0.max(sy), x1.min(sx + sw), y1.min(sy + sh));
        if x1 > x0 && y1 > y0 {
            let bind = match target {
                Some(index) => &self.layers.targets[index].as_ref().unwrap().base,
                None => &self.bind_group,
            };
            pass.set_scissor_rect(x0, y0, x1 - x0, y1 - y0);
            pass.set_pipeline(composite);
            pass.set_bind_group(0, bind, &[]);
            pass.set_bind_group(1, &scratch.result, &[(record.slot * SLOTS) as u32 * SLOT as u32]);
            pass.set_vertex_buffer(0, self.instances.slice(..));
            pass.draw(0..4, at..at + 1);
        }
        pass.set_scissor(scope, size);
    }
}
