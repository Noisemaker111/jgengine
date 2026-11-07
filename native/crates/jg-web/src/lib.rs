//! Row D: the replay from jg-render compiled to wasm32 and drawn with WebGPU into a canvas.
//! `native/web/index.html` fetches an export, calls [`start`], then drives [`WebRun::frame`] from
//! `requestAnimationFrame` along the recorded camera path and checks pixels against three's readbacks
//! with [`WebRun::draw_in_order`]. Native targets compile this crate to nothing.

#[cfg(target_arch = "wasm32")]
mod web {
    use std::collections::HashMap;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicU8, Ordering};
    use wasm_bindgen::prelude::*;

    fn err(e: impl std::fmt::Display) -> JsValue {
        JsValue::from_str(&e.to_string())
    }

    /// GPU span of a frame: empty compute passes stamp the start and end of the frame's encoder
    /// (WebGPU only writes timestamps at pass boundaries).
    struct Stamps {
        set: wgpu::QuerySet,
        resolve: wgpu::Buffer,
        readback: Vec<wgpu::Buffer>,
        state: Vec<Arc<AtomicU8>>,
        next: u32,
        period: f64,
        ms: Vec<f64>,
    }

    const SLOTS: u32 = 8;

    impl Stamps {
        fn new(device: &wgpu::Device, queue: &wgpu::Queue) -> Stamps {
            Stamps {
                set: device.create_query_set(&wgpu::QuerySetDescriptor { label: None, ty: wgpu::QueryType::Timestamp, count: SLOTS * 2 }),
                resolve: device.create_buffer(&wgpu::BufferDescriptor { label: None, size: (SLOTS * 16) as u64, usage: wgpu::BufferUsages::QUERY_RESOLVE | wgpu::BufferUsages::COPY_SRC, mapped_at_creation: false }),
                readback: (0..SLOTS).map(|_| device.create_buffer(&wgpu::BufferDescriptor { label: None, size: 16, usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ, mapped_at_creation: false })).collect(),
                state: (0..SLOTS).map(|_| Arc::new(AtomicU8::new(0))).collect(),
                next: 0,
                period: queue.get_timestamp_period() as f64,
                ms: Vec::new(),
            }
        }
        fn stamp(&self, encoder: &mut wgpu::CommandEncoder, index: u32, end: bool) {
            let writes = wgpu::ComputePassTimestampWrites { query_set: &self.set, beginning_of_pass_write_index: (!end).then_some(index), end_of_pass_write_index: end.then_some(index) };
            drop(encoder.begin_compute_pass(&wgpu::ComputePassDescriptor { label: None, timestamp_writes: Some(writes) }));
        }
        fn begin(&mut self, encoder: &mut wgpu::CommandEncoder) -> Option<u32> {
            let s = self.next;
            if self.state[s as usize].load(Ordering::Acquire) != 0 {
                return None;
            }
            self.next = (s + 1) % SLOTS;
            self.stamp(encoder, s * 2, false);
            Some(s)
        }
        fn end(&mut self, encoder: &mut wgpu::CommandEncoder, s: u32) {
            self.stamp(encoder, s * 2 + 1, true);
            encoder.resolve_query_set(&self.set, s * 2..s * 2 + 2, &self.resolve, (s * 16) as u64);
            encoder.copy_buffer_to_buffer(&self.resolve, (s * 16) as u64, &self.readback[s as usize], 0, 16);
        }
        fn after_submit(&mut self, s: u32) {
            let st = self.state[s as usize].clone();
            st.store(1, Ordering::Release);
            self.readback[s as usize].map_async(wgpu::MapMode::Read, .., move |r| st.store(if r.is_ok() { 2 } else { 0 }, Ordering::Release));
        }
        fn collect(&mut self) {
            for (i, st) in self.state.iter().enumerate() {
                if st.load(Ordering::Acquire) != 2 {
                    continue;
                }
                {
                    let d = self.readback[i].get_mapped_range(..).expect("mapped");
                    let t0 = u64::from_le_bytes(d[0..8].try_into().unwrap());
                    let t1 = u64::from_le_bytes(d[8..16].try_into().unwrap());
                    if t1 > t0 {
                        self.ms.push((t1 - t0) as f64 * self.period / 1e6);
                    }
                }
                self.readback[i].unmap();
                st.store(0, Ordering::Release);
            }
        }
    }

    #[wasm_bindgen]
    pub struct WebRun {
        surface: wgpu::Surface<'static>,
        format: wgpu::TextureFormat,
        device: wgpu::Device,
        queue: wgpu::Queue,
        replay: jg_render::Replayer,
        stamps: Option<Stamps>,
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
        let stamps = device.features().contains(wgpu::Features::TIMESTAMP_QUERY).then(|| Stamps::new(&device, &queue));
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
