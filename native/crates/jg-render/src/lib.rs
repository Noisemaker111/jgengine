//! Replays what three.js drew, with wgpu, to measure the same frame without the browser.

pub mod copy;
pub mod diff;
pub mod gl;
pub mod gpu_timer;
pub mod replay;
pub mod resources;

pub use replay::{FrameStats, Replayer};

/// The device features the replay uses when the adapter has them: BC textures (the games ship
/// BC7), filterable float32 textures, and GPU timestamps for GPU ms.
pub fn wanted_features(adapter: &wgpu::Adapter) -> wgpu::Features {
    let want = wgpu::Features::TEXTURE_COMPRESSION_BC | wgpu::Features::FLOAT32_FILTERABLE | wgpu::Features::TIMESTAMP_QUERY | wgpu::Features::TIMESTAMP_QUERY_INSIDE_ENCODERS;
    adapter.features() & want
}

/// The vertex buffers a draw may bind in Chrome's WebGPU (the spec's default limit).
pub const WEB_MAX_VERTEX_BUFFERS: u32 = 8;

/// A device on the high-performance adapter, with the adapter's own limits. `web_limits` holds the
/// vertex buffer count to Chrome's, so a native run exercises the path the web build takes.
pub async fn device(instance: &wgpu::Instance, surface: Option<&wgpu::Surface<'_>>, web_limits: bool) -> Result<(wgpu::Adapter, wgpu::Device, wgpu::Queue), String> {
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions { power_preference: wgpu::PowerPreference::HighPerformance, force_fallback_adapter: false, compatible_surface: surface, apply_limit_buckets: false })
        .await
        .map_err(|e| format!("no adapter: {e}"))?;
    let mut required_limits = adapter.limits();
    if web_limits {
        required_limits.max_vertex_buffers = required_limits.max_vertex_buffers.min(WEB_MAX_VERTEX_BUFFERS);
    }
    let (device, queue) = adapter
        .request_device(&wgpu::DeviceDescriptor { label: Some("jg"), required_features: wanted_features(&adapter), required_limits, experimental_features: wgpu::ExperimentalFeatures::disabled(), memory_hints: wgpu::MemoryHints::Performance, trace: wgpu::Trace::Off })
        .await
        .map_err(|e| format!("no device: {e}"))?;
    Ok((adapter, device, queue))
}
