//! Row D: the replay from jg-render compiled to wasm32 and drawn with WebGPU into a canvas.
//! `native/web/index.html` fetches an export, calls [`start`], then drives [`WebRun::frame`] from
//! `requestAnimationFrame` along the recorded camera path and checks pixels against three's readbacks
//! with [`WebRun::draw_in_order`]. Native targets compile this crate to nothing.

#[cfg(target_arch = "wasm32")]
mod web {
    use std::collections::HashMap;
    use std::sync::Arc;
    use wasm_bindgen::prelude::*;

    fn err(e: impl std::fmt::Display) -> JsValue {
        JsValue::from_str(&e.to_string())
    }

    #[wasm_bindgen]
    pub struct WebRun {
        surface: wgpu::Surface<'static>,
        format: wgpu::TextureFormat,
        device: wgpu::Device,
        queue: wgpu::Queue,
        replay: jg_render::Replayer,
        stamps: Option<jg_render::gpu_timer::GpuTimer>,
        drawn: Option<usize>,
        adapter: String,
        errors: Arc<std::sync::Mutex<Vec<String>>>,
    }

    /// Set up WebGPU on `canvas` and load an export: `stream` is stream.json's text, `data` and
    /// `readbacks` the two binaries, `programs` an object mapping three's program index to `[vert, frag]`.
    #[wasm_bindgen]
    pub async fn start(canvas: web_sys::HtmlCanvasElement, stream: String, data: js_sys::Uint8Array, readbacks: js_sys::Uint8Array, programs: JsValue) -> Result<WebRun, JsValue> {
        console_error_panic_hook::set_once();
        let manifest: jg_scene::Manifest = serde_json::from_str(&stream).map_err(err)?;
        let sources: HashMap<String, (String, String)> = serde_wasm(&programs)?;
        let programs = sources.into_iter().map(|(k, v)| Ok((k.parse::<usize>().map_err(err)?, v))).collect::<Result<HashMap<_, _>, JsValue>>()?;
        let rec = jg_scene::Recording::from_parts(manifest, data.to_vec(), readbacks.to_vec(), programs).map_err(err)?;
        let [w, h] = rec.manifest.canvas;
        canvas.set_width(w);
        canvas.set_height(h);
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor { backends: wgpu::Backends::BROWSER_WEBGPU, ..wgpu::InstanceDescriptor::new_without_display_handle() });
        let surface = instance.create_surface(wgpu::SurfaceTarget::Canvas(canvas)).map_err(err)?;
        let (adapter, device, queue) = jg_render::device(&instance, Some(&surface)).await.map_err(err)?;
        let info = adapter.get_info();
        let errors = Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
        {
            let errors = errors.clone();
            device.on_uncaptured_error(Arc::new(move |e| errors.lock().unwrap().push(e.to_string())));
        }
        let caps = surface.get_capabilities(&adapter);
        let format = caps.formats.iter().copied().find(|f| !f.is_srgb()).ok_or_else(|| err("no unorm canvas format"))?;
        surface.configure(&device, &wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width: w,
            height: h,
            present_mode: wgpu::PresentMode::Fifo,
            desired_maximum_frame_latency: 2,
            alpha_mode: caps.alpha_modes[0],
            view_formats: vec![],
            color_space: wgpu::SurfaceColorSpace::Auto,
        });
        let stamps = jg_render::gpu_timer::GpuTimer::new(&device, &queue);
        let replay = jg_render::Replayer::new(device.clone(), queue.clone(), rec).map_err(err)?;
        Ok(WebRun { surface, format, device, queue, replay, stamps, drawn: None, adapter: format!("{} ({:?})", info.name, info.backend), errors })
    }

    fn serde_wasm(v: &JsValue) -> Result<HashMap<String, (String, String)>, JsValue> {
        let text = js_sys::JSON::stringify(v)?.as_string().ok_or_else(|| err("programs did not stringify"))?;
        serde_json::from_str(&text).map_err(err)
    }

    #[wasm_bindgen]
    impl WebRun {
        pub fn adapter(&self) -> String {
            self.adapter.clone()
        }
        pub fn frame_count(&self) -> usize {
            self.replay.frame_count()
        }
        /// Seconds from the first recorded frame to each frame.
        pub fn times(&self) -> Vec<f64> {
            let t = &self.replay.rec.manifest.times;
            t.iter().map(|x| (x - t[0]) / 1000.0).collect()
        }
        pub fn readback_frames(&self) -> Vec<u32> {
            self.replay.rec.manifest.readbacks.iter().map(|r| r.frame as u32).collect()
        }
        /// three's pixels for a readback frame: RGBA8, bottom row first.
        pub fn readback(&self, frame: usize) -> Vec<u8> {
            self.replay.rec.readback(frame).map(|(_, b)| b.to_vec()).unwrap_or_default()
        }

        /// Draw the recorded frame three drew `t` seconds into the path (skipping or redrawing as the
        /// native player does) and present it. Returns CPU ms spent in this call.
        pub fn frame(&mut self, t: f64) -> Result<f64, JsValue> {
            let perf = web_sys::window().and_then(|w| w.performance()).ok_or_else(|| err("no performance"))?;
            let s = perf.now();
            let times = &self.replay.rec.manifest.times;
            let t0 = times[0];
            let target = times.partition_point(|x| (x - t0) / 1000.0 <= t).saturating_sub(1).min(self.replay.frame_count() - 1);
            match self.drawn {
                Some(d) if d >= target => {}
                Some(d) => (d + 1..target).for_each(|f| self.replay.skip(f)),
                None => (0..target).for_each(|f| self.replay.skip(f)),
            }
            let target = target.max(self.drawn.unwrap_or(0));
            self.drawn = Some(target);
            self.draw(target)?;
            Ok(perf.now() - s)
        }

        /// Draw frame `index` (the caller replays frames in order) and present it.
        pub fn draw_in_order(&mut self, index: usize) -> Result<(), JsValue> {
            self.drawn = Some(index);
            self.draw(index)
        }

        fn draw(&mut self, index: usize) -> Result<(), JsValue> {
            let mut encoder = self.device.create_command_encoder(&Default::default());
            let slot = self.stamps.as_mut().and_then(|g| g.begin(&mut encoder));
            self.replay.frame(&mut encoder, index).map_err(err)?;
            self.replay.finish_frame();
            let frame = match self.surface.get_current_texture() {
                wgpu::CurrentSurfaceTexture::Success(f) | wgpu::CurrentSurfaceTexture::Suboptimal(f) => f,
                _ => return Err(err("the canvas gave no texture")),
            };
            let view = frame.texture.create_view(&Default::default());
            self.replay.present_to(&mut encoder, &view, self.format);
            if let (Some(g), Some(s)) = (self.stamps.as_mut(), slot) {
                g.end(&mut encoder, s);
            }
            self.queue.submit([encoder.finish()]);
            if let (Some(g), Some(s)) = (self.stamps.as_mut(), slot) {
                g.after_submit(s);
                g.collect();
            }
            self.queue.present(frame);
            let errs = self.errors.lock().unwrap();
            if !errs.is_empty() {
                return Err(err(format!("WebGPU error: {}", errs.join("\n"))));
            }
            Ok(())
        }

        /// GPU ms per frame gathered so far.
        pub fn gpu_ms(&mut self) -> Vec<f64> {
            if let Some(g) = self.stamps.as_mut() {
                g.collect();
                return g.ms.clone();
            }
            Vec::new()
        }
    }
}
