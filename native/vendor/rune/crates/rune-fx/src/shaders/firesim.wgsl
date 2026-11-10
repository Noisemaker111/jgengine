// Fire and smoke as a small 2D stable-fluids simulation (Stam 1999), one grid per fire layer.
// State S (rgba16f): velocity (pt/s, screen axes, y down), temperature (0..~1.2), smoke density.
// One step = curl -> forces (buoyancy, vorticity confinement, sway, emission, cooling, smoke)
// -> divergence -> Jacobi pressure -> projection -> MacCormack advection.

struct P {
    dims: vec4f,   // nx, ny, cell (pt), dt
    origin: vec4f, // domain x0, y0 (pt), time (s), reset (1 = treat previous state as empty)
    shape: vec4f,  // centre x, y, half w, half h (pt)
    shape2: vec4f, // radius, seed, rise speed (pt/s), tongue spacing (pt)
    fire: vec4f,   // buoyancy (pt/s^2), cooling (1/s), smoke rate, vorticity
    fire2: vec4f,  // sway (pt/s^2), flicker speed, smoke fade (1/s), source depth (pt)
}

@group(0) @binding(0) var<uniform> u: P;
@group(0) @binding(1) var s_in: texture_2d<f32>;
@group(0) @binding(3) var s_out: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var a_in: texture_2d<f32>;
@group(0) @binding(5) var b_in: texture_2d<f32>;
@group(0) @binding(6) var r_out: texture_storage_2d<r32float, write>;

fn n() -> vec2i { return vec2i(u.dims.xy); }
fn inside(c: vec2i) -> bool { return all(c >= vec2i(0)) && all(c < n()); }
fn cl(c: vec2i) -> vec2i { return clamp(c, vec2i(0), n() - 1); }
fn ld(c: vec2i) -> vec4f {
    if (u.origin.w > 0.5) { return vec4f(0.0); }
    return textureLoad(s_in, cl(c), 0);
}
fn la(c: vec2i) -> f32 { return textureLoad(a_in, cl(c), 0).r; }
fn lb(c: vec2i) -> f32 { return textureLoad(b_in, cl(c), 0).r; }
fn pos(c: vec2i) -> vec2f { return u.origin.xy + (vec2f(c) + 0.5) * u.dims.z; }

fn sd_rrect(p: vec2f) -> f32 {
    let r = min(u.shape2.x, min(u.shape.z, u.shape.w));
    let q = abs(p - u.shape.xy) - u.shape.zw + r;
    return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}
fn solid(c: vec2i) -> bool { return sd_rrect(pos(c)) < -u.fire2.w - 1.0; }

fn pcg(v: u32) -> u32 {
    let s = v * 747796405u + 2891336453u;
    let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
    return (w >> 22u) ^ w;
}
fn hash2(c: vec2i, seed: u32) -> f32 {
    return f32(pcg(u32(c.x) ^ pcg(u32(c.y) ^ pcg(seed))) >> 8u) * (1.0 / 16777216.0);
}
fn vnoise(p: vec2f, seed: u32) -> f32 {
    let i = vec2i(floor(p));
    let f = fract(p);
    let w = f * f * (3.0 - 2.0 * f);
    let a = hash2(i, seed);
    let b = hash2(i + vec2i(1, 0), seed);
    let c = hash2(i + vec2i(0, 1), seed);
    let d = hash2(i + vec2i(1, 1), seed);
    return mix(mix(a, b, w.x), mix(c, d, w.x), w.y) * 2.0 - 1.0;
}

@compute @workgroup_size(8, 8)
fn curl(@builtin(global_invocation_id) id: vec3u) {
    let c = vec2i(id.xy);
    if (!inside(c)) { return; }
    let h = u.dims.z;
    let w = (ld(c + vec2i(1, 0)).y - ld(c - vec2i(1, 0)).y - ld(c + vec2i(0, 1)).x + ld(c - vec2i(0, 1)).x) / (2.0 * h);
    textureStore(r_out, c, vec4f(w, 0.0, 0.0, 0.0));
}

// Fuel along the edge: tongues of uneven strength with dark gaps between them, which wander and
// pulse slowly, plus a fast flicker so tongues pinch off.
fn emission(x: f32, t: f32, seed: u32) -> f32 {
    let sp = max(u.shape2.w * 0.32, 3.5);
    let fs = u.fire2.y;
    let slow = vnoise(vec2f(x / sp, t * 0.55 * fs), seed) * 0.7 + vnoise(vec2f(x / sp * 2.3 + 5.1, t * 1.1 * fs), seed + 1u) * 0.3;
    let fast = vnoise(vec2f(x / sp * 1.7 + 11.0, t * 6.0 * fs), seed + 2u);
    // Thinner and shorter toward the rounded ends, gone before the sides.
    let r = min(u.shape2.x, min(u.shape.z, u.shape.w));
    let ends = 1.0 - smoothstep(u.shape.z - r * 1.6, u.shape.z - r * 0.35, abs(x - u.shape.x));
    return smoothstep(-0.1, 0.4, slow + 0.25 * fast) * ends;
}

