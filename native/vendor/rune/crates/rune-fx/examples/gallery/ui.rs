//! Gallery-only UI stand-in: instanced rounded rects, shadows and Inter text from a CPU atlas.

use ab_glyph::{Font, FontRef, PxScale, ScaleFont};
use std::collections::HashMap;

pub const ATLAS: u32 = 2048;

#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct UiInst {
    pub rect: [f32; 4],
    pub p: [f32; 4],
    pub fill: [f32; 4],
    pub fill2: [f32; 4],
    pub border: [f32; 4],
    pub uv: [f32; 4],
    pub vp: [f32; 4],
}

/// sRGB hex + alpha -> premultiplied linear.
pub fn col(hex: u32, a: f32) -> [f32; 4] {
    let f = |s: u32| rune::color::srgb_decode(((hex >> s) & 0xff) as f32 / 255.0) * a;
    [f(16), f(8), f(0), a]
}

#[derive(Clone, Copy, Debug)]
pub struct TextRegion {
    pub uv: [f32; 4],
    pub w: f32,
    pub h: f32,
    /// Distance from the top of the region to the baseline, px.
    pub ascent: f32,
}

pub struct TextAtlas {
    fonts: Vec<FontRef<'static>>,
    pub data: Vec<u8>,
    map: HashMap<(String, u32, u8), TextRegion>,
    x: u32,
    y: u32,
    row_h: u32,
    pub dirty: bool,
}

impl TextAtlas {
    pub fn new() -> TextAtlas {
        let fonts = vec![
            FontRef::try_from_slice(include_bytes!("../../../rune/assets/Inter-Regular.ttf")).unwrap(),
            FontRef::try_from_slice(include_bytes!("../../../rune/assets/Inter-Medium.ttf")).unwrap(),
            FontRef::try_from_slice(include_bytes!("../../../rune/assets/Inter-SemiBold.ttf")).unwrap(),
        ];
        TextAtlas { fonts, data: vec![0; (ATLAS * ATLAS) as usize], map: HashMap::new(), x: 1, y: 1, row_h: 0, dirty: true }
    }

    /// Rasterise (once) and return the region. `weight`: 0 regular, 1 medium, 2 semibold.
    pub fn get(&mut self, text: &str, size_px: f32, weight: u8) -> TextRegion {
        let key = (text.to_string(), (size_px * 16.0) as u32, weight);
        if let Some(r) = self.map.get(&key) {
            return *r;
        }
        let font = &self.fonts[weight as usize];
        let sf = font.as_scaled(PxScale::from(size_px));
        let tracking = if size_px > 40.0 { -0.02 * size_px } else { 0.0 };
        let mut pen = 0.0f32;
        let mut glyphs = Vec::new();
        let mut prev = None;
        for ch in text.chars() {
            let id = font.glyph_id(ch);
            if let Some(p) = prev {
                pen += sf.kern(p, id);
            }
            glyphs.push(id.with_scale_and_position(PxScale::from(size_px), ab_glyph::point(pen, sf.ascent())));
            pen += sf.h_advance(id) + tracking;
            prev = Some(id);
        }
        let w = (pen.ceil() as u32 + 4).max(1);
        let h = (sf.ascent() - sf.descent()).ceil() as u32 + 4;
        if self.x + w + 1 > ATLAS {
            self.x = 1;
            self.y += self.row_h + 1;
            self.row_h = 0;
        }
        let (ox, oy) = (self.x + 2, self.y + 2);
        for g in glyphs {
            if let Some(og) = font.outline_glyph(g) {
                let b = og.px_bounds();
                og.draw(|gx, gy, c| {
                    let x = ox as i32 + b.min.x as i32 + gx as i32;
                    let y = oy as i32 + b.min.y as i32 + gy as i32;
                    if x >= 0 && y >= 0 && (x as u32) < ATLAS && (y as u32) < ATLAS {
                        let i = (y as u32 * ATLAS + x as u32) as usize;
                        self.data[i] = self.data[i].max((c * 255.0) as u8);
                    }
                });
            }
        }
        let r = TextRegion {
            uv: [
                self.x as f32 / ATLAS as f32,
                self.y as f32 / ATLAS as f32,
                (self.x + w) as f32 / ATLAS as f32,
                (self.y + h) as f32 / ATLAS as f32,
            ],
            w: w as f32,
            h: h as f32,
            ascent: sf.ascent() + 2.0,
        };
        self.x += w + 1;
        self.row_h = self.row_h.max(h);
        self.dirty = true;
        self.map.insert(key, r);
        r
    }
}

