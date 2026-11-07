//! GPU ms per frame from timestamps written at the start and end of the frame's encoder, read back
//! a few frames later from a small ring of buffers so measuring never stalls the frame.

use std::sync::Arc;
use std::sync::atomic::{AtomicU8, Ordering};

const SLOTS: u32 = 8;
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
    pub ms: Vec<f64>,
}

impl GpuTimer {
    pub fn new(device: &wgpu::Device, queue: &wgpu::Queue) -> GpuTimer {
        let set = device.create_query_set(&wgpu::QuerySetDescriptor { label: Some("frame timestamps"), ty: wgpu::QueryType::Timestamp, count: SLOTS * 2 });
        let resolve = device.create_buffer(&wgpu::BufferDescriptor { label: None, size: (SLOTS * 16) as u64, usage: wgpu::BufferUsages::QUERY_RESOLVE | wgpu::BufferUsages::COPY_SRC, mapped_at_creation: false });
        let readback = (0..SLOTS)
            .map(|_| device.create_buffer(&wgpu::BufferDescriptor { label: None, size: 16, usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ, mapped_at_creation: false }))
            .collect();
        GpuTimer { set, resolve, readback, state: (0..SLOTS).map(|_| Arc::new(AtomicU8::new(FREE))).collect(), next: 0, period_ns: queue.get_timestamp_period() as f64, ms: Vec::new() }
    }

    /// Stamp the frame's start; None when every slot is still in flight (that frame goes untimed).
    pub fn begin(&mut self, encoder: &mut wgpu::CommandEncoder) -> Option<u32> {
        let s = self.next;
        if self.state[s as usize].load(Ordering::Acquire) != FREE {
            return None;
        }
        self.next = (self.next + 1) % SLOTS;
        encoder.write_timestamp(&self.set, s * 2);
        Some(s)
    }

    pub fn end(&mut self, encoder: &mut wgpu::CommandEncoder, s: u32) {
        encoder.write_timestamp(&self.set, s * 2 + 1);
        encoder.resolve_query_set(&self.set, s * 2..s * 2 + 2, &self.resolve, (s * 16) as u64);
        encoder.copy_buffer_to_buffer(&self.resolve, (s * 16) as u64, &self.readback[s as usize], 0, 16);
        self.state[s as usize].store(RECORDED, Ordering::Release);
    }

    pub fn after_submit(&mut self, s: u32) {
        let st = self.state[s as usize].clone();
        st.store(MAPPING, Ordering::Release);
        self.readback[s as usize].map_async(wgpu::MapMode::Read, .., move |r| {
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

    fn collect(&mut self) {
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
                }
            }
            b.unmap();
            st.store(FREE, Ordering::Release);
        }
    }
}
