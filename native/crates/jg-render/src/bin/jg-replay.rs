//! `jg-replay <recording-dir> [--out <dir>]`: replay every recorded frame offscreen in order and,
//! at each frame three read back, compare the canvas with three's pixels. Writes
//! `frame-NNN.native.png`, `frame-NNN.three.png`, `frame-NNN.diff.png` and `diff.json` into `--out`
//! (default `<recording-dir>/diff`). Prints one line per compared frame.

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
    let out = args.iter().position(|a| a == "--out").and_then(|i| args.get(i + 1)).map(PathBuf::from).unwrap_or_else(|| dir.join("diff"));
    std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
    let t0 = std::time::Instant::now();
    let rec = jg_scene::Recording::load(&dir)?;
    eprintln!("loaded {} frames in {:.1} s", rec.frames.len(), t0.elapsed().as_secs_f64());
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle_from_env());
    let (adapter, device, queue) = pollster::block_on(jg_render::device(&instance, None))?;
    eprintln!("adapter: {:?}", adapter.get_info().name);
    let errors = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    {
        let errors = errors.clone();
        device.on_uncaptured_error(std::sync::Arc::new(move |e| errors.lock().unwrap().push(e.to_string())));
    }
    let t1 = std::time::Instant::now();
    let mut r = jg_render::Replayer::new(device.clone(), queue.clone(), rec)?;
    eprintln!("replayer ready in {:.1} s", t1.elapsed().as_secs_f64());
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