// Where fuel burns: a thin band along the upward-facing edge, under the node's border.
fn fuel_band(p: vec2f) -> f32 {
    let h = u.dims.z;
    let d = sd_rrect(p);
    let e2 = vec2f(0.5 * h, 0.0);
    let gx = sd_rrect(p + e2) - sd_rrect(p - e2);
    let gy = sd_rrect(p + e2.yx) - sd_rrect(p - e2.yx);
    let up = clamp(-gy / max(length(vec2f(gx, gy)), 1e-4), 0.0, 1.0);
    let depth = u.fire2.w;
    return smoothstep(-depth - 1.5, -depth + 0.5, d) * (1.0 - smoothstep(0.0, h + 1.5, d)) * smoothstep(0.35, 0.8, up);
}

@compute @workgroup_size(8, 8)
fn forces(@builtin(global_invocation_id) id: vec3u) {
    let c = vec2i(id.xy);
    if (!inside(c)) { return; }
    let dt = u.dims.w;
    let h = u.dims.z;
    let t = u.origin.z;
    let seed = u32(u.shape2.y);
    var s = ld(c);
    var v = s.xy;
    var T = s.z;
    var sm = s.w;
    let p = pos(c);

    // Buoyancy: hot gas rises, smoke is a little heavy.
    v.y -= dt * (u.fire.x * T - u.fire.x * 0.12 * sm);

    // Vorticity confinement puts back the small curls numerical diffusion removes.
    if (u.origin.w < 0.5) {
        let wl = abs(la(c - vec2i(1, 0)));
        let wr = abs(la(c + vec2i(1, 0)));
        let wu = abs(la(c - vec2i(0, 1)));
        let wd = abs(la(c + vec2i(0, 1)));
        var g = vec2f(wr - wl, wd - wu) / (2.0 * h);
        let gl = length(g);
        if (gl > 1e-4) {
            g /= gl;
            let w = la(c);
            // Smooth near the base, more broken higher up (as in real flames).
            let lift = clamp((u.shape.y - u.shape.w - pos(c).y) / max(u.shape2.z * 0.4, 8.0), 0.15, 1.0);
            v += dt * u.fire.w * lift * h * vec2f(g.y * w, -g.x * w);
        }
    }

    // Slow sideways sway of the whole column, stronger higher up.
    let above = u.shape.y - u.shape.w - p.y;
    let sway = vnoise(vec2f(p.x / 90.0, t * 0.35 * u.fire2.y), seed + 9u) + 0.5 * vnoise(vec2f(p.x / 30.0 + 3.0, p.y / 40.0 - t * 0.9 * u.fire2.y), seed + 10u);
    v.x += dt * u.fire2.x * sway * clamp(above / 40.0, 0.0, 1.0);

    let band = fuel_band(p);
    if (band > 0.0) {
        let e = emission(p.x, t, seed) * band;
        T = max(T, e * (0.95 + 0.25 * vnoise(vec2f(p.x / 3.0, t * 9.0), seed + 4u)));
        v.y = mix(v.y, -u.shape2.z * (0.6 + 0.6 * e), e * 0.6);
    }

    // Cooling, and the smoke the cooling flame leaves behind.
    let cool = 1.0 - exp(-dt * u.fire.y);
    let lost = T * cool;
    T -= lost;
    // Smoke is what is left once the flame has cooled past visible.
    sm += lost * u.fire.z * (1.0 - smoothstep(0.25, 0.55, T));
    sm *= exp(-dt * u.fire2.z);

    if (solid(c)) {
        v = vec2f(0.0);
        T *= 0.5;
        sm = 0.0;
    }
    // Hot gas is carried up far faster than it drifts sideways: damping sideways motion where
    // it burns keeps tongues upright instead of the whole row merging into one plume.
    v.x *= exp(-dt * 7.0 * smoothstep(0.1, 0.6, T));
    // Let everything leave cleanly through the top and sides.
    let edge = min(min(f32(c.x), f32(n().x - 1 - c.x)), f32(c.y));
    let fade = smoothstep(0.0, 4.0, edge);
    T *= fade;
    sm *= fade;
    textureStore(s_out, c, vec4f(v, T, sm));
}

