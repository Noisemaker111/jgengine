// Minimal UI stand-in for the gallery: rounded rects (gradient fill + hairline border), soft shadows, text.
struct U {
    rect: vec4f,   // px x, y, w, h
    p: vec4f,      // radius px, border px, kind (0 rect, 1 text, 2 shadow), sigma px
    fill: vec4f,   // premultiplied linear (top)
    fill2: vec4f,  // premultiplied linear (bottom)
    border: vec4f, // premultiplied linear
    uv: vec4f,     // atlas uv rect
    vp: vec4f,     // viewport px
}

@group(0) @binding(0) var<storage, read> us: array<U>;
@group(0) @binding(1) var atlas: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

struct V {
    @builtin(position) pos: vec4f,
    @location(0) @interpolate(flat) id: u32,
    @location(1) px: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> V {
    let u = us[ii];
    var m = 1.0;
    if (u.p.z > 1.5) { m = u.p.w * 3.5 + 1.0; }
    let corner = vec2f(f32(vi & 1u), f32((vi >> 1u) & 1u));
    let px = u.rect.xy - m + (u.rect.zw + 2.0 * m) * corner;
    var o: V;
    o.pos = vec4f(px.x / u.vp.x * 2.0 - 1.0, 1.0 - px.y / u.vp.y * 2.0, 0.0, 1.0);
    o.id = ii;
    o.px = px;
    return o;
}

fn sd_rrect(q: vec2f, half: vec2f, r: f32) -> f32 {
    let rr = clamp(r, 0.0, min(half.x, half.y));
    let k = abs(q) - half + rr;
    return length(max(k, vec2f(0.0))) + min(max(k.x, k.y), 0.0) - rr;
}
fn erf_approx(x: f32) -> f32 {
    let x2 = x * x;
    let a = 0.147;
    let v = sqrt(1.0 - exp(-x2 * (1.2732395 + a * x2) / (1.0 + a * x2)));
    return select(-v, v, x >= 0.0);
}

@fragment
fn fs(in: V) -> @location(0) vec4f {
    let u = us[in.id];
    let half = u.rect.zw * 0.5;
    let q = in.px - u.rect.xy - half;
    let d = sd_rrect(q, half, u.p.x);
    let kind = i32(u.p.z + 0.5);
    if (kind == 1) {
        let uv = mix(u.uv.xy, u.uv.zw, (in.px - u.rect.xy) / u.rect.zw);
        let a = textureSampleLevel(atlas, smp, uv, 0.0).r;
        return u.fill * pow(a, 0.85);
    }
    if (kind == 2) {
        let a = 0.5 - 0.5 * erf_approx(d / (max(u.p.w, 0.1) * 1.41421));
        return u.fill * a;
    }
    let cov = clamp(0.5 - d, 0.0, 1.0);
    let t = clamp((in.px.y - u.rect.y) / max(u.rect.w, 1.0), 0.0, 1.0);
    let fill = mix(u.fill, u.fill2, t);
    let bw = u.p.y;
    var o = fill * cov;
    if (bw > 0.0) {
        let inner = clamp(0.5 - (d + bw), 0.0, 1.0);
        let band = cov - inner;
        o = o * (1.0 - u.border.a * band) + u.border * band;
    }
    return o;
}

