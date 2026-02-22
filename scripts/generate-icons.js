/**
 * Generate PWA icon PNGs programmatically.
 * Run: node scripts/generate-icons.js
 *
 * Creates icon-192.png, icon-512.png, apple-touch-icon.png
 * matching the favicon.svg design (blue rounded rect with white "M").
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createPNG(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const ihdrChunk = makeChunk('IHDR', ihdr);

  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0;
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = pixels[srcIdx];
      rawData[dstIdx + 1] = pixels[srcIdx + 1];
      rawData[dstIdx + 2] = pixels[srcIdx + 2];
      rawData[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }

  const compressed = deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function distSq(x1, y1, x2, y2) {
  return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}

function isInsideRoundedRect(x, y, w, h, r) {
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  if (x < r && y < r) return distSq(x, y, r, r) <= r * r;
  if (x >= w - r && y < r) return distSq(x, y, w - r - 1, r) <= r * r;
  if (x < r && y >= h - r) return distSq(x, y, r, h - r - 1) <= r * r;
  if (x >= w - r && y >= h - r) return distSq(x, y, w - r - 1, h - r - 1) <= r * r;
  return true;
}

function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  const r = Math.round(size * 6 / 32);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      if (isInsideRoundedRect(x, y, size, size, r)) {
        pixels[idx] = 0x25;
        pixels[idx + 1] = 0x63;
        pixels[idx + 2] = 0xEB;
        pixels[idx + 3] = 255;
      }
    }
  }

  const scale = size / 32;

  // Draw block "M"
  const rects = [
    [10, 8, 13, 22],
    [19, 8, 22, 22],
    [13, 10, 16, 15],
    [16, 10, 19, 15],
    [15, 14, 17, 16],
  ];
  for (const [x1, y1, x2, y2] of rects) {
    for (let y = Math.round(y1 * scale); y < Math.round(y2 * scale); y++) {
      for (let x = Math.round(x1 * scale); x < Math.round(x2 * scale); x++) {
        if (x >= 0 && x < size && y >= 0 && y < size) {
          const idx = (y * size + x) * 4;
          pixels[idx] = 255; pixels[idx + 1] = 255; pixels[idx + 2] = 255; pixels[idx + 3] = 255;
        }
      }
    }
  }

  // Draw underline (60% opacity)
  for (let y = Math.round(24 * scale); y < Math.round(26 * scale); y++) {
    for (let x = Math.round(6 * scale); x < Math.round(26 * scale); x++) {
      const idx = (y * size + x) * 4;
      pixels[idx] = 255; pixels[idx + 1] = 255; pixels[idx + 2] = 255; pixels[idx + 3] = 153;
    }
  }

  return pixels;
}

for (const size of [192, 512, 180]) {
  const pixels = drawIcon(size);
  const png = createPNG(size, size, Buffer.from(pixels));
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  writeFileSync(join(publicDir, name), png);
  console.log(`Generated ${name}`);
}