@compute @workgroup_size(8, 8)
fn divergence(@builtin(global_invocation_id) id: vec3u) {
    let c = vec2i(id.xy);
    if (!inside(c)) { return; }
    let h = u.dims.z;
    let l = select(textureLoad(s_in, cl(c - vec2i(1, 0)), 0).x, 0.0, solid(c - vec2i(1, 0)));
    let r = select(textureLoad(s_in, cl(c + vec2i(1, 0)), 0).x, 0.0, solid(c + vec2i(1, 0)));
    let t = select(textureLoad(s_in, cl(c - vec2i(0, 1)), 0).y, 0.0, solid(c - vec2i(0, 1)));
    let b = select(textureLoad(s_in, cl(c + vec2i(0, 1)), 0).y, 0.0, solid(c + vec2i(0, 1)));
    // Burning gas expands: the fuel band is a source, so the projection pushes the flame up and
    // away from the edge instead of cancelling the rise against the wall below.
    let src = fuel_band(pos(c)) * emission(pos(c).x, u.origin.z, u32(u.shape2.y)) * u.shape2.z * 0.2 / h;
    textureStore(r_out, c, vec4f((r - l + b - t) / (2.0 * h) - src, 0.0, 0.0, 0.0));
}

// a_in = pressure, b_in = divergence. Open (p = 0) above the domain, closed elsewhere.
fn pn(c: vec2i, centre: f32) -> f32 {
    if (c.y < 0) { return 0.0; }
    if (!inside(c) || solid(c)) { return centre; }
    return la(c);
}

@compute @workgroup_size(8, 8)
fn jacobi(@builtin(global_invocation_id) id: vec3u) {
    let c = vec2i(id.xy);
    if (!inside(c)) { return; }
    let h = u.dims.z;
    let pc = la(c);
    let s = pn(c - vec2i(1, 0), pc) + pn(c + vec2i(1, 0), pc) + pn(c - vec2i(0, 1), pc) + pn(c + vec2i(0, 1), pc);
    textureStore(r_out, c, vec4f((s - h * h * lb(c)) * 0.25, 0.0, 0.0, 0.0));
}

@compute @workgroup_size(8, 8)
fn project(@builtin(global_invocation_id) id: vec3u) {
    let c = vec2i(id.xy);
    if (!inside(c)) { return; }
    let h = u.dims.z;
    var s = textureLoad(s_in, c, 0);
    let pc = la(c);
    let g = vec2f(pn(c + vec2i(1, 0), pc) - pn(c - vec2i(1, 0), pc), pn(c + vec2i(0, 1), pc) - pn(c - vec2i(0, 1), pc)) / (2.0 * h);
    var v = s.xy - g;
    if (solid(c)) { v = vec2f(0.0); }
    // Keep a hitch from blowing the sim up.
    let vl = length(v);
    let vmax = 2.0 * h / u.dims.w;
    if (vl > vmax) { v *= vmax / vl; }
    textureStore(s_out, c, vec4f(v, s.z, s.w));
}

fn cr(t: f32) -> vec4f {
    // Catmull-Rom weights for the 4 taps around t in [0, 1).
    let t2 = t * t;
    let t3 = t2 * t;
    return vec4f(-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1.0, -1.5 * t3 + 2.0 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2);
}

// Monotone cubic sample (Catmull-Rom clamped to the 4 nearest texels): far less smearing than
// bilinear, so tongues stay sharp as they rise, and no overshoot.
fn sample_cubic(p: vec2f) -> vec4f {
    let g = (p - u.origin.xy) / u.dims.z - 0.5;
    let i0 = vec2i(floor(g));
    let f = g - floor(g);
    let wx = cr(f.x);
    let wy = cr(f.y);
    var acc = vec4f(0.0);
    for (var y = 0; y < 4; y++) {
        var row = vec4f(0.0);
        for (var x = 0; x < 4; x++) {
            row += wx[x] * textureLoad(s_in, cl(i0 + vec2i(x - 1, y - 1)), 0);
        }
        acc += wy[y] * row;
    }
    let q0 = textureLoad(s_in, cl(i0), 0);
    let q1 = textureLoad(s_in, cl(i0 + vec2i(1, 0)), 0);
    let q2 = textureLoad(s_in, cl(i0 + vec2i(0, 1)), 0);
    let q3 = textureLoad(s_in, cl(i0 + vec2i(1, 1)), 0);
    return clamp(acc, min(min(q0, q1), min(q2, q3)), max(max(q0, q1), max(q2, q3)));
}

@compute @workgroup_size(8, 8)
fn advect(@builtin(global_invocation_id) id: vec3u) {
    let c = vec2i(id.xy);
    if (!inside(c)) { return; }
    let p = pos(c);
    let v = textureLoad(s_in, c, 0).xy;
    // Two-stage (midpoint) back-trace so curling flow doesn't spiral outward.
    let mid = p - 0.5 * u.dims.w * v;
    let vm = sample_cubic(mid).xy;
    let r = sample_cubic(p - u.dims.w * vm);
    textureStore(s_out, c, vec4f(r.xy, max(r.z, 0.0), max(r.w, 0.0)));
}
