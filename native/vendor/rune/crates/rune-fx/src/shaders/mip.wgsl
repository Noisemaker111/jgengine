// Mask pyramid downsample: Jimenez 13-tap (CoD:AW 2014) from the level above. Smooth, no box seams.
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;

struct V {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> V {
    let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
    var o: V;
    o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
    o.uv = vec2f(p.x, 1.0 - p.y);
    return o;
}

fn s(uv: vec2f) -> vec4f { return textureSampleLevel(src, smp, uv, 0.0); }

@fragment
fn fs(in: V) -> @location(0) vec4f {
    let t = 1.0 / vec2f(textureDimensions(src, 0));
    let uv = in.uv;
    let a = s(uv + t * vec2f(-2.0, -2.0));
    let b = s(uv + t * vec2f(0.0, -2.0));
    let c = s(uv + t * vec2f(2.0, -2.0));
    let d = s(uv + t * vec2f(-1.0, -1.0));
    let e = s(uv + t * vec2f(1.0, -1.0));
    let f = s(uv + t * vec2f(-2.0, 0.0));
    let g = s(uv);
    let h = s(uv + t * vec2f(2.0, 0.0));
    let i = s(uv + t * vec2f(-1.0, 1.0));
    let j = s(uv + t * vec2f(1.0, 1.0));
    let k = s(uv + t * vec2f(-2.0, 2.0));
    let l = s(uv + t * vec2f(0.0, 2.0));
    let m = s(uv + t * vec2f(2.0, 2.0));
    return (d + e + i + j) * 0.125 + (a + b + g + f) * 0.03125 + (b + c + h + g) * 0.03125
         + (f + g + l + k) * 0.03125 + (g + h + m + l) * 0.03125;
}
