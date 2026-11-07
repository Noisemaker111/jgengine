//! Deepward's HUD drawn with Rune, in the same window and frame as the 3D: the visor rim and
//! glare, the departure docket, the pause chip and the radio line. Sizes, colours and type come
//! from the game's `style.css` and the HUD reference captured with the scene
//! (`ref/start.hud.json`).
//!
//! Rune gaps met (Rune takes no pull requests; each is worked around here):
//! - Corner radii are circular; the visor rim's CSS radius is elliptical (9vmin / 12vmin), drawn
//!   as the mean.
//! - No `clip-path`: the frames' cut corners and the docket's torn edge are drawn as shapes.
//! - No text shadow: the radio line's 1px shadow is a second, offset text below it.
//! - `Renderer::draw_over` (load instead of clear) is crate-private; the HUD draws through
//!   `draw_range`, into the pass the frame already has open.

use rune::render::Renderer;
use rune::text::TextSystem;
use rune::{Color, Cx, El, Env, Family, Runtime, Shadow, TextCase, TextStyle, col, el, row, text};

pub const RAJDHANI_SEMIBOLD: &[u8] = include_bytes!("../assets/rajdhani_Rajdhani-SemiBold.ttf");
pub const RAJDHANI_BOLD: &[u8] = include_bytes!("../assets/rajdhani_Rajdhani-Bold.ttf");
pub const SHARE_TECH_MONO: &[u8] = include_bytes!("../assets/sharetechmono_ShareTechMono-Regular.ttf");

/// What the HUD shows; the rules fill it every tick.
#[derive(Clone, Debug, PartialEq)]
pub struct HudState {
    pub line: String,
    pub life: String,
    pub title: String,
    pub brief: String,
    pub stats: [(String, String); 8],
    pub next: String,
    pub standing: String,
    pub radio: String,
    pub size: (f32, f32),
}

impl Default for HudState {
    fn default() -> Self {
        let s = |a: &str, b: &str| (a.to_string(), b.to_string());
        HudState {
            line: "Marrow · line 06".into(),
            life: "Life 01".into(),
            title: "Rail departure / 06".into(),
            brief: "Halloway: A generator in a bay and Marrow can run a still and a growbed while you're down there.".into(),
            stats: [s("Scrip", "0"), s("Stash", "0"), s("Returns", "0"), s("Lost", "0"), s("Food", "100"), s("Water", "99"), s("Galley", "3 / 3"), s("Power", "0")],
            next: "Bring food and water home from the receiving shelves · issue sidearm".into(),
            standing: "unlogged / 0".into(),
            radio: "Walk to the Garage. E to take the rail to Bellwether.".into(),
            size: (1920.0, 1080.0),
        }
    }
}

fn c(hex: &str) -> Color {
    rune::color::hex(hex).unwrap_or(Color::BLACK)
}

fn ca(hex: &str, a: f32) -> Color {
    c(hex).alpha(a)
}

fn mono(size: f32, tracking_em: f32) -> TextStyle {
    TextStyle { size, weight: 400.0, family: Family::Named("Share Tech Mono"), tracking: tracking_em * size, ..TextStyle::new(size, 400.0) }
}

fn rajdhani(size: f32, line: f32) -> TextStyle {
    TextStyle { size, weight: 600.0, family: Family::Named("Rajdhani"), line_height: line * size, ..TextStyle::new(size, 600.0) }
}

/// A key cap: Share Tech Mono on a brass gradient.
fn kbd(label: &str) -> El {
    el().child(text(label).font(mono(11.0, 0.0)).color(c("#17120a"))).px(5.0).pt(3.0).pb(2.0).gradient(c("#e9cf8f"), c("#b8934a")).shadow(2.0, 0.0, c("#5e4718")).radius(1.5)
}

