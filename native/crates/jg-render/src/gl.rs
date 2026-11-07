//! GL and three.js enums as the recording carries them, mapped to wgpu.

use jg_scene::{State, Texture};

pub fn blend_factor(f: u32) -> wgpu::BlendFactor {
    use wgpu::BlendFactor as B;
    match f {
        0 => B::Zero,
        1 => B::One,
        0x300 => B::Src,
        0x301 => B::OneMinusSrc,
        0x302 => B::SrcAlpha,
        0x303 => B::OneMinusSrcAlpha,
        0x304 => B::DstAlpha,
        0x305 => B::OneMinusDstAlpha,
        0x306 => B::Dst,
        0x307 => B::OneMinusDst,
        0x308 => B::SrcAlphaSaturated,
        0x8001 | 0x8003 => B::Constant,
        0x8002 | 0x8004 => B::OneMinusConstant,
        _ => B::One,
    }
}

pub fn blend_op(e: u32) -> wgpu::BlendOperation {
    use wgpu::BlendOperation as O;
    match e {
        0x800A => O::Subtract,
        0x800B => O::ReverseSubtract,
        0x8007 => O::Min,
        0x8008 => O::Max,
        _ => O::Add,
    }
}

pub fn uses_constant(s: &State) -> bool {
    s.blend && s.blend_func.iter().any(|f| (0x8001..=0x8004).contains(f))
}

pub fn compare(f: u32) -> wgpu::CompareFunction {
    use wgpu::CompareFunction as C;
    // GL enums (0x200..) and three's compare constants (512.. are the same numbers).
    match f {
        0x200 => C::Never,
        0x201 => C::Less,
        0x202 => C::Equal,
        0x203 => C::LessEqual,
        0x204 => C::Greater,
        0x205 => C::NotEqual,
        0x206 => C::GreaterEqual,
        _ => C::Always,
    }
}

pub fn blend_state(s: &State) -> Option<wgpu::BlendState> {
    if !s.blend {
        return None;
    }
    // MIN/MAX ignore the factors in GL; WebGPU requires them to be One.
    let comp = |op: u32, src: u32, dst: u32| {
        let operation = blend_op(op);
        if matches!(operation, wgpu::BlendOperation::Min | wgpu::BlendOperation::Max) {
            wgpu::BlendComponent { src_factor: wgpu::BlendFactor::One, dst_factor: wgpu::BlendFactor::One, operation }
        } else {
            wgpu::BlendComponent { src_factor: blend_factor(src), dst_factor: blend_factor(dst), operation }
        }
    };
    Some(wgpu::BlendState { color: comp(s.blend_eq[0], s.blend_func[0], s.blend_func[1]), alpha: comp(s.blend_eq[1], s.blend_func[2], s.blend_func[3]) })
}

pub fn write_mask(s: &State) -> wgpu::ColorWrites {
    let mut w = wgpu::ColorWrites::empty();
    if s.color_mask[0] {
        w |= wgpu::ColorWrites::RED;
    }
    if s.color_mask[1] {
        w |= wgpu::ColorWrites::GREEN;
    }
    if s.color_mask[2] {
        w |= wgpu::ColorWrites::BLUE;
    }
    if s.color_mask[3] {
        w |= wgpu::ColorWrites::ALPHA;
    }
    w
}

/// Face culling and winding. The vertex shaders flip clip-space y so render targets keep GL's
/// memory layout, which reverses screen-space winding: GL's CCW front is wgpu's CW.
pub fn primitive(s: &State) -> wgpu::PrimitiveState {
    let front_face = if s.front_face == 0x900 { wgpu::FrontFace::Ccw } else { wgpu::FrontFace::Cw };
    let cull_mode = if !s.cull {
        None
    } else {
        match s.cull_face {
            0x404 => Some(wgpu::Face::Front),
            0x405 => Some(wgpu::Face::Back),
            _ => None, // FRONT_AND_BACK draws nothing; three never sets it
        }
    };
    wgpu::PrimitiveState { topology: wgpu::PrimitiveTopology::TriangleList, strip_index_format: None, front_face, cull_mode, unclipped_depth: false, polygon_mode: wgpu::PolygonMode::Fill, conservative: false }
}

pub fn depth_state(s: &State, format: wgpu::TextureFormat) -> wgpu::DepthStencilState {
    let (compare, write) = if s.depth_test { (compare(s.depth_func), s.depth_mask) } else { (wgpu::CompareFunction::Always, false) };
    let bias = match s.polygon_offset {
        Some([factor, units]) => wgpu::DepthBiasState { constant: units as i32, slope_scale: factor, clamp: 0.0 },
        None => wgpu::DepthBiasState::default(),
    };
    wgpu::DepthStencilState { format, depth_write_enabled: Some(write), depth_compare: Some(compare), stencil: wgpu::StencilState::default(), bias }
}

/// three's wrap constants.
pub fn address(w: Option<u32>) -> wgpu::AddressMode {
    match w {
        Some(1000) => wgpu::AddressMode::Repeat,
        Some(1002) => wgpu::AddressMode::MirrorRepeat,
        _ => wgpu::AddressMode::ClampToEdge,
    }
}

/// three's filter constants: (filter, mipmap filter, uses mipmaps).
pub fn filter(f: Option<u32>) -> (wgpu::FilterMode, wgpu::MipmapFilterMode, bool) {
    use wgpu::{FilterMode as F, MipmapFilterMode as M};
    match f {
        Some(1003) => (F::Nearest, M::Nearest, false),
        Some(1004) => (F::Nearest, M::Nearest, true),
        Some(1005) => (F::Nearest, M::Linear, true),
        Some(1007) => (F::Linear, M::Nearest, true),
        Some(1008) => (F::Linear, M::Linear, true),
        _ => (F::Linear, M::Nearest, false),
    }
}

