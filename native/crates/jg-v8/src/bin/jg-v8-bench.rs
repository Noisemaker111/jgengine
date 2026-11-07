//! `jg-v8-bench <bundle.js> [seconds]`: the bundled tick in embedded V8 along the perf walk (W held,
//! A/D swapped every 1.5 s) at 60 Hz; prints per-tick ms and the final columns as one JSON line.
use std::time::Instant;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let bundle = std::fs::read_to_string(args.get(1).expect("usage: jg-v8-bench <bundle.js> [seconds] [home|dive]")).expect("read bundle");
    let seconds: f64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(13.0);
    let t0 = Instant::now();
    let scenario = args.get(3).map(String::as_str).unwrap_or("home");
    let mut rules = jg_v8::JsRules::load(&bundle, scenario).unwrap_or_else(|e| panic!("load: {e}"));
    let load_ms = t0.elapsed().as_secs_f64() * 1e3;
    let dt = 1.0 / 60.0;
    for _ in 0..300 {
        if rules.columns()[9] == 1.0 {
            break;
        }
        rules.tick(dt, 0, f64::NAN).unwrap_or_else(|e| panic!("warm tick: {e}"));
    }
    let n = (seconds * 60.0) as usize;
    let mut ms = Vec::with_capacity(n);
    for i in 0..n {
        let t = i as f64 * dt;
        let held = 1 | if ((t / 1.5).floor() as i64) % 2 == 0 { 4 } else { 8 };
        let s = Instant::now();
        rules.tick(dt, held, f64::NAN).unwrap_or_else(|e| panic!("tick {i}: {e}"));
        ms.push(s.elapsed().as_secs_f64() * 1e3);
    }
    let mut sorted = ms.clone();
    sorted.sort_by(f64::total_cmp);
    let q = |p: f64| sorted[((p * sorted.len() as f64) as usize).min(sorted.len() - 1)];
    let mean = ms.iter().sum::<f64>() / ms.len() as f64;
    let c = rules.columns();
    println!(
        "{{\"engine\":\"v8\",\"scenario\":\"{scenario}\",\"ticks\":{n},\"loadMs\":{load_ms:.1},\"p50\":{:.4},\"p99\":{:.4},\"mean\":{mean:.4},\"x\":{:.3},\"z\":{:.3},\"mode\":{},\"food\":{:.3},\"water\":{:.3},\"tick\":{}}}",
        q(0.5), q(0.99), c[0], c[2], c[8], c[4], c[5], c[7]
    );
}