fn visor(w: f32, h: f32) -> El {
    // .dw-visor-rim: inset 10px 8px, radius 9vmin/12vmin, a 60px #020709 surround and three inset
    // shadows; .dw-visor-glare: a 118deg streak and a radial bloom at the top right.
    let vmin = w.min(h) / 100.0;
    let radius = (9.0 * vmin + 12.0 * vmin) * 0.5;
    let rim = el()
        .absolute(8.0, 10.0)
        .w(w - 16.0)
        .h(h - 20.0)
        .radius(radius)
        .box_shadow(Shadow { x: 0.0, y: 0.0, blur: 0.0, spread: 60.0, color: c("#020709"), inset: false })
        .child(el().w_full().h_full().radius(radius).box_shadow(Shadow { x: 0.0, y: 0.0, blur: 16.0 * vmin, spread: 0.0, color: ca("#01090b", 0.62), inset: true }))
        .child(el().absolute(0.0, 0.0).w_full().h_full().radius(radius).box_shadow(Shadow { x: 0.0, y: 0.0, blur: 0.0, spread: 7.0, color: ca("#020709", 0.6), inset: true }))
        .child(el().absolute(0.0, 0.0).w_full().h_full().radius(radius).border(1.0, ca("#9cddd1", 0.2)));
    let streak = el().absolute(0.0, 0.0).w(w).h(h).linear_gradient(118f32.to_radians(), [(0.0, ca("#d2faf4", 0.09)), (0.16, ca("#d2faf4", 0.02)), (0.24, ca("#d2faf4", 0.0))]);
    let bloom = el().absolute(0.0, 0.0).w(w).h(h).radial_gradient([0.8, 0.04], [0.6 * w, 0.2 * h], [(0.0, ca("#d2faf4", 0.06)), (0.7, ca("#d2faf4", 0.0))]);
    el().absolute(0.0, 0.0).w(w).h(h).child(rim).child(streak).child(bloom)
}

fn pause_chip(w: f32) -> El {
    let icon = row().gap(2.0).child(el().w(3.0).h(11.0).fill(c("#e2bd6e"))).child(el().w(3.0).h(11.0).fill(c("#e2bd6e")));
    let face = row().items_center().justify_center().gap(9.0).w(106.0).h(30.0).fill(c("#22363f")).radial_gradient([0.11, 0.4], 30.0, [(0.0, Color::WHITE.alpha(0.12)), (1.0, Color::WHITE.alpha(0.0))]).child(icon).child(kbd("Esc"));
    el().absolute(w - 126.0, 16.0).padding(2.0).fill(c("#04090b")).child(face)
}

fn stat(label: &str, value: &str) -> El {
    col().w(60.0).child(text(label).font(mono(10.0, 0.08)).text_case(TextCase::Uppercase).color(c("#6b5536"))).child(text(value).font(mono(22.0, 0.0)).color(c("#20180e")).mt(2.0))
}

fn labelled(tag: &str, body: &str) -> El {
    // `<b>` tag then the sentence, wrapping as one paragraph.
    row()
        .flex_wrap()
        .items_end()
        .child(text(tag).font(mono(10.0, 0.12)).text_case(TextCase::Uppercase).color(c("#8a6a3a")).mr(4.0))
        .child(text(body).font(rajdhani(13.0, 1.3)).color(c("#3a2d1d")).wrap().max_w(252.0))
}

fn docket(s: &HudState) -> El {
    let line = row().justify_between().pb(6.0).child(text(&s.line).font(mono(11.0, 0.16)).text_case(TextCase::Uppercase).color(c("#6b5536"))).child(text(&s.life).font(mono(11.0, 0.16)).text_case(TextCase::Uppercase).color(c("#6b5536")));
    let rule = el().h(1.0).w_full().border(0.0, Color::TRANSPARENT).fill(ca("#2b2014", 0.4));
    let title = text(&s.title).font(TextStyle { line_height: 23.0 * 1.05, ..mono(23.0, 0.0) }).color(c("#20180e")).single_line().mt(8.0).mb(4.0);
    let brief = text(&s.brief).font(rajdhani(14.0, 1.25)).color(c("#4a3a26")).wrap();
    let grid = |range: std::ops::Range<usize>| row().gap(4.0).children(s.stats[range].iter().map(|(l, v)| stat(l, v)));
    let stats = col().mt(10.0).mb(8.0).py(6.0).gap(4.0).child(grid(0..4)).child(grid(4..8));
    let stats = col().child(el().h(2.0).w_full().fill(c("#2b2014"))).child(stats).child(el().h(1.0).w_full().fill(ca("#2b2014", 0.35)));
    let word = |w: &str| text(w).font(rajdhani(12.0, 1.2)).color(c("#5a4630")).ml(3.0).mr(3.0);
    let keys = row()
        .flex_wrap()
        .items_center()
        .mt(10.0)
        .children([kbd("W").ml(4.0), kbd("A"), kbd("S"), kbd("D"), word("walk"), kbd("E"), word("use"), kbd("F"), word("lamp"), kbd("Q"), word("eat"), kbd("G"), word("lure"), kbd("C"), word("scan"), kbd("Esc"), word("hold")]);
    let body = col().w(252.0).child(line).child(rule).child(title).child(brief).child(stats).child(labelled("Next", &s.next)).child(labelled("Standing", &s.standing).mt(0.0)).child(keys);
    // Paper face on the rim, with the drop shadow the CSS ::before gives it.
    let face = el().pl(18.0).pr(18.0).pt(14.0).pb(22.0).fill(c("#efe3c6")).child(body);
    el().absolute(16.0, 16.0).w(292.0).padding(2.0).fill(Color::BLACK.alpha(0.4)).box_shadow(Shadow { x: 0.0, y: 12.0, blur: 18.0, spread: 0.0, color: Color::BLACK.alpha(0.5), inset: false }).child(face)
}

