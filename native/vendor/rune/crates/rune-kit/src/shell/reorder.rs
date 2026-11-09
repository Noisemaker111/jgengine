//! Dragging a list's rows into a new order.

/// Points the pointer travels before a press on a row becomes a drag.
const SLOP: f32 = 4.0;

/// A list's drag to reorder, owned by the app: `Reorder::new().gap(4.0)`. Pass it to each
/// row's `SidebarRow::reorder`. Rows are taken to share one height.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Reorder {
    from: Option<usize>,
    to: usize,
    dy: f32,
    pitch: f32,
    gap: f32,
}

impl Reorder {
    pub fn new() -> Reorder {
        Reorder::default()
    }
    /// Points between the rows (the list's gap), so a row steps aside by its height plus this.
    pub fn gap(mut self, points: f32) -> Self {
        self.gap = points.max(0.0);
        self
    }
    /// The row being dragged, by its index before the drag.
    pub fn dragging(&self) -> Option<usize> {
        self.from
    }
    /// Where the dragged row would land if dropped now.
    pub fn target(&self) -> Option<usize> {
        self.from.map(|_| self.to)
    }

    /// The pointer moved `dy` since the press on row `index`, which is `h` tall.
    pub(super) fn follow(&mut self, index: usize, count: usize, dy: f32, h: f32) {
        if self.from.is_none() {
            if dy.abs() < SLOP {
                return;
            }
            self.from = Some(index);
            self.pitch = (h + self.gap).max(1.0);
        }
        self.dy = dy;
        let to = index as f32 + (dy / self.pitch).round();
        self.to = to.clamp(0.0, count.saturating_sub(1) as f32) as usize;
    }

    /// The drag ended: `(from, to)` for a drop that moves a row, `None` for a cancel or a drop
    /// in place.
    pub(super) fn end(&mut self, cancelled: bool) -> Option<(usize, usize)> {
        let from = self.from.take()?;
        self.dy = 0.0;
        (!cancelled && from != self.to).then_some((from, self.to))
    }

    /// How far row `index` sits from its place: the dragged row with the pointer, and the rows
    /// between its place and its target a step toward the gap it left.
    pub(super) fn shift(&self, index: usize) -> f32 {
        let Some(from) = self.from else { return 0.0 };
        if index == from {
            self.dy
        } else if from < index && index <= self.to {
            -self.pitch
        } else if self.to <= index && index < from {
            self.pitch
        } else {
            0.0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rows_between_the_place_and_the_target_step_aside() {
        let mut r = Reorder::new().gap(4.0);
        r.follow(1, 5, 3.0, 45.0);
        assert_eq!(r.dragging(), None, "inside the slop it's still a press");
        r.follow(1, 5, 100.0, 45.0);
        assert_eq!((r.dragging(), r.target()), (Some(1), Some(3)));
        let shifts: Vec<f32> = (0..5).map(|i| r.shift(i)).collect();
        assert_eq!(shifts, [0.0, 100.0, -49.0, -49.0, 0.0]);
        r.follow(1, 5, -500.0, 45.0);
        assert_eq!(r.target(), Some(0), "clamped to the list");
        assert_eq!(r.shift(0), 49.0);
        assert_eq!(r.end(false), Some((1, 0)));
        assert_eq!(r.shift(0), 0.0);
        r.follow(2, 5, 60.0, 45.0);
        assert_eq!(r.end(true), None, "a cancel moves nothing");
    }
}
