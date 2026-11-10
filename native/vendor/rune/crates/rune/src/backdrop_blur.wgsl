// Separable Gaussian over the copied backdrop region. Both axes stay at device resolution.
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

struct Level {
    // x: standard deviation in device pixels.
    w: vec4<f32>,
    // The region's bounds in the source's uv: min xy, max xy.
    region: vec4<f32>,
    // Source uv from target uv: uv * xy + zw.
    map: vec4<f32>,
    place: vec4<f32>,
};
@group(0) @binding(3) var<uniform> u: Level;

struct V {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> V {
    let p = vec2<f32>(f32((vi << 1u) & 2u), f32(vi & 2u));
    var o: V;
    o.pos = vec4<f32>(p * 2.0 - 1.0, 0.0, 1.0);
    o.uv = vec2<f32>(p.x, 1.0 - p.y);
    return o;
}

fn s(uv: vec2<f32>) -> vec4<f32> {
    let half_texel = 0.5 / vec2<f32>(textureDimensions(src));
    return textureSampleLevel(src, smp, clamp(uv, u.region.xy + half_texel, u.region.zw - half_texel), 0.0);
}

fn gaussian(uv: vec2<f32>, axis: vec2<f32>) -> vec4<f32> {
    let step = axis / vec2<f32>(textureDimensions(src));
    let sigma = max(u.w.x, 0.001);
    let factor = exp(-0.5 / (sigma * sigma));
    var weight = 1.0;
    var ratio = factor;
    var mass = 1.0;
    var color = s(uv);
    for (var tap = 1.0; tap <= ceil(3.0 * sigma); tap += 1.0) {
        weight *= ratio;
        ratio *= factor * factor;
        mass += 2.0 * weight;
        color += (s(uv + step * tap) + s(uv - step * tap)) * weight;
    }
    return color / mass;
}

@fragment
fn fs_down(in: V) -> @location(0) vec4<f32> {
    return gaussian(in.uv * u.map.xy + u.map.zw, vec2(1.0, 0.0));
}

@fragment
fn fs_up(in: V) -> @location(0) vec4<f32> {
    return gaussian(in.uv, vec2(0.0, 1.0));
}
