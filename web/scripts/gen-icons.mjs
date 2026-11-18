/**
 * 生成 PWA 图标（零依赖，只用 Node 内置的 zlib）。
 *
 * Chrome 安装应用要求至少有 192 和 512 的 PNG 图标，且 maskable 版本必须铺满画布
 * （系统会自己裁成圆形/圆角，所以背景不能透明、图形要留在中间 80% 的安全区内）。
 *
 * 用法：node web/scripts/gen-icons.mjs
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = fileURLToPath(new URL('../public/icons/', import.meta.url));

/* ------------------------------------------------------------------ */
/* PNG 编码                                                            */
/* ------------------------------------------------------------------ */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 位深
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // 每行前面加一个 filter 字节（0 = None）
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ */
/* 形状判定（都用归一化坐标 0..1，便于不同尺寸复用同一套参数）           */
/* ------------------------------------------------------------------ */

function inRoundedRect(x, y, radius) {
  const r = Math.min(radius, 0.5);
  const dx = Math.max(r - x, 0, x - (1 - r));
  const dy = Math.max(r - y, 0, y - (1 - r));
  if (dx === 0 && dy === 0) return x >= 0 && x <= 1 && y >= 0 && y <= 1;
  return dx * dx + dy * dy <= r * r;
}

function inEllipse(x, y, cx, cy, rx, ry) {
  const nx = (x - cx) / rx;
  const ny = (y - cy) / ry;
  return nx * nx + ny * ny <= 1;
}

function inCapsule(x, y, x1, y1, x2, y2, r) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const len2 = vx * vx + vy * vy;
  let t = len2 === 0 ? 0 : ((x - x1) * vx + (y - y1) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const dx = x - (x1 + vx * t);
  const dy = y - (y1 + vy * t);
  return dx * dx + dy * dy <= r * r;
}

function inPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/* ------------------------------------------------------------------ */
/* 图形：一个八分音符，和网页里的 favicon 同款造型                       */
/* ------------------------------------------------------------------ */

const NOTE_LEFT = { cx: 0.335, cy: 0.7, rx: 0.115, ry: 0.086 };
const NOTE_RIGHT = { cx: 0.715, cy: 0.625, rx: 0.115, ry: 0.086 };
const STEM_L = { x1: 0.44, y1: 0.7, x2: 0.44, y2: 0.3, r: 0.024 };
const STEM_R = { x1: 0.82, y1: 0.625, x2: 0.82, y2: 0.225, r: 0.024 };
const BEAM = [
  [0.44, 0.3],
  [0.82, 0.225],
  [0.82, 0.345],
  [0.44, 0.42],
];

function inNote(x, y) {
  return (
    inEllipse(x, y, NOTE_LEFT.cx, NOTE_LEFT.cy, NOTE_LEFT.rx, NOTE_LEFT.ry) ||
    inEllipse(x, y, NOTE_RIGHT.cx, NOTE_RIGHT.cy, NOTE_RIGHT.rx, NOTE_RIGHT.ry) ||
    inCapsule(x, y, STEM_L.x1, STEM_L.y1, STEM_L.x2, STEM_L.y2, STEM_L.r) ||
    inCapsule(x, y, STEM_R.x1, STEM_R.y1, STEM_R.x2, STEM_R.y2, STEM_R.r) ||
    inPolygon(x, y, BEAM)
}

/* ------------------------------------------------------------------ */
/* 绘制                                                                */
/* ------------------------------------------------------------------ */

const DARK = [11, 13, 18];
const TEAL = [94, 234, 212];
const INDIGO = [129, 140, 248];
const INK = [6, 23, 20];

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

/** 4x4 超采样，靠覆盖率得到抗锯齿边缘 */
const SS = 4;

function render(size, mode) {
  // mode: 'any' = 圆角深色底 + 渐变音符；'maskable' = 铺满渐变底 + 深色音符
  const rounded = mode === 'any';
  const radius = 0.22;
  const rgba = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;

          if (rounded && !inRoundedRect(x, y, radius)) continue;

          // 背景：深色版几乎纯色，maskable 版是斜向渐变
          let color = rounded ? mix(DARK, [16, 20, 30], (x + y) * 0.5) : mix(TEAL, INDIGO, (x * 0.55 + y * 0.45));

          if (inNote(x, y)) {
            color = rounded ? mix(TEAL, INDIGO, (x * 0.5 + y * 0.5)) : INK;
          }

          r += color[0];
          g += color[1];
          b += color[2];
          a += 1;
        }
      }

      const total = SS * SS;
      const idx = (py * size + px) * 4;
      if (a === 0) continue;
      rgba[idx] = Math.round(r / a);
      rgba[idx + 1] = Math.round(g / a);
      rgba[idx + 2] = Math.round(b / a);
      rgba[idx + 3] = Math.round((a / total) * 255);
    }
  }

  return encodePng(size, size, rgba);
}

/* ------------------------------------------------------------------ */

const targets = [
  { file: 'icon-192.png', size: 192, mode: 'any' },
  { file: 'icon-512.png', size: 512, mode: 'any' },
  { file: 'icon-maskable-512.png', size: 512, mode: 'maskable' },
  // iOS 会自己加圆角，所以要一张不透明的整块图
  { file: 'apple-touch-icon.png', size: 180, mode: 'maskable' },
];

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const { file, size, mode } of targets) {
  const png = render(size, mode);
  fs.writeFileSync(path.join(OUT_DIR, file), png);
  console.log(`${file.padEnd(24)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
