//! `jg-native <recording-dir> [--rules none|js|rust] [--bundle rules.js] [--world world.json]
//!            [--scenario home|dive] [--seconds S] [--no-hud] [--out result.json]`
//!
//! The native frame, in one window at the recording's size, presented uncapped (`Immediate`):
//! each frame ticks the game rules at a fixed 60 Hz (the real TypeScript tick in embedded V8, or
//! the Rust port), runs the per-object scene update, replays the recorded frame that three drew at
//! the same moment of the camera path, and draws the Rune HUD over it in the same pass as the
//! present copy. Prints and writes one JSON result: frame ms p50/p99, CPU ms, GPU ms (timestamps), fps.

mod gpu_timer;
mod scene;

use std::sync::Arc;
use std::time::Instant;
use winit::application::ApplicationHandler;
use winit::dpi::PhysicalSize;
use winit::event::WindowEvent;
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop};
use winit::window::{Window, WindowId};

enum RulesHost {
    None,
    Js(Box<jg_v8::JsRules>),
    Rust(Box<jg_rules::Rules>),
}

impl RulesHost {
    fn tick(&mut self, dt: f64, held: u32) -> Result<(), String> {
        match self {
            RulesHost::None => Ok(()),
            RulesHost::Js(r) => r.tick(dt, held, f64::NAN).map(|_| ()),
            RulesHost::Rust(r) => {
                r.tick(dt, held, f64::NAN);
                Ok(())
            }
        }
    }
    fn columns(&self) -> &[f64] {
        match self {
            RulesHost::None => &[],
            RulesHost::Js(r) => r.columns(),
            RulesHost::Rust(r) => &r.columns,
        }
    }
}

struct Args {
    recording: String,
    rules: String,
    bundle: String,
    world: String,
    scenario: String,
    seconds: Option<f64>,
    hud: bool,
    out: Option<String>,
}

fn parse_args() -> Result<Args, String> {
    let a: Vec<String> = std::env::args().collect();
    let get = |k: &str| a.iter().position(|x| x == k).and_then(|i| a.get(i + 1)).cloned();
    Ok(Args {
        recording: a.get(1).filter(|s| !s.starts_with("--")).cloned().ok_or("usage: jg-native <recording-dir> [--rules none|js|rust] ...")?,
        rules: get("--rules").unwrap_or_else(|| "none".into()),
        bundle: get("--bundle").unwrap_or_default(),
        world: get("--world").unwrap_or_default(),
        scenario: get("--scenario").unwrap_or_else(|| "home".into()),
        seconds: get("--seconds").and_then(|s| s.parse().ok()),
        hud: !a.iter().any(|x| x == "--no-hud"),
        out: get("--out"),
    })
}

/// The perf walk: W held, A and D swapped every 1.5 s.
fn walk_held(t: f64) -> u32 {
    jg_rules::HELD_FORWARD | if ((t / 1.5).floor() as i64) % 2 == 0 { jg_rules::HELD_LEFT } else { jg_rules::HELD_RIGHT }
}

struct Run {
    window: Arc<Window>,
    surface: wgpu::Surface<'static>,
    format: wgpu::TextureFormat,
    present_mode: wgpu::PresentMode,
    device: wgpu::Device,
    queue: wgpu::Queue,
    adapter: String,
    replay: jg_render::Replayer,
    hud: Option<jg_hud::Hud>,
    hud_state: jg_hud::HudState,
    rules: RulesHost,
    scene: scene::SceneModel,
    timer: Option<gpu_timer::GpuTimer>,
    errors: Arc<std::sync::Mutex<Vec<String>>>,
    // Timing.
    started: Option<Instant>,
    last_present: Option<Instant>,
    rules_clock: f64,
    rules_ticks: u64,
    drawn: Option<usize>,
    duration: f64,
    frame_ms: Vec<f64>,
    cpu_ms: Vec<f64>,
    rules_ms: Vec<f64>,
    redrawn: u64,
    skipped: u64,
}

struct App {
    args: Args,
    run: Option<Run>,
    failure: Option<String>,
    result: Option<String>,
}

