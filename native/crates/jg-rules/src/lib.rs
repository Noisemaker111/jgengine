//! Deepward's 60 Hz tick in Rust, on the column layout of `games/deepward/scripts/native-rules.entry.ts` (`COL`).
//!
//! It runs on the data `bun games/deepward/scripts/native-rules.ts world` exports from the game's own modules (floors,
//! solids, the Fitter's senses, movement and body tuning, each scenario's booted start), so the port
//! carries logic only. What it ports, against `games/deepward/src/game.tsx` and `controls.ts`:
//! - movement: the engine's grounded walk (`advancePlayerMotion`: target speed, exponential acceleration,
//!   ground friction) steered by the heading, then Deepward's `beforeCommit` sub-stepped `walkable` slide;
//! - collision/spatial: `walkable` (four-corner floor test, station solids, floor clutter, vault machinery),
//!   `lineOfSight`, `traversable`, and the 0.5 m route grid with A* and straight-run smoothing;
//! - AI: the Fitter's senses (sight range, cone and line, hearing, half-second memory) and its
//!   route / calling / winding state machine with `advanceRoute`;
//! - onTick: the body meters (home drain, vault drain, galley top-up), dive clock, air and suit damage.
//! Not ported: fauna (`tickCreatures`), the weapon runtime, channels and checkpoints/saves.

use serde::Deserialize;

/// Column indices, shared with `COL` in games/deepward/scripts/native-rules.entry.ts.
pub mod col {
    pub const X: usize = 0;
    pub const Y: usize = 1;
    pub const Z: usize = 2;
    pub const HEADING: usize = 3;
    pub const FOOD: usize = 4;
    pub const WATER: usize = 5;
    pub const SCRIP: usize = 6;
    pub const TICK: usize = 7;
    pub const MODE: usize = 8;
    pub const READY: usize = 9;
}
pub const COLUMNS: usize = 16;
pub const HELD_FORWARD: u32 = 1;
pub const HELD_BACK: u32 = 2;
pub const HELD_LEFT: u32 = 4;
pub const HELD_RIGHT: u32 = 8;
const MODE_HOME: f64 = 2.0;
const MODE_DIVE: f64 = 3.0;

