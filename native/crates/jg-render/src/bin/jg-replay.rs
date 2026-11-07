//! `jg-replay <recording-dir> [--out <dir>]`: replay every recorded frame offscreen in order and,
//! at each frame three read back, compare the canvas with three's pixels. Writes
//! `frame-NNN.native.png`, `frame-NNN.three.png`, `frame-NNN.diff.png` and `diff.json` into `--out`
//! (default `<recording-dir>/diff`). Prints one line per compared frame.
//!
//! `jg-replay <recording-dir> --validate`: replay every frame on wgpu's noop backend, which runs all
//! of wgpu's validation without a GPU, and list every distinct validation error with the first
//! frame it happened on. No pixels; exits non-zero when anything failed validation.
//!
//! `jg-replay <recording-dir> --dump <frame>`: replay up to that frame and write every RGBA8 or
//! half-float render target as `target-<framebuffer>-<texture>.png` into `--out`, to see which pass
//! a difference starts in. `--uniforms <program>` also prints that program's uniform values and
//! bound textures as they stand after the frame; `--draws` lists every frame's clears and draws up
//! to it, by framebuffer.
//!
//! `--skip-between` draws only the frames three read back and skips the rest, as a real-time player
//! that fell behind does: its diffs should match the default run's wherever the skipped frames only
//! changed state. `--skip-timing` prints what skipping every frame costs.
//!
//! `--web-limits` holds the device to Chrome's WebGPU limit of 8 vertex buffers, so draws that bind
//! more take the interleaved path the web build takes; its pixels should match the default run's.

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
    let web_limits = args.iter().any(|a| a == "--web-limits");
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
    let (adapter, device, queue) = pollster::block_on(jg_render::device(&instance, None, web_limits))?;
    eprintln!("adapter: {:?}", adapter.get_info().name);
    let errors = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    {
        let errors = errors.clone();
        device.on_uncaptured_error(std::sync::Arc::new(move |e| errors.lock().unwrap().push(e.to_string())));
    }
    let overruns: Vec<String> = if validate { instance_overruns(&rec) } else { Vec::new() };
    let t1 = std::time::Instant::now();
    let mut r = jg_render::Replayer::new(device.clone(), queue.clone(), rec)?;
    r.track_stale = true;
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
    if args.iter().any(|a| a == "--skip-timing") {
        // What a real-time player pays to catch up: apply every frame's state without drawing it.
        let mut worst = (0.0f64, 0usize);
        let t = std::time::Instant::now();
        for f in 0..r.frame_count() {
            let s = std::time::Instant::now();
            r.skip(f);
            let ms = s.elapsed().as_secs_f64() * 1000.0;
            if ms > worst.0 {
                worst = (ms, f);
            }
        }
        let total = t.elapsed().as_secs_f64() * 1000.0;
        println!("skipped {} frames in {total:.1} ms ({:.3} ms each), slowest frame {} at {:.2} ms", r.frame_count(), total / r.frame_count() as f64, worst.1, worst.0);
        return Ok(());
    }
    if let Some(stop) = args.iter().position(|a| a == "--dump").and_then(|i| args.get(i + 1)).and_then(|v| v.parse::<usize>().ok()) {
        for f in 0..=stop.min(r.frame_count() - 1) {
            let mut encoder = device.create_command_encoder(&Default::default());
            r.frame(&mut encoder, f)?;
            r.finish_frame();
            queue.submit([encoder.finish()]);
        }
        let mut written = 0;
        for fb in r.rec.manifest.framebuffers.clone() {
            for t in &fb.textures {
                if let Some((tw, th, px)) = r.read_target_texture(*t) {
                    diff::write_png(&out.join(format!("target-{}-{t}.png", fb.handle)), tw, th, &px)?;
                    written += 1;
                }
            }
        }
        if let Some(p) = args.iter().position(|a| a == "--uniforms").and_then(|i| args.get(i + 1)).and_then(|v| v.parse::<usize>().ok()) {
            let (values, bound) = r.uniform_values(p).ok_or(format!("no program {p}"))?;
            for (name, v) in values {
                println!("program {p} {name} = {v:?}");
            }
            println!("program {p} samplers bound to textures {bound:?}");
        }
        if args.iter().any(|a| a == "--draws") {
            let m = &r.rec.manifest;
            let mut fb = -1i64;
            for f in 0..=stop.min(r.frame_count() - 1) {
                for ev in r.frame_events(f) {
                    match ev {
                        jg_scene::Event::Framebuffer(h) => fb = *h,
                        jg_scene::Event::Clear { mask, depth_mask, .. } => println!("frame {f} clear fb {fb} mask {mask:#x} depth mask {depth_mask}"),
                        jg_scene::Event::Draw(d) => {
                            let program = m.programs.get(d.program).map_or("?", |p| p.name.as_str());
                            let object = m.objects.get(d.object).map_or("?", |o| o.name.as_str());
                            println!("frame {f} draw fb {fb} program {} ({program}) object {} ({object}) count {} instances {}", d.program, d.object, d.count, d.instances);
                        }
                        _ => {}
                    }
                }
            }
        }
        let [w, h] = r.rec.manifest.canvas;
        diff::write_png(&out.join("target-canvas.png"), w, h, &r.read_canvas())?;
        println!("frame {stop}: wrote {written} render targets and the canvas to {}", out.display());
        return Ok(());
    }
    let [w, h] = r.rec.manifest.canvas;
    let readback_frames: Vec<usize> = r.rec.manifest.readbacks.iter().map(|b| b.frame).collect();
    let skip_between = args.iter().any(|a| a == "--skip-between");
    let mut report = Vec::new();
    for f in 0..r.frame_count() {
        if skip_between && !readback_frames.contains(&f) {
            r.skip(f);
            continue;
        }
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
                "frame {f:4}: mean |d| {:.3}, max {}, >2 levels {:.3}%, >8 levels {:.3}%, PSNR {:.1} dB ({} draws, {} passes){}",
                s.mean_abs,
                s.max_abs,
                s.over_2 * 100.0,
                s.over_8 * 100.0,
                s.psnr,
                stats.draws,
                stats.passes,
                if r.stale_reads.is_empty() { String::new() } else { format!("; samples framebuffers {:?} the recording had not drawn yet", r.stale_reads) }
            );
            diff::write_png(&out.join(format!("frame-{f:03}.native.png")), w, h, &native)?;
            diff::write_png(&out.join(format!("frame-{f:03}.three.png")), w, h, &three)?;
            diff::write_png(&out.join(format!("frame-{f:03}.diff.png")), w, h, &diff::heat(&native, &three))?;
            report.push(format!(
                "{{\"frame\":{f},\"meanAbs\":{:.4},\"maxAbs\":{},\"over2\":{:.6},\"over8\":{:.6},\"psnr\":{:.2},\"draws\":{},\"staleTargets\":{:?}}}",
                s.mean_abs, s.max_abs, s.over_2, s.over_8, if s.psnr.is_finite() { s.psnr } else { 99.0 }, stats.draws, r.stale_reads
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
