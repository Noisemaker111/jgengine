// Resolve: linear 16f -> sRGB 8-bit with TPDF dither (once, at the final write).
@group(0) @binding(0) var scene: texture_2d<f32>;

struct RV { @builtin(position) pos: vec4f }

@vertex
fn vs_full(@builtin(vertex_index) vi: u32) -> RV {
    let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
    var o: RV;
    o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
    return o;
}

fn pcg(v: u32) -> u32 {
    let s = v * 747796405u + 2891336453u;
    let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
    return (w >> 22u) ^ w;
}
fn u01(n: u32) -> f32 { return f32(pcg(n) >> 8u) * (1.0 / 16777216.0); }
fn to_srgb(c: vec3f) -> vec3f {
    let lo = c * 12.92;
    let hi = 1.055 * pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055;
    return select(hi, lo, c <= vec3f(0.0031308));
}

@fragment
fn fs_resolve(in: RV) -> @location(0) vec4f {
    let ip = vec2u(in.pos.xy);
    let c = textureLoad(scene, vec2i(ip), 0);
    let n = u01(ip.x + pcg(ip.y)) + u01(ip.x * 7919u + pcg(ip.y + 104729u)) - 1.0;
    let s = to_srgb(clamp(c.rgb, vec3f(0.0), vec3f(1.0))) + vec3f(n / 255.0);
    return vec4f(clamp(s, vec3f(0.0), vec3f(1.0)), 1.0);
}