fn comms(s: &HudState, w: f32, h: f32) -> El {
    let tag = row().items_center().justify_center().gap(6.0).child(el().w(6.0).h(6.0).radius(3.0).fill(c("#e2bd6e")).shadow(0.0, 6.0, c("#e2bd6e"))).child(text("Marrow radio").font(mono(10.0, 0.24)).text_case(TextCase::Uppercase).color(c("#e2bd6e")));
    let line = text(&s.radio).font(rajdhani(15.0, 1.3)).color(c("#e6f3ee")).align(rune::Align::Center);
    let shadow = text(&s.radio).font(rajdhani(15.0, 1.3)).color(Color::BLACK.alpha(0.85)).align(rune::Align::Center).absolute(0.0, 1.0).w_full();
    let lines = el().w_full().child(shadow).child(line);
    let bg = [(0.0, ca("#030c0e", 0.0)), (0.18, ca("#030c0e", 0.72)), (0.82, ca("#030c0e", 0.72)), (1.0, ca("#030c0e", 0.0))];
    let width = 460f32.min(0.7 * w);
    col().absolute((w - width) * 0.5, h - 63.0).w(width).gap(3.0).pt(6.0).pb(8.0).px(14.0).linear_gradient(std::f32::consts::FRAC_PI_2, bg).child(tag).child(lines)
}

fn view(s: &HudState, _cx: &mut Cx<HudState>) -> El {
    let (w, h) = s.size;
    el().w(w).h(h).child(visor(w, h)).child(docket(s)).child(pause_chip(w)).child(comms(s, w, h))
}

/// The HUD runtime and its renderer for one window.
pub struct Hud {
    rt: Runtime<HudState>,
    renderer: Renderer,
    format: wgpu::TextureFormat,
    size: (u32, u32),
}

impl Hud {
    pub fn new(device: &wgpu::Device, format: wgpu::TextureFormat, size: (u32, u32)) -> Hud {
        let fonts = TextSystem::new(&[RAJDHANI_SEMIBOLD, RAJDHANI_BOLD, SHARE_TECH_MONO], ("Rajdhani", "Share Tech Mono"));
        let state = HudState { size: (size.0 as f32, size.1 as f32), ..HudState::default() };
        let mut rt = Runtime::with_text(state, view, (size.0 as f32, size.1 as f32), Env::new(true, 1.0), fonts);
        rt.frame(0.0);
        let mut renderer = Renderer::new(device, format);
        // The 3D frame is display-referred sRGB already; blend the HUD in sRGB-encoded space
        // as the browser composites CSS over the canvas.
        renderer.set_srgb_blend(true);
        rt.set_srgb_blend(true);
        Hud { rt, renderer, format, size }
    }

    /// Apply the rules' values (a no-op when nothing changed) and advance animations.
    pub fn update(&mut self, next: &HudState, dt: f64) {
        let next = next.clone();
        self.rt.update_if(move |s, _| {
            let next = HudState { size: s.size, ..next };
            if *s == next {
                return false;
            }
            *s = next;
            true
        });
        self.rt.frame(dt);
    }

    /// Upload this frame's instances. Call before the pass that draws the HUD.
    pub fn prepare(&mut self, device: &wgpu::Device, queue: &wgpu::Queue) {
        self.renderer.prepare(device, queue, &mut self.rt.text.atlas, &self.rt.instances, self.size);
    }

    /// Draw into an open pass whose colour target has this HUD's format.
    pub fn draw(&self, pass: &mut wgpu::RenderPass<'_>) {
        self.renderer.draw_range(pass, self.format, 0..self.rt.instances.len() as u32);
    }

    pub fn instances(&self) -> usize {
        self.rt.instances.len()
    }
}