pub struct UiRenderer {
    pipeline: wgpu::RenderPipeline,
    bgl: wgpu::BindGroupLayout,
    bg: Option<wgpu::BindGroup>,
    buf: wgpu::Buffer,
    cap: usize,
    pub atlas_tex: wgpu::Texture,
    atlas_view: wgpu::TextureView,
    sampler: wgpu::Sampler,
}

impl UiRenderer {
    pub fn new(device: &wgpu::Device, format: wgpu::TextureFormat) -> UiRenderer {
        let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("ui"),
            source: wgpu::ShaderSource::Wgsl(include_str!("ui.wgsl").into()),
        });
        let fr = wgpu::ShaderStages::FRAGMENT;
        let vf = wgpu::ShaderStages::VERTEX_FRAGMENT;
        let bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("ui"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: vf,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: fr,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: fr,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });
        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("ui"),
            bind_group_layouts: &[Some(&bgl)],
            immediate_size: 0,
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("ui"),
            layout: Some(&layout),
            vertex: wgpu::VertexState { module: &module, entry_point: Some("vs"), compilation_options: Default::default(), buffers: &[] },
            primitive: wgpu::PrimitiveState { topology: wgpu::PrimitiveTopology::TriangleStrip, ..Default::default() },
            depth_stencil: None,
            multisample: Default::default(),
            fragment: Some(wgpu::FragmentState {
                module: &module,
                entry_point: Some("fs"),
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: Some(wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            multiview_mask: None,
            cache: None,
        });
        let atlas_tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("atlas"),
            size: wgpu::Extent3d { width: ATLAS, height: ATLAS, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::R8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        let atlas_view = atlas_tex.create_view(&Default::default());
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });
        let cap = 1024;
        let buf = Self::buffer(device, cap);
        UiRenderer { pipeline, bgl, bg: None, buf, cap, atlas_tex, atlas_view, sampler }
    }

    fn buffer(device: &wgpu::Device, cap: usize) -> wgpu::Buffer {
        device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("ui insts"),
            size: (cap * std::mem::size_of::<UiInst>()) as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        })
    }

    pub fn prepare(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, atlas: &mut TextAtlas, insts: &[UiInst]) {
        if atlas.dirty {
            queue.write_texture(
                wgpu::TexelCopyTextureInfo { texture: &self.atlas_tex, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
                &atlas.data,
                wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(ATLAS), rows_per_image: None },
                wgpu::Extent3d { width: ATLAS, height: ATLAS, depth_or_array_layers: 1 },
            );
            atlas.dirty = false;
        }
        if insts.len() > self.cap || self.bg.is_none() {
            self.cap = self.cap.max(insts.len().next_power_of_two());
            self.buf = Self::buffer(device, self.cap);
            self.bg = Some(device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("ui"),
                layout: &self.bgl,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: self.buf.as_entire_binding() },
                    wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(&self.atlas_view) },
                    wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::Sampler(&self.sampler) },
                ],
            }));
        }
        if !insts.is_empty() {
            queue.write_buffer(&self.buf, 0, bytemuck::cast_slice(insts));
        }
    }

    pub fn draw(&self, pass: &mut wgpu::RenderPass<'_>, range: std::ops::Range<usize>) {
        if range.is_empty() {
            return;
        }
        pass.set_pipeline(&self.pipeline);
        pass.set_bind_group(0, self.bg.as_ref().unwrap(), &[]);
        pass.draw(0..4, range.start as u32..range.end as u32);
    }
}
