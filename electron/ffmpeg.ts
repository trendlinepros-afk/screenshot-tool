import { spawn } from 'child_process';
import * as fs from 'fs';

/**
 * Resolve the bundled ffmpeg binary. ffmpeg-static ships the binary inside the
 * package; when packaged with electron-builder it lives under
 * app.asar.unpacked (see asarUnpack in electron-builder.yml).
 */
function ffmpegPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const p: string = require('ffmpeg-static');
  return p.replace('app.asar', 'app.asar.unpacked');
}

/** Transcode a WebM recording to MP4 (H.264 + AAC). */
export function transcodeToMp4(inputWebm: string, outputMp4: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', inputWebm,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      // H.264 requires even dimensions; pad by one pixel if needed.
      '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-movflags', '+faststart',
      outputMp4,
    ];
    const proc = spawn(ffmpegPath(), args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputMp4)) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}
