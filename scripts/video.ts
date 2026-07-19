/**
 * Assemble PNG frames into a real MP4 (H.264) via the ffmpeg binary shipped
 * inside the `@ffmpeg-installer/ffmpeg` npm tarball (no postinstall download —
 * survives restricted-network environments). The MP4 is the full-fidelity
 * companion to the inline GIF: every frame, true per-frame durations, no size
 * budget and no thinning. GitHub cannot inline-play it (only cookie-gated
 * drag-and-drop attachments play inline), so `pr-shots` links it for download
 * next to the GIF that carries the inline preview.
 */
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApngFrame } from "./apng";

/**
 * Encode frames (with per-frame delays) into `outPath` as H.264/yuv420p with
 * faststart. Uses ffmpeg's concat demuxer with explicit `duration` entries so
 * the honest capture timing survives; dimensions are snapped to even values as
 * yuv420p requires.
 */
export function assembleMp4(frames: ApngFrame[], outPath: string): void {
  if (frames.length === 0) throw new Error("mp4: no frames");
  const workDir = mkdtempSync(join(tmpdir(), "jg-record-mp4-"));
  try {
    const lines: string[] = [];
    frames.forEach((frame, index) => {
      const name = `f${String(index).padStart(5, "0")}.png`;
      writeFileSync(join(workDir, name), frame.png);
      lines.push(`file '${name}'`, `duration ${(frame.delayMs / 1000).toFixed(3)}`);
    });
    // concat-demuxer quirk: the last duration is honored only when the final
    // file is listed once more.
    lines.push(`file 'f${String(frames.length - 1).padStart(5, "0")}.png'`);
    writeFileSync(join(workDir, "list.txt"), `${lines.join("\n")}\n`);
    execFileSync(
      ffmpeg.path,
      [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", "list.txt",
        "-vsync", "vfr",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        outPath,
      ],
      { cwd: workDir, stdio: ["ignore", "ignore", "pipe"] },
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