fn quantile(v: &[f64], p: f64) -> f64 {
    if v.is_empty() {
        return f64::NAN;
    }
    let mut s = v.to_vec();
    s.sort_by(f64::total_cmp);
    s[((p * s.len() as f64) as usize).min(s.len() - 1)]
}

impl App {
    fn start(&mut self, el: &ActiveEventLoop) -> Result<(), String> {
        let rec = jg_scene::Recording::load(std::path::Path::new(&self.args.recording))?;
        let [w, h] = rec.manifest.canvas;
        let t0 = rec.manifest.times.first().copied().unwrap_or(0.0);
        let recorded = (rec.manifest.times.last().copied().unwrap_or(t0) - t0) / 1000.0;
        let window = Arc::new(
            el.create_window(Window::default_attributes().with_title("jg-native").with_inner_size(PhysicalSize::new(w, h)).with_resizable(false))
                .map_err(|e| e.to_string())?,
        );
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle_from_env());
        let surface = instance.create_surface(window.clone()).map_err(|e| e.to_string())?;
        let (adapter, device, queue) = pollster::block_on(jg_render::device(&instance, Some(&surface)))?;
        let info = adapter.get_info();
        let errors = Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
        {
            let errors = errors.clone();
            device.on_uncaptured_error(Arc::new(move |e| errors.lock().unwrap().push(e.to_string())));
        }
        let caps = surface.get_capabilities(&adapter);
        // The canvas holds display-referred sRGB bytes: present through a non-sRGB view so they pass unchanged.
        let format = caps.formats.iter().copied().find(|f| !f.is_srgb() && matches!(f, wgpu::TextureFormat::Bgra8Unorm | wgpu::TextureFormat::Rgba8Unorm)).ok_or("no 8-bit unorm surface format")?;
        let present_mode = [wgpu::PresentMode::Immediate, wgpu::PresentMode::Mailbox].into_iter().find(|m| caps.present_modes.contains(m)).ok_or("surface offers no uncapped present mode")?;
        let size = window.inner_size();
        if (size.width, size.height) != (w, h) {
            return Err(format!("window is {}x{}, recording is {w}x{h}: set display scale to 100% or use a larger monitor", size.width, size.height));
        }
        surface.configure(&device, &wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width: w,
            height: h,
            present_mode,
            desired_maximum_frame_latency: 2,
            alpha_mode: caps.alpha_modes[0],
            view_formats: vec![],
        });
        let draws = rec.frames.iter().map(|f| f.iter().filter(|e| matches!(e, jg_scene::Event::Draw(_))).count()).max().unwrap_or(0);
        let objects = rec.manifest.objects.len();
        let replay = jg_render::Replayer::new(device.clone(), queue.clone(), rec)?;
        let rules = match self.args.rules.as_str() {
            "none" => RulesHost::None,
            "js" => {
                let src = std::fs::read_to_string(&self.args.bundle).map_err(|e| format!("--bundle {}: {e}", self.args.bundle))?;
                RulesHost::Js(Box::new(jg_v8::JsRules::load(&src, &self.args.scenario)?))
            }
            "rust" => {
                let src = std::fs::read_to_string(&self.args.world).map_err(|e| format!("--world {}: {e}", self.args.world))?;
                RulesHost::Rust(Box::new(jg_rules::Rules::new(jg_rules::World::load(&src)?, &self.args.scenario)?))
            }
            other => return Err(format!("unknown --rules {other}")),
        };
        let hud = self.args.hud.then(|| jg_hud::Hud::new(&device, format, (w, h)));
        let timer = device.features().contains(wgpu::Features::TIMESTAMP_QUERY | wgpu::Features::TIMESTAMP_QUERY_INSIDE_ENCODERS).then(|| gpu_timer::GpuTimer::new(&device, &queue));
        eprintln!("jg-native: {} ({:?}), {:?} {:?}, {w}x{h}, rules {}, hud {}, {objects} objects, up to {draws} draws a frame", info.name, info.backend, format, present_mode, self.args.rules, self.args.hud);
        self.run = Some(Run {
            window,
            surface,
            format,
            present_mode,
            device,
            queue,
            adapter: format!("{} ({:?})", info.name, info.backend),
            replay,
            hud,
            hud_state: jg_hud::HudState::default(),
            rules,
            scene: scene::SceneModel::new(objects.max(1), draws.max(1)),
            timer,
            errors,
            started: None,
            last_present: None,
            rules_clock: 0.0,
            rules_ticks: 0,
            drawn: None,
            duration: self.args.seconds.unwrap_or(recorded),
            frame_ms: Vec::new(),
            cpu_ms: Vec::new(),
            rules_ms: Vec::new(),
            redrawn: 0,
            skipped: 0,
        });
        Ok(())
    }
}

