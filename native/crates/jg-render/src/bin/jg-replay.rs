//! `jg-replay <recording-dir> [--out <dir>]`: replay every recorded frame offscreen in order and,
//! at each frame three read back, compare the canvas with three's pixels. Writes
//! `frame-NNN.native.png`, `frame-NNN.three.png`, `frame-NNN.diff.png` and `diff.json` into `--out`
//! (default `<recording-dir>/diff`). Prints one line per compared frame.
//!
//! `jg-replay <recording-dir> --validate`: replay every frame on wgpu's noop backend, which runs all
//! of wgpu's validation without a GPU, and list every distinct validation error with the first
//! frame it happened on. No pixels; exits non-zero when anything failed validation.

use jg_render::diff;
use std::path::PathBuf;

fn main() {
    if let Err(e) = run() {
        eprintln!("jg-replay: {e}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    let dir = PathBuf::from(args.get(1).ok_or("usage: jg-replay <recording-dir> [--out <dir>]")?);
    let validate = args.iter().any(|a| a == "--validate");
    let out = args.iter().position(|a| a == "--out").and_then(|i| args.get(i + 1)).map(PathBuf::from).unwrap_or_else(|| dir.join("diff"));
    std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
    let t0 = std::time::Instant::now();
    let rec = jg_scene::Recording::load(&dir)?;
    eprintln!("loaded {} frames in {:.1} s", rec.frames.len(), t0.elapsed().as_secs_f64());
    let instance = if validate {
        wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::NOOP,
            backend_options: wgpu::BackendOptions { noop: wgpu::NoopBackendOptions { enable: true, ..Default::default() }, ..Default::default() },
            ..wgpu::InstanceDescriptor::new_without_display_handle()
        })
    } else {
        wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle_from_env())
    };
    let (adapter, device, queue) = pollster::block_on(jg_render::device(&instance, None))?;
    eprintln!("adapter: {:?}", adapter.get_info().name);
    let errors = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    {
        let errors = errors.clone();
        device.on_uncaptured_error(std::sync::Arc::new(move |e| errors.lock().unwrap().push(e.to_string())));
    }
    let overruns: Vec<String> = if validate { instance_overruns(&rec) } else { Vec::new() };
    let t1 = std::time::Instant::now();
    let mut r = jg_render::Replayer::new(device.clone(), queue.clone(), rec)?;
    eprintln!("replayer ready in {:.1} s", t1.elapsed().as_secs_f64());
    if validate {
        // Distinct errors (first line of each) with the first frame and how often.
        let mut seen: Vec<(String, usize, usize, String)> = Vec::new();
        let take = |f: usize, seen: &mut Vec<(String, usize, usize, String)>| {
            for e in errors.lock().unwrap().drain(..) {
                let key: String = e.lines().filter(|l| !l.trim().is_empty()).take(4).collect::<Vec<_>>().join(" / ");
                match seen.iter_mut().find(|s| s.0 == key) {
                    Some(s) => s.2 += 1,
                    None => seen.push((key, f, 1, e)),
                }
            }
        };
        take(0, &mut seen);
        for o in &overruns {
            println!("instance overrun, {o}");
        }
        for f in 0..r.frame_count() {
            let mut encoder = device.create_command_encoder(&Default::default());
            r.frame(&mut encoder, f).map_err(|e| format!("frame {f}: {e}"))?;
            r.finish_frame();
            queue.submit([encoder.finish()]);
            take(f, &mut seen);
        }
        for (_, first, count, full) in &seen {
            println!("error x{count}, first at frame {first}:
{full}
");
        }
        let mut warnings: Vec<_> = r.warnings.iter().collect();
        warnings.sort();
        for (k, v) in warnings {
            println!("warning x{v}: {k}");
        }
        println!("validated {} frames: {} distinct validation errors", r.frame_count(), seen.len());
        return if seen.is_empty() { Ok(()) } else { Err(format!("{} distinct validation errors", seen.len())) };
    }
    let [w, h] = r.rec.manifest.canvas;
    let readback_frames: Vec<usize> = r.rec.manifest.readbacks.iter().map(|b| b.frame).collect();
    let mut report = Vec::new();
    for f in 0..r.frame_count() {
        let mut encoder = device.create_command_encoder(&Default::default());
        let stats = r.frame(&mut encoder, f)?;
        r.finish_frame();
        queue.submit([encoder.finish()]);
        {
            let errs = errors.lock().unwrap();
            if !errs.is_empty() {
                return Err(format!("frame {f}: wgpu error: {}", errs.join("\n")));
            }
        }
        if readback_frames.contains(&f) {
            let native = r.read_canvas();
            let (_, three) = r.rec.readback(f).ok_or("readback missing")?;
            let three = three.to_vec();
            let s = diff::compare(&native, &three);
            println!(
                "frame {f:4}: mean |d| {:.3}, max {}, >2 levels {:.3}%, >8 levels {:.3}%, PSNR {:.1} dB ({} draws, {} passes)",
                s.mean_abs,
                s.max_abs,
                s.over_2 * 100.0,
                s.over_8 * 100.0,
                s.psnr,
                stats.draws,
                stats.passes
            );
            diff::write_png(&out.join(format!("frame-{f:03}.native.png")), w, h, &native)?;
            diff::write_png(&out.join(format!("frame-{f:03}.three.png")), w, h, &three)?;
            diff::write_png(&out.join(format!("frame-{f:03}.diff.png")), w, h, &diff::heat(&native, &three))?;
            report.push(format!(
                "{{\"frame\":{f},\"meanAbs\":{:.4},\"maxAbs\":{},\"over2\":{:.6},\"over8\":{:.6},\"psnr\":{:.2},\"draws\":{}}}",
                s.mean_abs, s.max_abs, s.over_2, s.over_8, if s.psnr.is_finite() { s.psnr } else { 99.0 }, stats.draws
            ));
        }
    }
    let mut warnings: Vec<_> = r.warnings.iter().map(|(k, v)| format!("{{\"warning\":{:?},\"count\":{v}}}", k)).collect();
    warnings.sort();
    for w in &warnings {
        eprintln!("warning: {w}");
    }
    std::fs::write(out.join("diff.json"), format!("{{\"frames\":[{}],\"warnings\":[{}]}}\n", report.join(","), warnings.join(","))).map_err(|e| e.to_string())?;
    Ok(())
}

/// Context wgpu's errors lack: draws asking for more instances than an instanced attribute holds.
fn instance_overruns(rec: &jg_scene::Recording) -> Vec<String> {
    let mut overruns: Vec<String> = Vec::new();
    for (f, frame) in rec.frames.iter().enumerate() {
        for ev in frame {
            if let jg_scene::Event::Draw(d) = ev {
                for (name, &a) in &rec.manifest.geometries[d.geometry].attributes {
                    let attr = &rec.manifest.attributes[a];
                    let held = attr.count * attr.mesh_per_attribute.max(1);
                    if attr.instanced && d.instances > held {
                        let line = format!("program {} geometry {} object {} ({}): {} instances, `{name}` (attribute {a}) holds {held}", d.program, d.geometry, d.object, rec.manifest.objects.get(d.object).map(|o| o.name.as_str()).unwrap_or("?"), d.instances);
                        if !overruns.iter().any(|o| o.ends_with(&line)) {
                            overruns.push(format!("first at frame {f}: {line}"));
                        }
                    }
                }
            }
        }
    }
    overruns
}
