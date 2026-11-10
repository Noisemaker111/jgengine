use std::collections::VecDeque;
use serde_json::{Value, json};
use crate::{RECENT, Sample, WINDOW_MS};

#[derive(Default)]
pub(crate) struct Stats {
    pub recent: VecDeque<Sample>,
    total: u64,
    anomalies: u64,
    suppressed: u64,
    max_work: Option<f64>,
    max_bytes: Option<u64>,
    log_second: u64,
    logged: u32,
}

impl Stats {
    pub fn accept(&mut self, s: Sample) -> bool {
        self.total += 1;
        if let Some(v) = s.frame.work_ms() { self.max_work = Some(self.max_work.map_or(v, |old| old.max(v))); }
        if let Some(v) = s.frame.allocated_bytes { self.max_bytes = Some(self.max_bytes.map_or(v, |old| old.max(v))); }
        if self.recent.len() == RECENT { self.recent.pop_front(); }
        self.recent.push_back(s);
        self.prune(s.at_ms);
        if !s.anomaly() { return false; }
        self.anomalies += 1;
        if self.log_second != s.at_ms / 1000 { self.log_second = s.at_ms / 1000; self.logged = 0; }
        if self.logged == 10 { self.suppressed += 1; return false; }
        self.logged += 1;
        true
    }

    pub fn prune(&mut self, now: u64) {
        while self.recent.front().is_some_and(|s| now.saturating_sub(s.at_ms) > WINDOW_MS) { self.recent.pop_front(); }
    }

    pub fn json(&self) -> Value {
        let metric = |f: fn(&Sample) -> Option<f64>| percentiles(self.recent.iter().filter_map(f).collect());
        json!({"total": self.total, "anomalies": self.anomalies, "log_suppressed": self.suppressed,
            "lifetime_max_work_ms": self.max_work, "lifetime_max_ui_allocated_bytes": self.max_bytes,
            "recent_count": self.recent.len(), "timed_count": self.recent.iter().filter(|s| s.frame.work_ms().is_some()).count(),
            "window_ms": WINDOW_MS, "capacity": RECENT,
            "work_ms": metric(|s| s.frame.work_ms()),
            "ui_allocated_bytes": metric(|s| s.frame.allocated_bytes.map(|n| n as f64)),
            "input_to_frame_ms": metric(|s| s.frame.input_to_frame_ms),
            "gpu_ms": metric(|s| s.frame.gpu_ms),
            "latest": self.recent.back().map(|s| s.json()),
            "recent_anomalies": self.recent.iter().rev().filter(|s| s.anomaly()).take(20).map(|s| s.json()).collect::<Vec<_>>()})
    }
}

pub(crate) fn percentiles(mut values: Vec<f64>) -> Value {
    if values.is_empty() { return Value::Null; }
    values.sort_by(f64::total_cmp);
    let p = |q: f64| values[((values.len() as f64 * q).ceil() as usize).saturating_sub(1)];
    json!({"p50": p(0.5), "p95": p(0.95), "max": values.last(), "count": values.len()})
}
