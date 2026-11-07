//! GPU copies of a recording's textures, buffers and render targets, made once at load.

use crate::gl;
use jg_scene::{Recording, Texture};
use std::collections::{HashMap, HashSet};

/// How a texture can be bound: decides the bind group layout entry and the sampler type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Binding {
    Filterable,
    Unfilterable,
    Depth,
    Uint,
    Sint,
}

pub struct Tex {
    pub texture: wgpu::Texture,
    /// The view three's sampler sees (whole texture, cube when a cube, depth aspect for depth).
    pub view: wgpu::TextureView,
    pub format: wgpu::TextureFormat,
    pub dim: wgpu::TextureViewDimension,
    pub binding: Binding,
    pub size: [u32; 2],
    pub mips: u32,
    pub sampler: SamplerKey,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct SamplerKey {
    pub wrap: [u8; 3],
    pub mag: u8,
    pub min: u8,
    pub mip: u8,
    pub anisotropy: u8,
    pub compare: u8,
}

fn addr_code(a: wgpu::AddressMode) -> u8 {
    match a {
        wgpu::AddressMode::Repeat => 1,
        wgpu::AddressMode::MirrorRepeat => 2,
        _ => 0,
    }
}

impl SamplerKey {
    fn of(t: &Texture, binding: Binding, mipmapped: bool) -> SamplerKey {
        let (mag, _, _) = gl::filter(t.mag_filter);
        let (min, mip, uses_mips) = gl::filter(t.min_filter);
        let nearest = matches!(binding, Binding::Unfilterable | Binding::Uint | Binding::Sint | Binding::Depth) && t.compare_function.is_none();
        let lin = |f: wgpu::FilterMode| if nearest { 0 } else { (f == wgpu::FilterMode::Linear) as u8 };
        let mip_code = if !uses_mips || !mipmapped || nearest { 0 } else { (mip == wgpu::MipmapFilterMode::Linear) as u8 + 1 };
        // three applies anisotropy only to linear, mipmapped sampling.
        let aniso = t.anisotropy.unwrap_or(1.0).clamp(1.0, 16.0) as u8;
        let aniso = if aniso > 1 && lin(mag) == 1 && lin(min) == 1 && mip_code == 2 { aniso } else { 1 };
        SamplerKey {
            wrap: [addr_code(gl::address(t.wrap_s)), addr_code(gl::address(t.wrap_t)), addr_code(gl::address(t.wrap_r))],
            mag: lin(mag),
            min: lin(min),
            mip: mip_code,
            anisotropy: aniso,
            compare: t.compare_function.map(|c| (c & 0xff) as u8 + 1).unwrap_or(0),
        }
    }

