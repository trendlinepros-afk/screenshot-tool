// Generates build/icon.png (256x256) — a simple camera-lens mark on a purple
// rounded square — without any image library, by writing the PNG format directly.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// RGBA pixel buffer
const px = Buffer.alloc(SIZE * SIZE * 4);

function setPixel(x, y, r, g, b, a) {
  const i = (y * SIZE + x) * 4;
  // simple source-over blend
  const da = px[i + 3] / 255;
  const sa = a / 255;
  const oa = sa + da * (1 - sa);
  if (oa === 0) return;
  px[i] = Math.round((r * sa + px[i] * da * (1 - sa)) / oa);
  px[i + 1] = Math.round((g * sa + px[i + 1] * da * (1 - sa)) / oa);
  px[i + 2] = Math.round((b * sa + px[i + 2] * da * (1 - sa)) / oa);
  px[i + 3] = Math.round(oa * 255);
}

function roundedRectAlpha(x, y, x0, y0, x1, y1, radius) {
  const cx = Math.max(x0 + radius, Math.min(x, x1 - radius));
  const cy = Math.max(y0 + radius, Math.min(y, y1 - radius));
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  return Math.max(0, Math.min(1, radius - d + 0.5));
}

function circleAlpha(x, y, cx, cy, r) {
  const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
  return Math.max(0, Math.min(1, r - d + 0.5));
}

function ringAlpha(x, y, cx, cy, r, thickness) {
  const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
  const outer = Math.max(0, Math.min(1, r - d + 0.5));
  const inner = Math.max(0, Math.min(1, r - thickness - d + 0.5));
  return outer - inner;
}

const C = SIZE / 2;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    // background rounded square, purple gradient
    const bg = roundedRectAlpha(x, y, 8, 8, SIZE - 8, SIZE - 8, 56);
    if (bg > 0) {
      const t = (x + y) / (2 * SIZE);
      const r = Math.round(124 + t * 40);
      const g = Math.round(58 + t * 10);
      const b = Math.round(237 - t * 40);
      setPixel(x, y, r, g, b, Math.round(bg * 255));
    }
    // outer lens ring (white)
    const ring = ringAlpha(x, y, C, C, 78, 16);
    if (ring > 0) setPixel(x, y, 255, 255, 255, Math.round(ring * 255));
    // inner lens (white-ish center dot)
    const lens = circleAlpha(x, y, C, C, 40);
    if (lens > 0) setPixel(x, y, 245, 243, 255, Math.round(lens * 255));
    // small highlight
    const hl = circleAlpha(x, y, C + 18, C - 18, 10);
    if (hl > 0) setPixel(x, y, 124, 58, 237, Math.round(hl * 255));
  }
}

// Selection-corner brackets, white, in the four corners
function drawBracket(cornerX, cornerY, dirX, dirY) {
  const len = 34;
  const th = 12;
  for (let i = 0; i < len; i++) {
    for (let t = 0; t < th; t++) {
      setPixel(cornerX + dirX * i, cornerY + dirY * t, 255, 255, 255, 255);
      setPixel(cornerX + dirX * t, cornerY + dirY * i, 255, 255, 255, 255);
    }
  }
}
drawBracket(34, 34, 1, 1);
drawBracket(SIZE - 35, 34, -1, 1);
drawBracket(34, SIZE - 35, 1, -1);
drawBracket(SIZE - 35, SIZE - 35, -1, -1);

// encode scanlines with filter byte 0
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.png'), png);
console.log('Wrote build/icon.png');
