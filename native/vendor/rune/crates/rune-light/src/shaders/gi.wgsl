// 2D radiance cascades (Sannikov; GM Shaders and Jason McGhee's write-ups), over the same analytic field.
//
// Scene: two gi-resolution media textures built from the analytic primitives with sub-texel coverage, so an
// emitter moving by a fraction of a texel changes the light by that fraction instead of popping a whole texel:
//   emit: rgb = σ·L of emitters (emission density), a = σ (emitters are nearly opaque glowing media),
//   occ:  rgb = coverage × the light a card re-emits (one bounce in its albedo), a = card coverage.
// A card absorbs only rays from probes standing lower than its top (light reaches a card from things standing on
// it); its top comes from the field. An optional full-resolution emission texture (effects such as electric arcs)
// adds emission-only medium. The march samples the media bilinearly.
//
// Cascade n: probes every 2^n texels, 4·4^n directions stored as a 2^(n+1) square block per probe, each ray
// covering [a(4^n − 1)/3, a(4^(n+1) − 1)/3]. Rays sphere trace through empty space with the field's gi distance.
// Merging runs top down: a ray that isn't fully absorbed adds the bilinearly interpolated, four-direction mean
// of cascade n+1. Fluence is cascade 0's four directions averaged. Cost is fixed by the grid, not the emitters.

@group(0) @binding(0) var<uniform> F: Frame;

const SIGMA_EMIT: f32 = 1.5;

// ---- scene ----
@group(1) @binding(0) var<storage, read> prims: array<Prim>;
@group(1) @binding(1) var<storage, read> lights: array<Light>;
@group(1) @binding(2) var vis: texture_2d_array<f32>;
@group(1) @binding(3) var extra: texture_2d<f32>;
@group(1) @binding(4) var lin: sampler;
@group(1) @binding(5) var out_emit: texture_storage_2d<rgba16float, write>;
@group(1) @binding(6) var out_occ: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn scene(@builtin(global_invocation_id) gid: vec3<u32>) {
    let gs = vec2<u32>(F.gs.xy);
    if (gid.x >= gs.x || gid.y >= gs.y) {
        return;
    }
    let texel = 1.0 / F.gs.w;
    let p = (vec2<f32>(gid.xy) + 0.5) * texel;
    var em = vec4<f32>(0.0);
    var oc = vec4<f32>(0.0);
    let n = F.counts.x;
    for (var i = 0u; i < n; i = i + 1u) {
        let pr = prims[i];
        let fl = flags_of(pr);
        if ((fl & (F_EMIT | F_OCC)) == 0u) {
            continue;
        }
        let half = pr.rect.zw * 0.5;
        let c = pr.rect.xy + half;
        if (any(abs(p - c) > half + vec2<f32>(texel))) {
            continue;
        }
        // Box-filtered coverage of the texel by the rounded rect (exact for straight edges).
        let cov = clamp(0.5 - sd_rrect(p - c, half, pr.radii) / texel, 0.0, 1.0);
        if (cov <= 0.0) {
            continue;
        }
        // Painter's order: each primitive lies over what came before it.
        if ((fl & F_EMIT) != 0u) {
            em = mix(em, vec4<f32>(pr.emit.rgb * SIGMA_EMIT, SIGMA_EMIT), cov);
            oc = oc * (1.0 - cov);
        } else {
            var e = vec3<f32>(0.0);
            if (F.gi.z > 0.0) {
                // One bounce: the direct light on this card, re-emitted in its albedo.
                let P = vec3<f32>(p, pr.z.y);
                let fp = clamp(vec2<i32>(p * F.gs.z), vec2<i32>(0), vec2<i32>(F.sf.zw) - vec2<i32>(1));
                let nl = min(F.counts.y, 8u);
                for (var li = 0u; li < nl; li = li + 1u) {
                    let L = lights[li];
                    let lt = light_term(L, P);
                    let v = textureLoad(vis, fp, i32(li / 4u), 0)[li % 4u];
                    e = e + L.color.rgb * lt.w * max(lt.z, 0.0) * v;
                }
            }
            em = em * (1.0 - cov);
            oc = mix(oc, vec4<f32>(pr.albedo.rgb * e * F.gi.z, 1.0), cov);
        }
    }
    // Extra emission (full resolution): the box mean over this texel from 4×4 bilinear taps, emission-only.
    if ((F.counts.w & 16u) != 0u) {
        let sz = F.sf.xy;
        var acc = vec3<f32>(0.0);
        for (var k = 0; k < 16; k = k + 1) {
            let o = (vec2<f32>(f32(k & 3), f32(k >> 2u)) - 1.5) * 0.25 * texel;
            acc = acc + textureSampleLevel(extra, lin, (p + o) / sz, 0.0).rgb;
        }
        em = vec4<f32>(em.rgb + acc / 16.0 * F.ext.y, em.a);
    }
    textureStore(out_emit, gid.xy, em);
    textureStore(out_occ, gid.xy, oc);
}

// ---- cascades ----
struct Cascade {
    n: u32,
    count: u32,
    merge: u32,
    pad1: u32,
};
@group(1) @binding(0) var<uniform> C: Cascade;
@group(1) @binding(1) var scene_emit: texture_2d<f32>;
@group(1) @binding(2) var scene_occ: texture_2d<f32>;
@group(1) @binding(3) var field: texture_2d<f32>;
@group(1) @binding(4) var samp: sampler;
@group(1) @binding(5) var upper: texture_2d<f32>;
@group(1) @binding(6) var out_c: texture_storage_2d<rgba16float, write>;
@group(1) @binding(7) var gb0: texture_2d<f32>;

