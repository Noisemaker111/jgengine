//! Compare two RGBA8 frames (bottom row first) and write viewable PNGs.

use std::path::Path;

#[derive(Debug, Clone, Copy, Default)]
pub struct DiffStats {
    /// Mean absolute difference per channel (RGB), 0..255.
    pub mean_abs: f64,
    /// Largest channel difference anywhere.
    pub max_abs: u8,
    /// Share of pixels whose largest RGB difference exceeds 2 and 8 levels.
    pub over_2: f64,
    pub over_8: f64,
    /// PSNR over RGB, dB.
    pub psnr: f64,
}

pub fn compare(a: &[u8], b: &[u8]) -> DiffStats {
    let n = a.len().min(b.len()) / 4;
    let (mut sum, mut sq, mut max, mut o2, mut o8) = (0u64, 0u64, 0u8, 0u64, 0u64);
    for i in 0..n {
        let mut px = 0u8;
        for c in 0..3 {
            let d = a[i * 4 + c].abs_diff(b[i * 4 + c]);
            sum += d as u64;
            sq += (d as u64) * (d as u64);
            px = px.max(d);
        }
        max = max.max(px);
        o2 += (px > 2) as u64;
        o8 += (px > 8) as u64;
    }
    let mse = sq as f64 / (n as f64 * 3.0);
    DiffStats { mean_abs: sum as f64 / (n as f64 * 3.0), max_abs: max, over_2: o2 as f64 / n as f64, over_8: o8 as f64 / n as f64, psnr: if mse == 0.0 { f64::INFINITY } else { 10.0 * (255.0f64 * 255.0 / mse).log10() } }
}

/// Write `rgba` (bottom row first) as a top-down PNG.
pub fn write_png(path: &Path, width: u32, height: u32, rgba: &[u8]) -> Result<(), String> {
    let mut flipped = Vec::with_capacity(rgba.len());
    let row = (width * 4) as usize;
    for y in (0..height as usize).rev() {
        flipped.extend_from_slice(&rgba[y * row..(y + 1) * row]);
    }
    for px in flipped.chunks_mut(4) {
        px[3] = 255;
    }
    let file = std::fs::File::create(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut enc = png::Encoder::new(std::io::BufWriter::new(file), width, height);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    let mut w = enc.write_header().map_err(|e| e.to_string())?;
    w.write_image_data(&flipped).map_err(|e| e.to_string())
}

/// A heat image of the difference: black where equal, brighter with the largest channel
/// difference, amplified 8x so small differences are visible.
pub fn heat(a: &[u8], b: &[u8]) -> Vec<u8> {
    let mut out = vec![0u8; a.len().min(b.len())];
    for i in 0..out.len() / 4 {
        let d = (0..3).map(|c| a[i * 4 + c].abs_diff(b[i * 4 + c])).max().unwrap_or(0) as u32;
        let v = (d * 8).min(255) as u8;
        out[i * 4] = v;
        out[i * 4 + 1] = if d > 8 { 0 } else { v };
        out[i * 4 + 2] = if d > 8 { 0 } else { v };
        out[i * 4 + 3] = 255;
    }
    out
}
