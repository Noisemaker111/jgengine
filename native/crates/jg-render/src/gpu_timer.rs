//! GPU ms per frame from timestamps at the start and end of the frame's encoder, read back a few
//! frames later from a small ring of buffers so measuring never stalls the frame. The native app and
//! the wasm build both use it.

use std::sync::Arc;
use std::sync::atomic::{AtomicU8, Ordering};

const SLOTS: u32 = 8;
/// Each slot's two timestamps resolve at an offset WebGPU requires to be a multiple of 256 bytes.
const STRIDE: u64 = wgpu::QUERY_RESOLVE_BUFFER_ALIGNMENT;
const FREE: u8 = 0;
const RECORDED: u8 = 1;
const MAPPING: u8 = 2;
const MAPPED: u8 = 3;

pub struct GpuTimer {
    set: wgpu::QuerySet,
    resolve: wgpu::Buffer,
    readback: Vec<wgpu::Buffer>,
    state: Vec<Arc<AtomicU8>>,
    next: u32,
    period_ns: f64,
    /// Timestamps written straight into the encoder; without that feature (WebGPU) empty compute
    /// passes carry them, since WebGPU only writes timestamps at pass boundaries.
    in_encoder: bool,
    pub ms: Vec<f64>,
    /// Frames stamped, frames left untimed because their slot was still in flight, readbacks that
    /// failed to map, and readbacks whose end stamp was not after the start.
    pub counts: [u32; 4],
    failed: Arc<std::sync::atomic::AtomicU32>,
}

impl GpuTimer {
    /// None when the device has no timestamp queries.
    pub fn new(device: &wgpu::Device, queue: &wgpu::Queue) -> Option<GpuTimer> {
        if !device.features().contains(wgpu::Features::TIMESTAMP_QUERY) {
            return None;
        }
        let set = device.create_query_set(&wgpu::QuerySetDescriptor { label: Some("frame timestamps"), ty: wgpu::QueryType::Timestamp, count: SLOTS * 2 });
        let resolve = device.create_buffer(&wgpu::BufferDescriptor { label: None, size: SLOTS as u64 * STRIDE, usage: wgpu::BufferUsages::QUERY_RESOLVE | wgpu::BufferUsages::COPY_SRC, mapped_at_creation: false });
        let readback = (0..SLOTS)
            .map(|_| device.create_buffer(&wgpu::BufferDescriptor { label: None, size: 16, usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ, mapped_at_creation: false }))
            .collect();
        Some(GpuTimer {
            set,
            resolve,
            readback,
            state: (0..SLOTS).map(|_| Arc::new(AtomicU8::new(FREE))).collect(),
            next: 0,
            period_ns: queue.get_timestamp_period() as f64,
            in_encoder: device.features().contains(wgpu::Features::TIMESTAMP_QUERY_INSIDE_ENCODERS),
            ms: Vec::new(),
            counts: [0; 4],
            failed: Arc::new(std::sync::atomic::AtomicU32::new(0)),
        })
    }

    fn stamp(&self, encoder: &mut wgpu::CommandEncoder, index: u32, end: bool) {
        if self.in_encoder {
            encoder.write_timestamp(&self.set, index);
        } else {
            let writes = wgpu::ComputePassTimestampWrites { query_set: &self.set, beginning_of_pass_write_index: (!end).then_some(index), end_of_pass_write_index: end.then_some(index) };
            drop(encoder.begin_compute_pass(&wgpu::ComputePassDescriptor { label: None, timestamp_writes: Some(writes) }));
        }
    }

    /// Stamp the frame's start; None when every slot is still in flight (that frame goes untimed).
    pub fn begin(&mut self, encoder: &mut wgpu::CommandEncoder) -> Option<u32> {
        let s = self.next;
        if self.state[s as usize].load(Ordering::Acquire) != FREE {
            self.counts[1] += 1;
            return None;
        }
        self.counts[0] += 1;
        self.next = (self.next + 1) % SLOTS;
        self.stamp(encoder, s * 2, false);
        Some(s)
    }

    pub fn end(&mut self, encoder: &mut wgpu::CommandEncoder, s: u32) {
        self.stamp(encoder, s * 2 + 1, true);
        encoder.resolve_query_set(&self.set, s * 2..s * 2 + 2, &self.resolve, s as u64 * STRIDE);
        encoder.copy_buffer_to_buffer(&self.resolve, s as u64 * STRIDE, &self.readback[s as usize], 0, 16);
        self.state[s as usize].store(RECORDED, Ordering::Release);
    }

    pub fn after_submit(&mut self, s: u32) {
        let st = self.state[s as usize].clone();
        let failed = self.failed.clone();
        st.store(MAPPING, Ordering::Release);
        self.readback[s as usize].map_async(wgpu::MapMode::Read, .., move |r| {
            if r.is_err() {
                failed.fetch_add(1, Ordering::Relaxed);
            }
            st.store(if r.is_ok() { MAPPED } else { FREE }, Ordering::Release);
        });
    }

    /// Collect finished slots without waiting.
    pub fn poll(&mut self, device: &wgpu::Device) {
        let _ = device.poll(wgpu::PollType::Poll);
        self.collect();
    }

    /// Wait for every slot in flight (end of run).
    pub fn drain(&mut self, device: &wgpu::Device) {
        let _ = device.poll(wgpu::PollType::wait_indefinitely());
        self.collect();
    }

    /// Collect slots the browser (or a poll) has already mapped.
    pub fn collect(&mut self) {
        self.counts[2] = self.failed.load(Ordering::Relaxed);
        for (i, st) in self.state.iter().enumerate() {
            if st.load(Ordering::Acquire) != MAPPED {
                continue;
            }
            let b = &self.readback[i];
            {
                let data = b.get_mapped_range(..).expect("mapped timestamps");
                let t0 = u64::from_le_bytes(data[0..8].try_into().unwrap());
                let t1 = u64::from_le_bytes(data[8..16].try_into().unwrap());
                if t1 > t0 {
                    self.ms.push((t1 - t0) as f64 * self.period_ns / 1e6);
                } else {
                    self.counts[3] += 1;
                }
            }
            b.unmap();
            st.store(FREE, Ordering::Release);
        }
    }
}