impl Run {
    /// One presented frame. Returns false once the run's duration has elapsed.
    fn frame(&mut self) -> Result<bool, String> {
        let now = Instant::now();
        let started = *self.started.get_or_insert(now);
        let t = now.duration_since(started).as_secs_f64();
        if t >= self.duration {
            return Ok(false);
        }
        // Rules: fixed 60 Hz ticks up to now.
        let dt = 1.0 / 60.0;
        while self.rules_clock + dt <= t {
            let s = Instant::now();
            self.rules.tick(dt, walk_held(self.rules_clock))?;
            self.rules_ms.push(s.elapsed().as_secs_f64() * 1e3);
            self.rules_clock += dt;
            self.rules_ticks += 1;
        }
        let cols = self.rules.columns();
        if cols.len() > 5 {
            self.hud_state.stats[4].1 = format!("{}", cols[4].round() as i64);
            self.hud_state.stats[5].1 = format!("{}", cols[5].round() as i64);
        }
        // The recorded frame three drew at this moment of the camera path.
        let times = &self.replay.rec.manifest.times;
        let t0 = times[0];
        let target = times.partition_point(|x| (x - t0) / 1000.0 <= t).saturating_sub(1).min(self.replay.frame_count() - 1);
        match self.drawn {
            Some(d) if d == target => self.redrawn += 1,
            Some(d) => {
                for f in d + 1..target {
                    self.replay.skip(f);
                    self.skipped += 1;
                }
            }
            None => {
                for f in 0..target {
                    self.replay.skip(f);
                }
            }
        }
        self.drawn = Some(target);
        // Scene update: the per-object matrices, culling and sort a native scene graph does each frame.
        self.scene.update(t);
        let mut encoder = self.device.create_command_encoder(&Default::default());
        let slot = self.timer.as_mut().and_then(|g| g.begin(&mut encoder));
        self.replay.frame(&mut encoder, target)?;
        self.replay.finish_frame();
        if let Some(h) = self.hud.as_mut() {
            h.update(&self.hud_state, 1.0 / 60.0);
            h.prepare(&self.device, &self.queue);
        }
        let cpu_before_acquire = now.elapsed();
        let frame = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(f) | wgpu::CurrentSurfaceTexture::Suboptimal(f) => f,
            _ => return Err("the surface gave no frame (timeout, occluded, outdated or lost)".into()),
        };
        let acquired = Instant::now();
        let view = frame.texture.create_view(&Default::default());
        self.replay.present_to(&mut encoder, &view, self.format);
        if let Some(h) = self.hud.as_ref() {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("hud"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment { view: &view, depth_slice: None, resolve_target: None, ops: wgpu::Operations { load: wgpu::LoadOp::Load, store: wgpu::StoreOp::Store } })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            h.draw(&mut pass);
        }
        if let (Some(g), Some(s)) = (self.timer.as_mut(), slot) {
            g.end(&mut encoder, s);
        }
        self.queue.submit([encoder.finish()]);
        if let (Some(g), Some(s)) = (self.timer.as_mut(), slot) {
            g.after_submit(s);
        }
        self.window.pre_present_notify();
        frame.present();
        let done = Instant::now();
        if let Some(g) = self.timer.as_mut() {
            g.poll(&self.device);
        }
        {
            let errs = self.errors.lock().unwrap();
            if !errs.is_empty() {
                return Err(format!("wgpu error: {}", errs.join("\n")));
            }
        }
        // CPU ms: the frame's work on this thread, without time spent blocked acquiring the swapchain image.
        self.cpu_ms.push((cpu_before_acquire + done.duration_since(acquired)).as_secs_f64() * 1e3);
        if let Some(last) = self.last_present {
            self.frame_ms.push(done.duration_since(last).as_secs_f64() * 1e3);
        }
        self.last_present = Some(done);
        Ok(true)
    }

    fn result(&mut self, args: &Args) -> String {
        if let Some(g) = self.timer.as_mut() {
            g.drain(&self.device);
        }
        let frames = self.frame_ms.len() + 1;
        let elapsed = self.frame_ms.iter().sum::<f64>() / 1000.0;
        let gpu = self.timer.as_ref().map(|g| g.ms.clone()).unwrap_or_default();
        let cols = self.rules.columns();
        format!(
            "{{\"renderer\":\"jg-native\",\"adapter\":{:?},\"presentMode\":\"{:?}\",\"rules\":\"{}\",\"scenario\":\"{}\",\"hud\":{},\"hudInstances\":{},\"seconds\":{:.2},\"frames\":{frames},\"fps\":{:.1},\"frameP50\":{:.3},\"frameP99\":{:.3},\"cpuP50\":{:.3},\"cpuP99\":{:.3},\"gpuP50\":{:.3},\"gpuP99\":{:.3},\"gpuSamples\":{},\"rulesTicks\":{},\"rulesP50\":{:.4},\"rulesP99\":{:.4},\"sceneP50\":{:.4},\"recordedFramesRedrawn\":{},\"recordedFramesSkipped\":{},\"player\":[{:.3},{:.3}]}}",
            self.adapter,
            self.present_mode,
            args.rules,
            args.scenario,
            self.hud.is_some(),
            self.hud.as_ref().map_or(0, |h| h.instances()),
            elapsed,
            (frames - 1) as f64 / elapsed.max(1e-9),
            quantile(&self.frame_ms, 0.5),
            quantile(&self.frame_ms, 0.99),
            quantile(&self.cpu_ms, 0.5),
            quantile(&self.cpu_ms, 0.99),
            quantile(&gpu, 0.5),
            quantile(&gpu, 0.99),
            gpu.len(),
            self.rules_ticks,
            quantile(&self.rules_ms, 0.5),
            quantile(&self.rules_ms, 0.99),
            quantile(&self.scene.ms, 0.5),
            self.redrawn,
            self.skipped,
            cols.first().copied().unwrap_or(f64::NAN),
            cols.get(2).copied().unwrap_or(f64::NAN),
        )
    }
}

