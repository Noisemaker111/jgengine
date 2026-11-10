//! Warning-only rules. Growth is a suspect leak, never proof of ownership or causation.
use std::collections::VecDeque;
use serde_json::{Value, json};
use procwatch::Usage;
use crate::{SLOW_MS, Sample, stats::Stats};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Rule { LongFrames, Stall, MemoryGrowth, FdGrowth }
impl Rule {
    pub fn id(self) -> &'static str {
        match self { Self::LongFrames => "long-frames", Self::Stall => "frame-stall",
            Self::MemoryGrowth => "memory-growth", Self::FdGrowth => "fd-growth" }
    }
}

pub(crate) struct Finding {
    pub rule: Rule,
    pub window: u64,
    pub source: Option<u64>,
    pub severity: f64,
    pub evidence: Value,
}

#[derive(Clone, Copy)]
struct Sent { rule: Rule, window: u64, source: Option<u64>, at: u64, severity: f64 }
#[derive(Clone, Copy)]
struct Floor { minute: u64, memory: Option<u64>, fds: Option<u64> }

#[derive(Default)]
pub(crate) struct Detector {
    sent: VecDeque<Sent>,
    floors: VecDeque<Floor>,
    pub suppressed: u64,
    last_sent: Option<u64>,
}

impl Detector {
    pub fn frame(&self, s: Sample, stats: &Stats) -> Option<Finding> {
        let work = s.frame.work_ms()?;
        let rule = if work >= 250.0 { Rule::Stall } else if work >= SLOW_MS {
            let count = stats.recent.iter().rev().take_while(|p| s.at_ms.saturating_sub(p.at_ms) <= 1000)
                .filter(|p| p.frame.window == s.frame.window && p.frame.source == s.frame.source
                    && p.frame.work_ms().is_some_and(|t| t >= SLOW_MS)).take(3).count();
            if count < 3 { return None; }
            Rule::LongFrames
        } else { return None; };
        Some(Finding { rule, window: s.frame.window, source: s.frame.source, severity: work,
            evidence: json!({"frame": s.json(), "confidence": "measured work; cause unknown",
                "next_measurement": "capture update/compositor phases for this window and source"}) })
    }

    pub fn process(&mut self, now: u64, p: Usage) -> Vec<Finding> {
        let minute = now / 60_000;
        let fds = p.fds.map(u64::from);
        if self.floors.back().is_some_and(|f| minute > f.minute + 1) { self.floors.clear(); }
        match self.floors.back_mut() {
            Some(f) if f.minute == minute => {
                // A missing read invalidates this minute, rather than bridging an evidence gap.
                f.memory = f.memory.zip(p.footprint).map(|(a,b)| a.min(b));
                f.fds = f.fds.zip(fds).map(|(a,b)| a.min(b));
            }
            _ => {
                if self.floors.len() == 6 { self.floors.pop_front(); }
                self.floors.push_back(Floor { minute, memory: p.footprint, fds });
            }
        }
        // Five completed minute floors, excluding the in-progress minute.
        if self.floors.len() < 6 { return Vec::new(); }
        let mut out = Vec::new();
        for (rule, minimum) in [(Rule::MemoryGrowth, 64 << 20), (Rule::FdGrowth, 32)] {
            let values: Option<Vec<u64>> = self.floors.iter().take(5)
                .map(|f| if rule == Rule::MemoryGrowth { f.memory } else { f.fds }).collect();
            let Some(values) = values else { continue };
            let delta = values[4].saturating_sub(values[0]);
            if values.windows(2).all(|p| p[1] > p[0]) && delta >= minimum && delta as f64 >= values[0] as f64 * 0.2 {
                out.push(Finding { rule, window: 0, source: None, severity: values[4] as f64,
                    evidence: json!({"minute_floors": values, "growth": delta,
                        "confidence": "suspected growth, not a proven leak",
                        "next_measurement": "repeat view open/close cycles; check whether footprint and descriptors plateau"}) });
            }
        }
        out
    }

    pub fn admit(&mut self, now: u64, f: &Finding) -> bool {
        let old = self.sent.iter().find(|s| s.rule == f.rule && s.window == f.window && s.source == f.source);
        if self.last_sent.is_some_and(|t| now.saturating_sub(t) < 2000)
            || old.is_some_and(|s| now.saturating_sub(s.at) < 60_000 || f.severity < s.severity * 1.25) {
            self.suppressed += 1;
            return false;
        }
        self.sent.retain(|s| !(s.rule == f.rule && s.window == f.window && s.source == f.source));
        if self.sent.len() == 64 { self.sent.pop_front(); }
        self.sent.push_back(Sent { rule: f.rule, window: f.window, source: f.source, at: now, severity: f.severity });
        self.last_sent = Some(now);
        true
    }
}
