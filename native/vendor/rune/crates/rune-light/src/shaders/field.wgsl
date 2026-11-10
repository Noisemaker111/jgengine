// Scene distance field at field resolution, straight from the analytic primitives (exact, no jump flood):
//   x: union signed distance to occluders (device px), y/z: bottom/top z of the nearest occluder,
//   w: distance to emitters (and GI hints), for radiance-cascade sphere tracing alongside x.
// Distances are clamped to CLAMP (no tracer steps further), so each 16×16 tile first culls the primitives whose
// bounds lie further than CLAMP from it into workgroup memory and only those are evaluated per texel.

const CLAMP: f32 = 256.0;
const MAX_LOCAL: u32 = 256u;

@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> prims: array<Prim>;
@group(0) @binding(2) var out_field: texture_storage_2d<rgba16float, write>;

var<workgroup> local_ids: array<u32, MAX_LOCAL>;
var<workgroup> local_n: atomic<u32>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_index) li: u32, @builtin(workgroup_id) wid: vec3<u32>) {
    if (li == 0u) {
        atomicStore(&local_n, 0u);
    }
    workgroupBarrier();
    // Tile bounds in device px.
    let lo = vec2<f32>(wid.xy * 16u) / F.gs.z;
    let hi = vec2<f32>(wid.xy * 16u + 16u) / F.gs.z;
    let tc = (lo + hi) * 0.5;
    let th = (hi - lo) * 0.5;
    let n = F.counts.x;
    for (var i = li; i < n; i = i + 256u) {
        let pr = prims[i];
        if ((flags_of(pr) & (F_OCC | F_EMIT | F_HINT)) == 0u) {
            continue;
        }
        let half = pr.rect.zw * 0.5;
        let c = pr.rect.xy + half;
        let gap = max(abs(c - tc) - half - th, vec2<f32>(0.0));
        if (length(gap) < CLAMP) {
            let k = atomicAdd(&local_n, 1u);
            if (k < MAX_LOCAL) {
                local_ids[k] = i;
            }
        }
    }
    workgroupBarrier();
    let count = min(atomicLoad(&local_n), MAX_LOCAL);
    // Keep painter's order deterministic regardless of which thread appended first: the min is order-free,
    // and ties pick the lowest index.
    let fs = vec2<u32>(F.sf.zw);
    if (gid.x >= fs.x || gid.y >= fs.y) {
        return;
    }
    let p = (vec2<f32>(gid.xy) + 0.5) / F.gs.z;
    var best = CLAMP;
    var best_i = 0xffffffffu;
    var bot = 0.0;
    var top = 0.0;
    var gi = CLAMP;
    for (var k = 0u; k < count; k = k + 1u) {
        let i = local_ids[k];
        let pr = prims[i];
        let half = pr.rect.zw * 0.5;
        let c = pr.rect.xy + half;
        let q0 = abs(p - c) - half;
        let bd = min(max(q0.x, q0.y), 0.0) + length(max(q0, vec2<f32>(0.0)));
        if (bd > best && bd > gi) {
            continue;
        }
        let d = sd_rrect(p - c, half, pr.radii);
        if ((flags_of(pr) & (F_EMIT | F_HINT)) != 0u) {
            gi = min(gi, d);
        }
        if ((flags_of(pr) & F_OCC) != 0u && (d < best || (d == best && i < best_i))) {
            best = d;
            best_i = i;
            bot = pr.z.x;
            top = pr.z.y;
        }
    }
    textureStore(out_field, gid.xy, vec4<f32>(best, bot, top, gi));
}