/// The format three gives this texture in GL, as wgpu. three uploads sRGB colour textures to
/// sRGB internal formats (decoded when sampled), and so does this.
pub fn texture_format(t: &Texture) -> Result<wgpu::TextureFormat, String> {
    use wgpu::TextureFormat as T;
    let format = t.format.as_ref().and_then(|v| v.as_u64()).unwrap_or(1023) as u32;
    let ty = t.kind_type.unwrap_or(1009);
    let srgb = t.color_space.as_deref() == Some("srgb");
    if t.is_compressed {
        return Ok(match format {
            36492 => if srgb { T::Bc7RgbaUnormSrgb } else { T::Bc7RgbaUnorm },
            33776 => if srgb { T::Bc1RgbaUnormSrgb } else { T::Bc1RgbaUnorm },
            33777 => if srgb { T::Bc1RgbaUnormSrgb } else { T::Bc1RgbaUnorm },
            33778 => if srgb { T::Bc2RgbaUnormSrgb } else { T::Bc2RgbaUnorm },
            33779 => if srgb { T::Bc3RgbaUnormSrgb } else { T::Bc3RgbaUnorm },
            other => return Err(format!("compressed format {other}")),
        });
    }
    if t.is_depth || format == 1026 || format == 1027 {
        return Ok(match (format, ty) {
            (1027, _) => T::Depth24PlusStencil8,
            (_, 1015) => T::Depth32Float,
            (_, 1012) => T::Depth16Unorm,
            _ => T::Depth24Plus,
        });
    }
    Ok(match (format, ty) {
        (1023, 1009) => if srgb { T::Rgba8UnormSrgb } else { T::Rgba8Unorm },
        (1023, 1016) => T::Rgba16Float,
        (1023, 1015) => T::Rgba32Float,
        (1028, 1009) => T::R8Unorm,
        (1028, 1016) => T::R16Float,
        (1028, 1015) => T::R32Float,
        (1030, 1009) => T::Rg8Unorm,
        (1030, 1016) => T::Rg16Float,
        (1030, 1015) => T::Rg32Float,
        (1031, 1013) | (1031, 1014) => T::R32Uint,
        (1033, 1013) | (1033, 1014) => T::Rgba32Uint,
        (f, ty) => return Err(format!("texture format {f} type {ty}")),
    })
}

pub fn vertex_format(array: &str, components: u32, normalized: bool, kind: char) -> Result<wgpu::VertexFormat, String> {
    use wgpu::VertexFormat as V;
    Ok(match (array, components, normalized, kind) {
        ("Float32Array", 1, _, 'f') => V::Float32,
        ("Float32Array", 2, _, 'f') => V::Float32x2,
        ("Float32Array", 3, _, 'f') => V::Float32x3,
        ("Float32Array", 4, _, 'f') => V::Float32x4,
        ("Uint16Array", 2, true, _) => V::Unorm16x2,
        ("Uint16Array", 4, true, _) => V::Unorm16x4,
        ("Uint8Array", 4, true, _) => V::Unorm8x4,
        ("Uint8Array", 2, true, _) => V::Unorm8x2,
        ("Int16Array", 2, true, _) => V::Snorm16x2,
        ("Int16Array", 4, true, _) => V::Snorm16x4,
        ("Int8Array", 4, true, _) => V::Snorm8x4,
        ("Uint32Array", 1, _, 'u') => V::Uint32,
        ("Int32Array", 1, _, 'i') => V::Sint32,
        (a, n, norm, k) => return Err(format!("vertex format {a} x{n} normalized={norm} for {k}")),
    })
}

/// Whether GL turns this attribute's integers into floats for a float input (`vertexAttribPointer`
/// with `normalized` false: 7 reads as 7.0). WebGPU has no vertex format that does, so such an
/// attribute is uploaded as Float32 ([`to_f32`]) and read with [`float_format`].
pub fn int_to_float(array: &str, normalized: bool, kind: char) -> bool {
    kind == 'f' && !normalized && !matches!(array, "Float32Array" | "Float64Array")
}

/// An integer attribute's data as little-endian Float32, value for value.
pub fn to_f32(array: &str, bytes: &[u8]) -> Vec<u8> {
    let values: Vec<f32> = match array {
        "Int8Array" => bytes.iter().map(|&b| b as i8 as f32).collect(),
        "Uint16Array" => bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]]) as f32).collect(),
        "Int16Array" => bytes.chunks_exact(2).map(|c| i16::from_le_bytes([c[0], c[1]]) as f32).collect(),
        "Uint32Array" => bytes.chunks_exact(4).map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]]) as f32).collect(),
        "Int32Array" => bytes.chunks_exact(4).map(|c| i32::from_le_bytes([c[0], c[1], c[2], c[3]]) as f32).collect(),
        _ => bytes.iter().map(|&b| b as f32).collect(),
    };
    bytemuck::cast_slice(&values).to_vec()
}

pub fn float_format(components: u32) -> wgpu::VertexFormat {
    match components {
        1 => wgpu::VertexFormat::Float32,
        2 => wgpu::VertexFormat::Float32x2,
        3 => wgpu::VertexFormat::Float32x3,
        _ => wgpu::VertexFormat::Float32x4,
    }
}

pub fn element_bytes(array: &str) -> u64 {
    match array {
        "Float64Array" => 8,
        "Float32Array" | "Uint32Array" | "Int32Array" => 4,
        "Uint16Array" | "Int16Array" => 2,
        _ => 1,
    }
}
