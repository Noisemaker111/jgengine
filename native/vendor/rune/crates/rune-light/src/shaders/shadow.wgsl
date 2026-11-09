// Soft visibility of every light, sphere traced through the scene distance field.
//
// Occluders are extruded rounded rects (slabs from z bottom to z top) standing on the UI plane. A receiver P
// (the surface's own top) traces toward the light's centre; at each step the 3D clearance h to the nearest slab
// against the cone to a spherical source of radius R (half-angle R / D) gives the penumbra, as in Arcade's
// capsule shadows (packages/kit/gpu/shadows/capsule-shadows.ts:508-527: k = 0.5 + 0.5 h / (t θ), smoothstep).
// Aaltonen's closest-approach refinement of Quílez's estimate stops sphere-tracing steps from banding the
// penumbra. Penumbrae harden toward contact for free: t → 0 makes the cone vanish.
//
// Shafts ("air") trace the same field along a horizontal ray at the light's own height, so a light standing
// lower than the cards throws flatland wedges: god rays through every gap.

@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> lights: array<Light>;
@group(0) @binding(2) var field: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;
@group(0) @binding(4) var gb0: texture_2d<f32>;
@group(0) @binding(5) var out_vis: texture_storage_2d_array<rgba16float, write>;
@group(0) @binding(6) var out_air: texture_storage_2d_array<rgba16float, write>;

fn field_at(q: vec2<f32>) -> vec4<f32> {
    return textureSampleLevel(field, samp, q * F.gs.z / F.sf.zw, 0.0);
}

fn slab(f: vec4<f32>, z: f32) -> f32 {
    let dz = max(z - f.z, f.y - z);
    let a = vec2<f32>(f.x, dz);
    return length(max(a, vec2<f32>(0.0))) + min(max(a.x, a.y), 0.0);
}

fn trace(P: vec3<f32>, L: vec3<f32>, radius: f32, t_start: f32, zcut: bool) -> f32 {
    let D = L - P;
    let dist = length(D);
    if (dist < 1e-3) {
        return 1.0;
    }
    let rd = D / dist;
    let theta = max(radius / dist, 1e-3);
    let zmax = F.misc.x + 0.5;
    var t = t_start;
    var res = 1.0;
    var ph = 1e10;
    let t_end = dist - radius;
    for (var i = 0; i < 64; i = i + 1) {
        if (t >= t_end) {
            break;
        }
        let q = P + rd * t;
        if (zcut && rd.z >= 0.0 && q.z > zmax) {
            break;
        }
        let h = slab(field_at(q.xy), q.z);
        if (h <= 0.0) {
            res = min(res, h / (t * theta));
        } else {
            let y = h * h / (2.0 * ph);
            let dd = sqrt(max(h * h - y * y, 0.0));
            res = min(res, dd / (max(t - y, 1e-3) * theta));
        }
        ph = max(h, 1e-3);
        if (res <= -1.0) {
            break;
        }
        // Inside a slab, walk through in small steps; outside, the clearance is a safe step. A floor that
        // grows with t keeps the step count bounded on long rays.
        t = t + clamp(abs(h), 0.6 + t * 0.012, 96.0);
    }
    let k = clamp(0.5 + 0.5 * res, 0.0, 1.0);
    return k * k * (3.0 - 2.0 * k);
}

// God rays from a light behind the UI (Mitchell, GPU Gems 3 ch. 13, done in the field instead of a blurred
// buffer): the light's glow shows only through gaps between occluders, and each pixel integrates that masked glow
// along its path to the light. The mask is prefiltered to the sample spacing, so edges never band into steps.
fn shaft(p: vec2<f32>, L: Light) -> f32 {
    let D = L.pos.xy - p;
    let len = length(D);
    let R = max(L.pos.w * L.extra.w, 1.0);
    let n = 48;
    let step = len / f32(n);
    let w = max(step * 0.6, 2.0);
    var acc = 0.0;
    for (var i = 0; i < n; i = i + 1) {
        let q = p + D * ((f32(i) + 0.5) / f32(n));
        let open = smoothstep(-w, w, field_at(q).x);
        let r = length(L.pos.xy - q);
        acc = acc + open * R * R / (r * r + R * R);
    }
    return acc / f32(n);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let fs = vec2<u32>(F.sf.zw);
    if (gid.x >= fs.x || gid.y >= fs.y) {
        return;
    }
    let p = (vec2<f32>(gid.xy) + 0.5) / F.gs.z;
    let pix = clamp(vec2<i32>(p), vec2<i32>(0), vec2<i32>(F.sf.xy) - vec2<i32>(1));
    let zr = textureLoad(gb0, pix, 0).w + 0.35;
    let P = vec3<f32>(p, zr);
    let shafts = (F.counts.w & 2u) != 0u;
    var vis: array<vec4<f32>, 2>;
    var air: array<vec4<f32>, 2>;
    vis[0] = vec4<f32>(1.0);
    vis[1] = vec4<f32>(1.0);
    air[0] = vec4<f32>(1.0);
    air[1] = vec4<f32>(1.0);
    let n = min(F.counts.y, 8u);
    for (var li = 0u; li < n; li = li + 1u) {
        let L = lights[li];
        let lt = light_term(L, P);
        var v = 1.0;
        // Skip rays that can't matter: no light reaches P (range, cone) or it comes from below the surface.
        if (lt.w > 1e-5 && L.pos.z > zr) {
            v = trace(P, L.pos.xyz, L.pos.w * L.extra.w, 0.75, true);
        }
        vis[li / 4u][li % 4u] = v;
        if (shafts && L.extra.x > 0.0) {
            air[li / 4u][li % 4u] = shaft(p, L);
        }
    }
    textureStore(out_vis, gid.xy, 0, vis[0]);
    textureStore(out_air, gid.xy, 0, air[0]);
    if (n > 4u) {
        textureStore(out_vis, gid.xy, 1, vis[1]);
        textureStore(out_air, gid.xy, 1, air[1]);
    }
}