// Radiance and transmittance along a → b (gi texels) for a probe standing at height zp.
fn march(a: vec2<f32>, b: vec2<f32>, zp: f32, inner: f32) -> vec4<f32> {
    let gsz = F.gs.xy;
    let D = b - a;
    let len = length(D);
    if (len < 1e-4) {
        return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }
    let dir = D / len;
    var rad = vec3<f32>(0.0);
    var T = 1.0;
    var t = 0.0;
    for (var i = 0; i < 48; i = i + 1) {
        if (t >= len || T < 0.01) {
            break;
        }
        let q = a + dir * t;
        if (any(q < vec2<f32>(0.0)) || any(q > gsz)) {
            break;
        }
        let f = textureSampleLevel(field, samp, (q / F.gs.w) * F.gs.z / F.sf.zw, 0.0);
        // Distances in gi texels: to the nearest emitter, and to the occluder boundary. Space is empty unless an
        // emitter is near or the ray is near or inside a card that stands taller than the probe: outside cards
        // that's the nearer boundary; inside a card the probe sees over, it's the card's own boundary.
        let de = f.w * F.gs.w;
        let dx = f.x * F.gs.w;
        let tall = f.z > zp + 0.5;
        var free = min(de, abs(dx));
        if (dx < 0.0 && tall) {
            free = 0.0;
        }
        if (free > 1.0) {
            t = t + max(free - 0.5, 1.0);
            continue;
        }
        let step = min(inner, len - t);
        let uv = (q + dir * step * 0.5) / gsz;
        let em = textureSampleLevel(scene_emit, samp, uv, 0.0);
        let oc = textureSampleLevel(scene_occ, samp, uv, 0.0);
        // Cards only absorb rays from probes lower than their top.
        let blocks = F.gi.w * smoothstep(zp, zp + 1.0, f.z);
        let sigma = em.a + oc.a * blocks;
        let e = em.rgb + oc.rgb * blocks;
        let tr = exp(-sigma * step);
        let k = select(step, (1.0 - tr) / sigma, sigma > 1e-4);
        rad = rad + T * e * k;
        T = T * tr;
        t = t + step;
    }
    return vec4<f32>(rad, T);
}

@compute @workgroup_size(8, 8)
fn cascade(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = C.n;
    let s = 1u << n;
    let b = 2u << n;
    let probes = vec2<u32>(F.gs.xy) / s;
    let probe = gid.xy / b;
    if (probe.x >= probes.x || probe.y >= probes.y) {
        return;
    }
    let sub = gid.xy % b;
    let di = sub.y * b + sub.x;
    let nd = b * b;
    let ang = (f32(di) + 0.5) / f32(nd) * TAU;
    let dir = vec2<f32>(cos(ang), sin(ang));
    let origin = (vec2<f32>(probe) + 0.5) * f32(s);
    let pix = clamp(vec2<i32>(origin / F.gs.w), vec2<i32>(0), vec2<i32>(F.sf.xy) - vec2<i32>(1));
    let zp = textureLoad(gb0, pix, 0).w;
    let p4 = f32(1u << (2u * n));
    let t0 = (p4 - 1.0) / 3.0;
    let t1 = (p4 * 4.0 - 1.0) / 3.0;
    let inner = max(1.0, f32(s) * 0.5);
    let a = origin + dir * t0;
    var r = vec4<f32>(0.0);
    if (n + 1u < C.count) {
        // Bilinear fix (Sannikov): one ray to each of the four upper probes' interval starts, each merged with
        // that probe's radiance, so light never leaks across an occluder between probes. Without the merge
        // (inspection), the same four rays stop at the upper probes' interval starts: this cascade's own interval.
        let us = s * 2u;
        let ub = b * 2u;
        let uprobes = vec2<i32>(vec2<u32>(F.gs.xy) / us);
        let f = origin / f32(us) - 0.5;
        let base = vec2<i32>(floor(f));
        let w = fract(f);
        for (var k = 0; k < 4; k = k + 1) {
            let o = vec2<i32>(k & 1, k >> 1u);
            let q = clamp(base + o, vec2<i32>(0), uprobes - vec2<i32>(1));
            let wk = select(1.0 - w.x, w.x, o.x == 1) * select(1.0 - w.y, w.y, o.y == 1);
            let uo = (vec2<f32>(q) + 0.5) * f32(us);
            let seg = march(a, uo + dir * t1, zp, inner);
            var far = vec3<f32>(0.0);
            if (C.merge != 0u) {
                for (var j = 0u; j < 4u; j = j + 1u) {
                    let idx = di * 4u + j;
                    let tex = q * i32(ub) + vec2<i32>(i32(idx % ub), i32(idx / ub));
                    far = far + textureLoad(upper, tex, 0).rgb;
                }
            }
            r = r + wk * vec4<f32>(seg.rgb + seg.a * far * 0.25, seg.a);
        }
    } else {
        r = march(a, origin + dir * t1, zp, inner);
    }
    textureStore(out_c, gid.xy, r);
}

// ---- fluence ----
@group(1) @binding(0) var c0: texture_2d<f32>;
@group(1) @binding(1) var out_f: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn fluence(@builtin(global_invocation_id) gid: vec3<u32>) {
    let gs = vec2<u32>(F.gs.xy);
    if (gid.x >= gs.x || gid.y >= gs.y) {
        return;
    }
    let b = vec2<i32>(gid.xy) * 2;
    let v = textureLoad(c0, b, 0) + textureLoad(c0, b + vec2<i32>(1, 0), 0) + textureLoad(c0, b + vec2<i32>(0, 1), 0)
        + textureLoad(c0, b + vec2<i32>(1, 1), 0);
    textureStore(out_f, gid.xy, vec4<f32>(v.rgb * 0.25, 1.0));
}