    pub fn create(&self, device: &wgpu::Device, comparison: bool) -> wgpu::Sampler {
        let a = |c: u8| match c {
            1 => wgpu::AddressMode::Repeat,
            2 => wgpu::AddressMode::MirrorRepeat,
            _ => wgpu::AddressMode::ClampToEdge,
        };
        let f = |c: u8| if c == 1 { wgpu::FilterMode::Linear } else { wgpu::FilterMode::Nearest };
        // A shadow sampler in GL filters the comparison results linearly when the texture's
        // filter is linear (three sets LinearFilter on PCF shadow maps).
        device.create_sampler(&wgpu::SamplerDescriptor {
            label: None,
            address_mode_u: a(self.wrap[0]),
            address_mode_v: a(self.wrap[1]),
            address_mode_w: a(self.wrap[2]),
            mag_filter: f(self.mag),
            min_filter: f(self.min),
            mipmap_filter: if self.mip == 2 { wgpu::MipmapFilterMode::Linear } else { wgpu::MipmapFilterMode::Nearest },
            lod_min_clamp: 0.0,
            lod_max_clamp: if self.mip == 0 { 0.0 } else { 32.0 },
            compare: if comparison { Some(gl::compare(0x200 + (self.compare.max(1) as u32 - 1))) } else { None },
            anisotropy_clamp: self.anisotropy as u16,
            border_color: None,
        })
    }
}

fn binding_of(format: wgpu::TextureFormat, float32_filterable: bool) -> Binding {
    use wgpu::TextureFormat as T;
    match format {
        T::Depth16Unorm | T::Depth24Plus | T::Depth24PlusStencil8 | T::Depth32Float => Binding::Depth,
        f if f.sample_type(None, None) == Some(wgpu::TextureSampleType::Uint) => Binding::Uint,
        f if f.sample_type(None, None) == Some(wgpu::TextureSampleType::Sint) => Binding::Sint,
        T::Rgba32Float | T::Rg32Float | T::R32Float if !float32_filterable => Binding::Unfilterable,
        _ => Binding::Filterable,
    }
}

fn mip_count(w: u32, h: u32) -> u32 {
    32 - w.max(h).max(1).leading_zeros()
}

/// Bytes per row and rows for one mip of `format` (block-compressed formats count 4x4 blocks).
fn layout(format: wgpu::TextureFormat, w: u32, h: u32) -> (u32, u32) {
    let (bw, bh) = format.block_dimensions();
    let bytes = format.block_copy_size(None).unwrap_or(4);
    (w.div_ceil(bw) * bytes, h.div_ceil(bh))
}

pub struct Resources {
    pub textures: HashMap<i64, Tex>,
    /// Image textures three generated mipmaps for, waiting for the first frame's encoder.
    pub needs_mips: Vec<i64>,
    pub buffers: Vec<Option<wgpu::Buffer>>,
    pub buffer_sizes: Vec<u64>,
    /// [0, 0, 0, 1] four times over: GL's default value for up to four vertex inputs a geometry lacks,
    /// all read from one vertex buffer slot (WebGPU allows eight slots a draw).
    pub default_attribute: wgpu::Buffer,
    /// Integer attributes a draw reads as floats, held as Float32 (see `gl::needs_float`).
    pub float_attrs: HashSet<usize>,
    /// Where each attribute's current contents sit in the recording's data (offset, bytes), and how
    /// many times they have changed: an interleaved copy (`Replayer::merged`) rebuilds from these.
    pub latest: Vec<(usize, usize)>,
    pub versions: Vec<u32>,
}

/// GL's default attribute value (0, 0, 0, 1), one 16-byte copy per input a program can leave
/// unbound, so every missing input of a draw shares one vertex buffer slot.
pub const DEFAULT_ATTRIBUTES: usize = 32;

impl Resources {
    /// An attribute's current contents as its vertex buffer holds them (Float32 when converted).
    pub fn current_bytes(&self, rec: &Recording, a: usize) -> Vec<u8> {
        let (offset, bytes) = self.latest[a];
        let raw = rec.bytes(offset, bytes);
        if self.float_attrs.contains(&a) {
            let attr = &rec.manifest.attributes[a];
            gl::to_f32(&attr.array, attr.normalized, raw)
        } else {
            raw.to_vec()
        }
    }