impl ApplicationHandler for App {
    fn resumed(&mut self, el: &ActiveEventLoop) {
        if self.run.is_none() && self.failure.is_none() {
            if let Err(e) = self.start(el) {
                self.failure = Some(e);
                el.exit();
            }
        }
    }

    fn window_event(&mut self, el: &ActiveEventLoop, _id: WindowId, event: WindowEvent) {
        match event {
            WindowEvent::CloseRequested => el.exit(),
            WindowEvent::RedrawRequested => {
                let Some(run) = self.run.as_mut() else { return };
                match run.frame() {
                    Ok(true) => run.window.request_redraw(),
                    Ok(false) => {
                        self.result = Some(run.result(&self.args));
                        el.exit();
                    }
                    Err(e) => {
                        self.failure = Some(e);
                        el.exit();
                    }
                }
            }
            _ => {}
        }
    }

    fn about_to_wait(&mut self, _el: &ActiveEventLoop) {
        if let Some(run) = self.run.as_ref() {
            run.window.request_redraw();
        }
    }
}

fn main() {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("jg-native: {e}");
            std::process::exit(2);
        }
    };
    let event_loop = EventLoop::new().expect("event loop");
    event_loop.set_control_flow(ControlFlow::Poll);
    let mut app = App { args, run: None, failure: None, result: None };
    event_loop.run_app(&mut app).expect("event loop run");
    if let Some(e) = app.failure {
        eprintln!("jg-native: {e}");
        std::process::exit(1);
    }
    let result = app.result.unwrap_or_else(|| "{\"error\":\"window closed before the run finished\"}".into());
    println!("{result}");
    if let Some(out) = &app.args.out {
        std::fs::write(out, format!("{result}\n")).expect("write --out");
    }
}
