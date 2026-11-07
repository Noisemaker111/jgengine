//! Full-screen copies: mipmap generation (GL's generateMipmap, a 2x2 box through linear
//! sampling, in linear light for sRGB formats) and the final copy of the GL-layout canvas to a
//! presentable surface (flipped, as the canvas's row 0 is the bottom of the screen).

use std::collections::HashMap;

const SHADER: &str = r#"
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
struct VO { @builtin(position) p: vec4f, @location(0) uv: vec2f };
fn corner(i: u32) -> vec2f { return vec2f(f32((i << 1u) & 2u), f32(i & 2u)); }
// Row 0 of the target samples row 0 of the source: keeps GL's memory layout.
@vertex fn vs_same(@builtin(vertex_index) i: u32) -> VO {
  let c = corner(i); var o: VO; o.p = vec4f(c * 2.0 - 1.0, 0.0, 1.0); o.uv = vec2f(c.x, 1.0 - c.y); return o;
}
// Row 0 of the target samples the source's last row: GL bottom-up canvas to a top-down surface.
@vertex fn vs_flip(@builtin(vertex_index) i: u32) -> VO {
  let c = corner(i); var o: VO; o.p = vec4f(c * 2.0 - 1.0, 0.0, 1.0); o.uv = c; return o;
}
@fragment fn fs(v: VO) -> @location(0) vec4f { return textureSampleLevel(src, smp, v.uv, 0.0); }
"#;

pub struct Copier {
    module: wgpu::ShaderModule,
    layout: wgpu::BindGroupLayout,
    pipeline_layout: wgpu::PipelineLayout,
    linear: wgpu::Sampler,
    nearest: wgpu::Sampler,
    pipelines: HashMap<(wgpu::TextureFormat, bool), wgpu::RenderPipeline>,
}

impl Copier {
    pub fn new(device: &wgpu::Device) -> Copier {
        let module = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("copy"), source: wgpu::ShaderSource::Wgsl(SHADER.into()) });
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("copy"),
            entries: &[
                wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Texture { sample_type: wgpu::TextureSampleType::Float { filterable: true }, view_dimension: wgpu::TextureViewDimension::D2, multisampled: false }, count: None },
                wgpu::BindGroupLayoutEntry { binding: 1, visibility: wgpu::ShaderStages::FRAGMENT, ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering), count: None },
            ],
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some("copy"), bind_group_layouts: &[Some(&layout)], immediate_size: 0 });
        let sampler = |f: wgpu::FilterMode| device.create_sampler(&wgpu::SamplerDescriptor { mag_filter: f, min_filter: f, ..Default::default() });
        Copier { module, layout, pipeline_layout, linear: sampler(wgpu::FilterMode::Linear), nearest: sampler(wgpu::FilterMode::Nearest), pipelines: HashMap::new() }
    }

    fn pipeline(&mut self, device: &wgpu::Device, format: wgpu::TextureFormat, flip: bool) -> wgpu::RenderPipeline {
        self.pipelines
            .entry((format, flip))
            .or_insert_with(|| {
                device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                    label: Some("copy"),
                    layout: Some(&self.pipeline_layout),
                    vertex: wgpu::VertexState { module: &self.module, entry_point: Some(if flip { "vs_flip" } else { "vs_same" }), compilation_options: Default::default(), buffers: &[] },
                    primitive: wgpu::PrimitiveState::default(),
                    depth_stencil: None,
                    multisample: wgpu::MultisampleState::default(),
                    fragment: Some(wgpu::FragmentState { module: &self.module, entry_point: Some("fs"), compilation_options: Default::default(), targets: &[Some(format.into())] }),
                    multiview_mask: None,
                    cache: None,
                })
            })
            .clone()
    }

    /// Draw `src` over `dst` (a full-target copy).
    pub fn copy(&mut self, device: &wgpu::Device, encoder: &mut wgpu::CommandEncoder, src: &wgpu::TextureView, dst: &wgpu::TextureView, format: wgpu::TextureFormat, flip: bool, linear: bool) {
        let pipeline = self.pipeline(device, format, flip);
        let group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &self.layout,
            entries: &[wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(src) }, wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(if linear { &self.linear } else { &self.nearest }) }],
        });
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("copy"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment { view: dst, depth_slice: None, resolve_target: None, ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), store: wgpu::StoreOp::Store } })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        pass.set_pipeline(&pipeline);
        pass.set_bind_group(0, &group, &[]);
        pass.draw(0..3, 0..1);
    }

    /// Fill mips 1.. of a 2D texture from mip 0.
    pub fn mipmaps(&mut self, device: &wgpu::Device, encoder: &mut wgpu::CommandEncoder, texture: &wgpu::Texture) {
        let format = texture.format();
        for level in 1..texture.mip_level_count() {
            let view = |l: u32| texture.create_view(&wgpu::TextureViewDescriptor { base_mip_level: l, mip_level_count: Some(1), dimension: Some(wgpu::TextureViewDimension::D2), base_array_layer: 0, array_layer_count: Some(1), ..Default::default() });
            self.copy(device, encoder, &view(level - 1), &view(level), format, false, true);
        }
    }
}
