use super::*;
use crate::{incident::{Detector, Finding, Rule}, stats::Stats};
use procwatch::Usage;
use std::hint::black_box;

#[global_allocator]
static ALLOCATOR: procwatch::alloc::Counting = procwatch::alloc::Counting::system();

fn sample(at_ms: u64, work: Option<f64>) -> Sample {
    Sample { at_ms, frame: Frame::default().update_ms(work).render_ms(work.map(|_| 0.0)) }
}

fn usage(footprint: Option<u64>, fds: Option<u32>) -> Usage {
    let mut u = Usage::default();
    u.footprint = footprint;
    u.fds = fds;
    u
}

#[test]
fn optional_counters_stay_unavailable_and_invalid_timings_are_rejected() {
    let mut stats = Stats::default();
    stats.accept(sample(0, None));
    let json = stats.json();
    for name in ["work_ms", "ui_allocated_bytes", "gpu_ms", "input_to_frame_ms", "lifetime_max_ui_allocated_bytes"] {
        assert!(json[name].is_null(), "{name}");
    }
    let f = Frame::new(1, 1, Outcome::Drawn).update_ms(f64::NAN).render_ms(-1.0).gpu_ms(f64::INFINITY).sanitize();
    assert!(f.update_ms.is_none() && f.render_ms.is_none() && f.gpu_ms.is_none());
    assert_eq!(Frame::default().update_ms(f64::MAX).render_ms(f64::MAX).work_ms(), None);
    assert_eq!(Frame::new(1, 1, Outcome::Drawn).update_ms(2.0).render_ms(1.0).work_ms(), Some(3.0));
}

#[test]
fn history_is_bounded_and_idle_is_not_work() {
    let mut stats = Stats::default();
    for n in 0..10_000 { stats.accept(sample(n, Some(n as f64))); }
    let j = stats.json();
    assert_eq!(j["recent_count"], RECENT);
    assert_eq!(j["work_ms"]["p50"], 9699.0);
    assert_eq!(j["work_ms"]["p95"], 9969.0);
    assert_eq!(j["recent_anomalies"].as_array().unwrap().len(), 20);
    stats.prune(70_000);
    assert!(stats.json()["work_ms"].is_null());
    assert_eq!(stats.json()["lifetime_max_work_ms"], 9999.0);
}

#[test]
fn anomalies_rate_limit_logs_but_keep_counts() {
    let mut stats = Stats::default();
    for _ in 0..10 { assert!(stats.accept(sample(0, Some(20.0)))); }
    assert!(!stats.accept(sample(999, Some(20.0))));
    assert!(stats.accept(sample(1000, Some(20.0))));
    assert_eq!(stats.json()["anomalies"], 12);
    assert_eq!(stats.json()["log_suppressed"], 1);
}

#[test]
fn long_frames_require_repetition_and_do_not_mix_windows() {
    let mut stats = Stats::default();
    let d = Detector::default();
    for n in 0..3 {
        let mut s = sample(n, Some(20.0));
        s.frame.window = n;
        stats.accept(s);
        assert!(d.frame(s, &stats).is_none());
    }
    for n in 3..5 { stats.accept(sample(n, Some(20.0))); }
    assert_eq!(d.frame(sample(5, Some(20.0)), &stats).unwrap().rule, Rule::LongFrames);
    assert!(d.frame(sample(5000, None), &stats).is_none());
    assert_eq!(d.frame(sample(5001, Some(250.0)), &stats).unwrap().rule, Rule::Stall);
}

#[test]
fn incident_cooldown_requires_worsening() {
    let mut d = Detector::default();
    let mut f = Finding { rule: Rule::Stall, window: 0, source: None, severity: 250.0, evidence: serde_json::Value::Null };
    assert!(d.admit(0, &f));
    assert!(!d.admit(60_001, &f));
    f.severity = 400.0;
    assert!(!d.admit(59_999, &f));
    assert!(d.admit(60_001, &f));
}

#[test]
fn growth_uses_completed_floors_and_rejects_plateaus_spikes_gaps_and_missing_reads() {
    for case in 0..5 {
        let mut d = Detector::default();
        let mut findings = Vec::new();
        for minute in 0..6 {
            let base = 100 << 20;
            let value = match case { 0 => base + minute * (20 << 20), 1 => base,
                2 => if minute == 2 { base * 3 } else { base }, _ => base + minute * (20 << 20) };
            let at = if case == 3 && minute > 2 { minute + 2 } else { minute } * 60_000;
            findings = d.process(at, usage(if case == 4 && minute == 2 { None } else { Some(value) }, Some(100)));
        }
        assert_eq!(findings.len(), usize::from(case == 0), "case {case}");
        if case == 0 { assert_eq!(findings[0].rule, Rule::MemoryGrowth); }
    }
    let mut d = Detector::default();
    for n in 0..5 { assert!(d.process(n * 60_000, usage(None, Some(100 + n as u32 * 10))).is_empty()); }
    assert_eq!(d.process(300_000, usage(None, Some(150)))[0].rule, Rule::FdGrowth);
}

#[test]
fn allocation_deltas_start_from_a_baseline_and_stay_on_this_thread() {
    assert_eq!(take_allocated_bytes(), None);
    drop(black_box(vec![0u8; 4096]));
    assert_eq!(take_allocated_bytes(), Some(4096));
    assert_eq!(take_allocated_bytes(), Some(0));
    std::thread::spawn(|| drop(black_box(vec![0u8; 1 << 20]))).join().unwrap();
    // Spawning allocates a little here; the other thread's megabyte isn't counted.
    assert!(take_allocated_bytes().unwrap() < 64 << 10);
}