#[derive(Deserialize, Clone, Copy, Debug)]
pub struct Rect {
    pub x: f64,
    pub z: f64,
    pub w: f64,
    pub d: f64,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Bounds {
    pub min_x: f64,
    pub min_z: f64,
    pub max_x: f64,
    pub max_z: f64,
}

#[derive(Deserialize, Debug)]
pub struct Places<T> {
    pub home: T,
    pub vault: T,
}

#[derive(Deserialize, Debug)]
pub struct Starts {
    pub home: Vec<f64>,
    pub dive: Vec<f64>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Fitter {
    pub spawn: [f64; 3],
    pub sight: f64,
    pub cone_deg: f64,
    pub hearing: f64,
    pub memory_seconds: f64,
    pub speed: f64,
    pub receiving_back_z: f64,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Movement {
    pub walk_speed: f64,
    pub walk_speed_multiplier: f64,
    pub backpedal_speed_multiplier: f64,
    pub ground_acceleration: f64,
    pub ground_friction: f64,
    pub max_frame_seconds: f64,
}

#[derive(Deserialize, Debug)]
pub struct Meter {
    pub id: String,
    pub max: f64,
    pub rate: f64,
}

#[derive(Deserialize, Debug)]
pub struct Meal {
    pub food: f64,
    pub water: f64,
}

#[derive(Deserialize, Debug)]
pub struct Drain {
    pub food: f64,
    pub water: f64,
    pub air: f64,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Body {
    pub meters: Vec<Meter>,
    pub home_drain: f64,
    pub galley_feeds_below: f64,
    pub meal: Meal,
    pub vault_drain: Drain,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct World {
    pub bounds: Bounds,
    pub rooms: Places<Vec<Rect>>,
    pub solids: Places<Vec<Rect>>,
    pub radius: f64,
    pub nav_cell: f64,
    pub fitter: Fitter,
    pub movement: Movement,
    pub body: Body,
    pub starts: Starts,
    #[serde(skip)]
    grid: Option<Grid>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Place {
    Home,
    Vault,
}

fn inside(x: f64, z: f64, r: &Rect, grow: f64) -> bool {
    (x - r.x).abs() < (r.w + grow) / 2.0 && (z - r.z).abs() < (r.d + grow) / 2.0
}

impl World {
    pub fn load(json: &str) -> Result<Self, String> {
        let mut w: World = serde_json::from_str(json).map_err(|e| e.to_string())?;
        w.grid = Some(Grid::build(&w));
        Ok(w)
    }
    fn rooms(&self, p: Place) -> &[Rect] {
        if p == Place::Home { &self.rooms.home } else { &self.rooms.vault }
    }
    fn solids(&self, p: Place) -> &[Rect] {
        if p == Place::Home { &self.solids.home } else { &self.solids.vault }
    }
    fn floor_at(&self, x: f64, z: f64, p: Place) -> bool {
        self.rooms(p).iter().any(|r| inside(x, z, r, 0.0))
    }
    /// `walkable` in world.ts: all four corners of the actor's square on a floor, clear of every solid.
    pub fn walkable(&self, x: f64, z: f64, p: Place, radius: f64) -> bool {
        for (dx, dz) in [(radius, radius), (-radius, radius), (radius, -radius), (-radius, -radius)] {
            if !self.floor_at(x + dx, z + dz, p) {
                return false;
            }
        }
        !self.solids(p).iter().any(|r| inside(x, z, r, radius * 2.0))
    }
    pub fn line_of_sight(&self, a: [f64; 3], b: [f64; 3], p: Place) -> bool {
        let steps = (ground(a, b) / 0.18).ceil() as i32;
        (1..steps).all(|n| {
            let t = n as f64 / steps as f64;
            self.walkable(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t, p, 0.0)
        })
    }
    pub fn traversable(&self, a: [f64; 3], b: [f64; 3], p: Place) -> bool {
        let steps = ((ground(a, b) / 0.12).ceil() as i32).max(1);
        (0..=steps).all(|i| {
            let t = i as f64 / steps as f64;
            self.walkable(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t, p, self.radius)
        })
    }
}

pub fn ground(a: [f64; 3], b: [f64; 3]) -> f64 {
    (a[0] - b[0]).hypot(a[2] - b[2])
}

/// The vault's route grid (navigation.ts): 0.5 m cells over the terrain bounds, blocked where not walkable.
#[derive(Debug, Clone)]
struct Grid {
    cols: i32,
    rows: i32,
    cell: f64,
    min_x: f64,
    min_z: f64,
    open: Vec<bool>,
}

impl Grid {
    fn build(w: &World) -> Grid {
        let cell = w.nav_cell;
        let cols = ((w.bounds.max_x - w.bounds.min_x) / cell).ceil() as i32;
        let rows = ((w.bounds.max_z - w.bounds.min_z) / cell).ceil() as i32;
        let mut g = Grid { cols, rows, cell, min_x: w.bounds.min_x, min_z: w.bounds.min_z, open: vec![true; (cols * rows) as usize] };
        for row in 0..rows {
            for c in 0..cols {
                let (x, z) = g.center(c, row);
                g.open[(row * cols + c) as usize] = w.walkable(x, z, Place::Vault, w.radius);
            }
        }
        g
    }
    fn center(&self, c: i32, r: i32) -> (f64, f64) {
        (self.min_x + (c as f64 + 0.5) * self.cell, self.min_z + (r as f64 + 0.5) * self.cell)
    }
    fn cell_at(&self, x: f64, z: f64) -> (i32, i32) {
        (((x - self.min_x) / self.cell).floor() as i32, ((z - self.min_z) / self.cell).floor() as i32)
    }
    fn is_open(&self, c: i32, r: i32) -> bool {
        c >= 0 && r >= 0 && c < self.cols && r < self.rows && self.open[(r * self.cols + c) as usize]
    }
    /// Octile A* with no corner cutting.
    fn path(&self, from: (i32, i32), to: (i32, i32)) -> Option<Vec<(i32, i32)>> {
        use std::cmp::Reverse;
        use std::collections::BinaryHeap;
        let n = (self.cols * self.rows) as usize;
        let idx = |c: i32, r: i32| (r * self.cols + c) as usize;
        let h = |c: i32, r: i32| {
            let (dx, dz) = ((c - to.0).abs() as f64, (r - to.1).abs() as f64);
            dx.max(dz) + (std::f64::consts::SQRT_2 - 1.0) * dx.min(dz)
        };
        let mut g = vec![f64::INFINITY; n];
        let mut came = vec![usize::MAX; n];
        let mut heap = BinaryHeap::new();
        g[idx(from.0, from.1)] = 0.0;
        heap.push((Reverse((h(from.0, from.1) * 1e6) as i64), from.0, from.1));
        while let Some((_, c, r)) = heap.pop() {
            if (c, r) == to {
                let mut out = vec![(c, r)];
                let mut at = idx(c, r);
                while came[at] != usize::MAX {
                    at = came[at];
                    out.push(((at as i32) % self.cols, (at as i32) / self.cols));
                }
                out.reverse();
                return Some(out);
            }
            let here = g[idx(c, r)];
            for (dc, dr) in [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)] {
                let (nc, nr) = (c + dc, r + dr);
                if !self.is_open(nc, nr) || (dc != 0 && dr != 0 && (!self.is_open(c + dc, r) || !self.is_open(c, r + dr))) {
                    continue;
                }
                let cost = here + if dc != 0 && dr != 0 { std::f64::consts::SQRT_2 } else { 1.0 };
                let ni = idx(nc, nr);
                if cost < g[ni] {
                    g[ni] = cost;
                    came[ni] = idx(c, r);
                    heap.push((Reverse(((cost + h(nc, nr)) * 1e6) as i64), nc, nr));
                }
            }
        }
        None
    }
}

/// `findRoute` in navigation.ts: straight when traversable, else grid A* smoothed by `traversable`.
fn find_route(w: &World, from: [f64; 3], to: [f64; 3]) -> Vec<[f64; 3]> {
    let p = Place::Vault;
    if w.traversable(from, to, p) {
        return vec![to];
    }
    let g = w.grid.as_ref().expect("grid built at load");
    let raise = |(c, r): (i32, i32)| {
        let (x, z) = g.center(c, r);
        [x, 0.0, z]
    };
    let on_floor = |pt: [f64; 3]| {
        let cell = g.cell_at(pt[0], pt[2]);
        g.is_open(cell.0, cell.1) && w.traversable(pt, raise(cell), p)
    };
    if !on_floor(from) || !on_floor(to) {
        return vec![];
    }
    let Some(cells) = g.path(g.cell_at(from[0], from[2]), g.cell_at(to[0], to[2])) else { return vec![] };
    let pts: Vec<[f64; 3]> = cells.into_iter().map(raise).collect();
    // Straight-run smoothing: from each kept point, jump to the farthest point it can walk to directly.
    let mut out = Vec::new();
    let mut i = 0;
    while i + 1 < pts.len() {
        let mut j = pts.len() - 1;
        while j > i + 1 && !w.traversable(pts[i], pts[j], p) {
            j -= 1;
        }
        out.push(pts[j]);
        i = j;
    }
    if out.is_empty() {
        out.push(to);
    }
    *out.last_mut().unwrap() = to;
    out
}

#[derive(Default, Debug)]
struct Route {
    goal: Option<[f64; 3]>,
    path: Vec<[f64; 3]>,
}

fn advance_route(w: &World, route: &mut Route, from: [f64; 3], goal: [f64; 3], budget: f64) -> [f64; 3] {
    if !(budget > 0.0) || !budget.is_finite() {
        return from;
    }
    let p = Place::Vault;
    if w.traversable(from, goal, p) {
        route.goal = Some(goal);
        route.path = vec![goal];
    } else if route.goal.is_none_or(|g| ground(g, goal) > w.nav_cell) || route.path.first().is_some_and(|n| !w.traversable(from, *n, p)) {
        route.goal = Some(goal);
        route.path = find_route(w, from, goal);
    }
    let (mut at, mut left) = (from, budget);
    while !route.path.is_empty() && left > 0.0 {
        let next = route.path[0];
        let remaining = ground(at, next);
        if remaining <= left {
            at = next;
            left -= remaining;
            route.path.remove(0);
        } else {
            let f = left / remaining;
            at = [at[0] + (next[0] - at[0]) * f, at[1], at[2] + (next[2] - at[2]) * f];
            left = 0.0;
        }
    }
    at
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum FitterMode {
    Route,
    Calling,
    Winding,
}

#[derive(Debug)]
struct Print {
    at: [f64; 3],
    mode: FitterMode,
    attack: f64,
    cooldown: f64,
    health: f64,
    facing: f64,
    seen_at_ms: Option<f64>,
    route: Route,
}

#[derive(Debug)]
struct Dive {
    elapsed: f64,
    health: f64,
    oxygen: f64,
    print: Print,
}

pub struct Rules {
    world: World,
    pub columns: [f64; COLUMNS],
    heading: f64,
    vx: f64,
    vz: f64,
    place: Place,
    dive: Option<Dive>,
    ticks: u64,
}

impl Rules {
    /// Start a scenario (`home` or `dive`) from the state the real tick booted it to.
    pub fn new(world: World, scenario: &str) -> Result<Self, String> {
        let start = match scenario {
            "home" => world.starts.home.clone(),
            "dive" => world.starts.dive.clone(),
            other => return Err(format!("unknown scenario {other}")),
        };
        let mut columns = [0.0; COLUMNS];
        columns[..start.len().min(COLUMNS)].copy_from_slice(&start[..start.len().min(COLUMNS)]);
        let dive = (scenario == "dive").then(|| Dive {
            elapsed: 0.0,
            health: 100.0,
            oxygen: 110.0,
            print: Print { at: world.fitter.spawn, mode: FitterMode::Route, attack: 0.0, cooldown: 0.0, health: 80.0, facing: 0.0, seen_at_ms: None, route: Route::default() },
        });
        Ok(Self {
            heading: columns[col::HEADING],
            ticks: columns[col::TICK] as u64,
            place: if dive.is_some() { Place::Vault } else { Place::Home },
            world,
            columns,
            vx: 0.0,
            vz: 0.0,
            dive,
        })
    }

    pub fn world(&self) -> &World {
        &self.world
    }

    /// One tick of `dt` seconds with the held movement bits (heading NaN keeps the current one).
    pub fn tick(&mut self, dt: f64, held: u32, heading: f64) -> f64 {
        if heading.is_finite() {
            self.heading = heading;
        }
        self.walk(dt, held);
        self.on_tick(dt);
        self.ticks += 1;
        let c = &mut self.columns;
        c[col::HEADING] = self.heading;
        c[col::TICK] = self.ticks as f64;
        c[col::MODE] = if self.dive.is_some() { MODE_DIVE } else { MODE_HOME };
        c[col::READY] = 1.0;
        dt
    }

    fn walk(&mut self, dt: f64, held: u32) {
        let m = &self.world.movement;
        let dt_m = dt.min(m.max_frame_seconds);
        let forward = (held & HELD_FORWARD != 0) as i32 as f64 - (held & HELD_BACK != 0) as i32 as f64;
        let right = (held & HELD_RIGHT != 0) as i32 as f64 - (held & HELD_LEFT != 0) as i32 as f64;
        let moving = forward != 0.0 || right != 0.0;
        let (fx, fz) = (self.heading.sin(), self.heading.cos());
        let (mut tx, mut tz) = (0.0, 0.0);
        if moving {
            let speed = m.walk_speed * m.walk_speed_multiplier * if forward < 0.0 { m.backpedal_speed_multiplier } else { 1.0 };
            tx = fx * forward + -fz * right;
            tz = fz * forward + fx * right;
            let len = (tx * tx + tz * tz).sqrt();
            let scale = speed * len.min(1.0) / len;
            tx *= scale;
            tz *= scale;
        }
        let blend = 1.0 - (-m.ground_acceleration * dt_m).exp();
        self.vx += (tx - self.vx) * blend;
        self.vz += (tz - self.vz) * blend;
        if !moving {
            let friction = (-m.ground_friction * dt_m).exp();
            self.vx *= friction;
            self.vz *= friction;
        }
        // Deepward's beforeCommit: subdivide the step and slide along walls axis by axis.
        let (cx, cz) = (self.columns[col::X], self.columns[col::Z]);
        let (nx, nz) = (cx + self.vx * dt_m, cz + self.vz * dt_m);
        let steps = ((nx - cx).hypot(nz - cz) / 0.15).ceil().max(1.0);
        let (dx, dz) = ((nx - cx) / steps, (nz - cz) / steps);
        let (mut x, mut z) = (cx, cz);
        let (w, p, r) = (&self.world, self.place, self.world.radius);
        for _ in 0..steps as i32 {
            if w.walkable(x + dx, z + dz, p, r) {
                x += dx;
                z += dz;
            } else if w.walkable(x + dx, z, p, r) {
                x += dx;
            } else if w.walkable(x, z + dz, p, r) {
                z += dz;
            }
        }
        self.columns[col::X] = x;
        self.columns[col::Z] = z;
    }

    fn drain(&mut self, dt: f64, food_mod: f64, water_mod: f64) {
        for m in &self.world.body.meters {
            let (i, k) = if m.id == "food" { (col::FOOD, food_mod) } else { (col::WATER, water_mod) };
            self.columns[i] = (self.columns[i] - m.rate * k * dt).clamp(0.0, m.max);
        }
    }

    fn on_tick(&mut self, dt: f64) {
        let b = &self.world.body;
        let (home_drain, vault_food, vault_water) = (b.home_drain, b.vault_drain.food, b.vault_drain.water);
        let Some(mut dive) = self.dive.take() else {
            self.drain(dt, home_drain, home_drain);
            let b = &self.world.body;
            if self.columns[col::FOOD] < b.galley_feeds_below {
                self.columns[col::FOOD] = (self.columns[col::FOOD] + b.meal.food).min(100.0);
            }
            if self.columns[col::WATER] < b.galley_feeds_below {
                self.columns[col::WATER] = (self.columns[col::WATER] + b.meal.water).min(100.0);
            }
            return;
        };
        self.drain(dt, vault_food, vault_water);
        let empty = (self.columns[col::FOOD] <= 0.0) as i32 + (self.columns[col::WATER] <= 0.0) as i32;
        dive.elapsed += dt;
        dive.oxygen = (dive.oxygen - self.world.body.vault_drain.air * dt).max(0.0);
        dive.health = (dive.health - empty as f64 * 1.5 * dt).max(0.0);
        let at = [self.columns[col::X], 0.0, self.columns[col::Z]];
        self.fitter(&mut dive, at, dt);
        self.dive = Some(dive);
    }

    fn fitter(&self, dive: &mut Dive, at: [f64; 3], dt: f64) {
        let w = &self.world;
        let f = &w.fitter;
        let p = &mut dive.print;
        p.cooldown = (p.cooldown - dt).max(0.0);
        if p.health <= 0.0 {
            return;
        }
        let now_ms = dive.elapsed * 1000.0;
        let range = ground(at, p.at);
        // Senses: a sighting needs range, the cone and a clear line; memory fades over memorySeconds.
        if range <= f.sight {
            let mut delta = (at[0] - p.at[0]).atan2(at[2] - p.at[2]) - p.facing;
            while delta > std::f64::consts::PI {
                delta -= std::f64::consts::TAU;
            }
            while delta < -std::f64::consts::PI {
                delta += std::f64::consts::TAU;
            }
            if (range < 1e-9 || delta.abs() <= f.cone_deg.to_radians() / 2.0) && w.line_of_sight(p.at, at, Place::Vault) {
                p.seen_at_ms = Some(now_ms);
            }
        }
        let alert = p.seen_at_ms.is_some_and(|t| now_ms - t < f.memory_seconds * 1000.0);
        let sees = alert && at[2] < f.receiving_back_z;
        match p.mode {
            FitterMode::Winding => {
                p.attack = (p.attack - dt).max(0.0);
                if p.attack == 0.0 {
                    if range < 2.3 && w.line_of_sight(at, p.at, Place::Vault) {
                        dive.health = (dive.health - 22.0).max(0.0);
                    }
                    p.mode = FitterMode::Calling;
                    p.cooldown = 1.2;
                }
            }
            _ if sees || (p.mode == FitterMode::Calling && range < 18.0 && at[2] < f.receiving_back_z && w.line_of_sight(at, p.at, Place::Vault)) => {
                p.mode = FitterMode::Calling;
                if range < 1.9 && p.cooldown == 0.0 {
                    p.mode = FitterMode::Winding;
                    p.attack = 0.7;
                } else if range >= 1.9 {
                    let from = p.at;
                    p.at = advance_route(w, &mut p.route, p.at, at, (range - 1.7).min(dt * f.speed));
                    if p.at[0] != from[0] || p.at[2] != from[2] {
                        p.facing = (p.at[0] - from[0]).atan2(p.at[2] - from[2]);
                    }
                }
            }
            _ => {
                p.mode = FitterMode::Route;
                let e = dive.elapsed;
                let goal = [f.spawn[0] + (e * 0.4).sin(), f.spawn[1], f.spawn[2] + (e * 0.3).sin() * 2.0];
                if ground(p.at, goal) > 0.0 {
                    let from = p.at;
                    p.at = advance_route(w, &mut p.route, p.at, goal, dt * f.speed);
                    if p.at[0] != from[0] || p.at[2] != from[2] {
                        p.facing = (p.at[0] - from[0]).atan2(p.at[2] - from[2]);
                    }
                }
            }
        }
    }
}