    /// Note new contents for an attribute.
    pub fn changed(&mut self, a: usize, offset: usize, bytes: usize) {
        self.latest[a] = (offset, bytes);
        self.versions[a] = self.versions[a].wrapping_add(1);
    }
}

impl Resources {
    pub fn load(device: &wgpu::Device, queue: &wgpu::Queue, rec: &Recording, float32_filterable: bool, float_attrs: HashSet<usize>) -> Result<Resources, String> {
        let mut textures = HashMap::new();
        let mut needs_mips = Vec::new();
        for t in &rec.manifest.textures {
            if t.handle < 0 || t.missing == Some(true) {
                continue;
            }
            let format = gl::texture_format(t).map_err(|e| format!("texture {} ({}): {e}", t.handle, t.name.as_deref().unwrap_or("")))?;
            let cube = t.is_cube;
            let three_d = t.is_3d == Some(true);
            let layers = if cube { 6 } else { t.depth.unwrap_or(1).max(1) };
            let (_, _, uses_mips) = gl::filter(t.min_filter);
            let generate = t.generate_mipmaps == Some(true) && uses_mips && !t.is_compressed;
            let mips = if let Some(m) = &t.mipmaps
                && !m.is_empty()
            {
                m.len() as u32
            } else if let Some(f) = &t.faces {
                f.iter().map(|f| f.level + 1).max().unwrap_or(1)
            } else if generate {
                mip_count(t.width, t.height)
            } else {
                1
            };
            let renderable = !format.is_compressed();
            let mut usage = wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::COPY_SRC;
            if renderable {
                usage |= wgpu::TextureUsages::RENDER_ATTACHMENT;
            }
            let texture = device.create_texture(&wgpu::TextureDescriptor {
                label: t.name.as_deref(),
                size: wgpu::Extent3d { width: t.width.max(1), height: t.height.max(1), depth_or_array_layers: layers },
                mip_level_count: mips,
                sample_count: 1,
                dimension: if three_d { wgpu::TextureDimension::D3 } else { wgpu::TextureDimension::D2 },
                format,
                usage,
                view_formats: &[],
            });
            let dim = if cube {
                wgpu::TextureViewDimension::Cube
            } else if three_d {
                wgpu::TextureViewDimension::D3
            } else if t.is_array == Some(true) {
                wgpu::TextureViewDimension::D2Array
            } else {
                wgpu::TextureViewDimension::D2
            };
            let binding = binding_of(format, float32_filterable);
            let aspect = if binding == Binding::Depth { wgpu::TextureAspect::DepthOnly } else { wgpu::TextureAspect::All };
            let view = texture.create_view(&wgpu::TextureViewDescriptor { dimension: Some(dim), aspect, ..Default::default() });
            let write = |level: u32, layer: u32, w: u32, h: u32, d: u32, bytes: &[u8]| {
                let (row, rows) = layout(format, w, h);
                // A compressed level smaller than a block (a 2x2 or 1x1 mip) still copies whole 4x4
                // blocks: WebGPU takes the level's size rounded up to the block, as its data holds.
                let (bw, bh) = format.block_dimensions();
                queue.write_texture(
                    wgpu::TexelCopyTextureInfo { texture: &texture, mip_level: level, origin: wgpu::Origin3d { x: 0, y: 0, z: layer }, aspect: wgpu::TextureAspect::All },
                    bytes,
                    wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(row), rows_per_image: Some(rows) },
                    wgpu::Extent3d { width: w.next_multiple_of(bw), height: h.next_multiple_of(bh), depth_or_array_layers: d },
                );
            };
            // Contents. Every upload keeps GL's memory row order (row 0 first): the shaders keep
            // GL's texture coordinates, so the same rows are sampled.
            if let Some(m) = &t.mipmaps
                && !m.is_empty()
                && t.is_compressed
            {
                for (level, mip) in m.iter().enumerate() {
                    write(level as u32, 0, mip.width, mip.height, 1, rec.bytes(mip.offset, mip.bytes));
                }
            } else if let Some(faces) = &t.faces {
                // The PMREM cube, read back as RGBA Float32; stored in its own half-float format.
                for f in faces {
                    let floats: &[f32] = bytemuck::cast_slice(rec.bytes(f.offset, f.bytes));
                    let bytes: Vec<u8> = match format {
                        wgpu::TextureFormat::Rgba16Float => floats.iter().flat_map(|v| half::f16::from_f32(*v).to_le_bytes()).collect(),
                        wgpu::TextureFormat::Rgba32Float => bytemuck::cast_slice(floats).to_vec(),
                        other => return Err(format!("cube readback into {other:?}")),
                    };
                    write(f.level, f.face, f.size, f.size, 1, &bytes);
                }
            } else if let (Some(offset), Some(bytes)) = (t.offset, t.bytes) {
                let data = rec.bytes(offset, bytes);
                write(0, 0, t.width, t.height, if three_d || t.is_array == Some(true) { layers } else { 1 }, data);
                if generate && mips > 1 {
                    needs_mips.push(t.handle);
                }
            }
            let sampler = SamplerKey::of(t, binding, mips > 1);
            textures.insert(t.handle, Tex { texture, view, format, dim, binding, size: [t.width, t.height], mips, sampler });
        }
        let mut buffers = Vec::new();
        let mut buffer_sizes = Vec::new();
        for (i, a) in rec.manifest.attributes.iter().enumerate() {
            if a.bytes == 0 {
                buffers.push(None);
                buffer_sizes.push(0);
                continue;
            }
            let raw = rec.bytes(a.offset, a.bytes);
            let mut bytes = if float_attrs.contains(&i) { gl::to_f32(&a.array, a.normalized, raw) } else { raw.to_vec() };
            let size = (bytes.len() as u64).next_multiple_of(4);
            let buffer = device.create_buffer(&wgpu::BufferDescriptor { label: None, size, usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
            bytes.resize(size as usize, 0);
            queue.write_buffer(&buffer, 0, &bytes);
            buffers.push(Some(buffer));
            buffer_sizes.push(size);
        }
        let latest = rec.manifest.attributes.iter().map(|a| (a.offset, a.bytes)).collect();
        let versions = vec![0; rec.manifest.attributes.len()];
        let default_attribute = device.create_buffer(&wgpu::BufferDescriptor { label: Some("default attribute"), size: 16 * DEFAULT_ATTRIBUTES as u64, usage: wgpu::BufferUsages::VERTEX, mapped_at_creation: true });
        default_attribute.slice(..).get_mapped_range_mut().expect("map default attribute").copy_from_slice(bytemuck::cast_slice(&[[0.0f32, 0.0, 0.0, 1.0]; DEFAULT_ATTRIBUTES]));
        default_attribute.unmap();
        Ok(Resources { textures, needs_mips, buffers, buffer_sizes, default_attribute, float_attrs, latest, versions })
    }
}
