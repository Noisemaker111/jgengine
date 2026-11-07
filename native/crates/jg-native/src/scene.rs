//! The per-frame scene update a native engine pays before it draws: each object's local matrix from
//! position, rotation and scale, its world matrix through its parent, model-view and normal matrices
//! against the moving camera, a frustum test of its bounding sphere, and the draw-list sort by
//! program and depth. three.js does the same work in `updateMatrixWorld`, `projectObject` and the
//! render-list sort; the replay takes those results from the recording, so this runs the same amount
//! of that work (the recording's object and draw counts) to keep the native CPU column honest.

use glam::{Mat3, Mat4, Quat, Vec3, Vec4};
use std::time::Instant;

pub struct SceneModel {
    local: Vec<(Vec3, Quat, Vec3)>,
    parent: Vec<usize>,
    world: Vec<Mat4>,
    draws: Vec<(usize, u32)>,
    out: Vec<(u64, Mat4, Mat3)>,
    pub ms: Vec<f64>,
}

impl SceneModel {
    pub fn new(objects: usize, draws: usize) -> SceneModel {
        let local = (0..objects)
            .map(|i| {
                let f = i as f32;
                (Vec3::new((f * 1.7).sin() * 20.0, (f * 0.3).cos(), (f * 2.3).cos() * 20.0), Quat::from_rotation_y(f * 0.37), Vec3::splat(1.0 + (f * 0.11).sin() * 0.2))
            })
            .collect();
        // A shallow hierarchy: every object hangs off one of the first eight.
        let parent = (0..objects).map(|i| if i < 8 { usize::MAX } else { i % 8 }).collect();
        SceneModel { local, parent, world: vec![Mat4::IDENTITY; objects], draws: (0..draws).map(|i| (i % objects, (i % 53) as u32)).collect(), out: Vec::with_capacity(draws), ms: Vec::new() }
    }

    pub fn update(&mut self, t: f64) {
        let s = Instant::now();
        let t = t as f32;
        let eye = Vec3::new(t.sin() * 3.0, 1.6, 14.0 - t);
        let view = Mat4::look_at_rh(eye, eye + Vec3::new(t.sin() * 0.3, -0.05, -1.0), Vec3::Y);
        let proj = Mat4::perspective_rh_gl(70f32.to_radians(), 16.0 / 9.0, 0.1, 400.0);
        let view_proj = proj * view;
        let rows = view_proj.transpose();
        let planes = [rows.w_axis + rows.x_axis, rows.w_axis - rows.x_axis, rows.w_axis + rows.y_axis, rows.w_axis - rows.y_axis, rows.w_axis + rows.z_axis, rows.w_axis - rows.z_axis];
        for i in 0..self.local.len() {
            let (p, mut q, sc) = self.local[i];
            if i % 5 == 0 {
                q *= Quat::from_rotation_y(t * 0.01);
            }
            let m = Mat4::from_scale_rotation_translation(sc, q, p);
            self.world[i] = if self.parent[i] == usize::MAX { m } else { self.world[self.parent[i]] * m };
        }
        self.out.clear();
        for &(o, program) in &self.draws {
            let w = self.world[o];
            let centre = w.w_axis;
            let visible = planes.iter().all(|pl: &Vec4| pl.dot(centre) >= -2.0 * pl.truncate().length());
            if !visible {
                continue;
            }
            let mv = view * w;
            let normal = Mat3::from_mat4(mv).inverse().transpose();
            let depth = (view_proj * centre).z;
            self.out.push((((program as u64) << 32) | (depth.to_bits() as u64), mv, normal));
        }
        self.out.sort_unstable_by_key(|d| d.0);
        std::hint::black_box(&self.out);
        self.ms.push(s.elapsed().as_secs_f64() * 1e3);
    }
}
