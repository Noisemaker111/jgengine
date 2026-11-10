//! Compact retained layout store (`LayoutStore`) driving Taffy 0.15's solver directly.
//!
//! Keeps Taffy's Flexbox, CSS Grid, Block, out-of-flow positioning, and intrinsic sizing
//! algorithms while replacing `TaffyTree`'s `SlotMap`s, 552-byte inline `Style`, 408-byte
//! inline `Cache`, dual 92-byte `Layout`s, and per-node child `Vec`s with 216-byte dense
//! `RetainedSlot`s, 64-byte `CompactStyle`, 96-byte `CompactCache`, and flat child arenas.

mod baseline_store;
mod cache;
pub mod prelude;
mod store;
mod style;
#[cfg(test)]
mod tests;
mod view;

/// jgengine patch: a CSS `calc()` length, the value behind `Dimension::calc(ptr)`. It resolves to
/// `px + fraction * basis`, and with `mode` 1 or 2 to the smaller or larger of that and
/// `other_px + other_fraction * basis` (CSS `min()` and `max()`). Mode 3 is `clamp()`: the value held
/// between `other_px` and `other_fraction`, both in points.
#[repr(C, align(8))]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Calc {
    pub px: f32,
    pub fraction: f32,
    pub other_px: f32,
    pub other_fraction: f32,
    pub mode: u32,
}

impl Calc {
    /// A pointer for `Dimension::calc`; the value lives for the rest of the program.
    pub fn leak(self) -> *const () {
        Box::leak(Box::new(self)) as *const Calc as *const ()
    }

    pub(crate) fn resolve(ptr: *const (), basis: f32) -> f32 {
        if ptr.is_null() {
            return 0.0;
        }
        // SAFETY: every calc pointer in a style comes from `Calc::leak`.
        let c = unsafe { &*(ptr as *const Calc) };
        let first = c.px + c.fraction * basis;
        let other = c.other_px + c.other_fraction * basis;
        match c.mode {
            1 => first.min(other),
            2 => first.max(other),
            // `clamp()`: the other two fields are its low and high ends, in points.
            3 => first.min(c.other_fraction).max(c.other_px),
            _ => first,
        }
    }
}

pub use baseline_store::BaselineLayoutStore;
pub use baseline_store::baseline_storage_stats;
pub use cache::CompactCache;
pub use store::BoxLayout;
pub use store::LayoutStore;
pub use store::SlotChildIter;
pub use store::SlotId;
pub use store::StorageStats;
pub use style::CompactStyle;
pub use taffy::TaffyTree as BaselineTaffyTree;

#[cfg(not(feature = "baseline-taffy"))]
pub type LayoutEngine = LayoutStore;

#[cfg(feature = "baseline-taffy")]
pub type LayoutEngine = BaselineLayoutStore;
