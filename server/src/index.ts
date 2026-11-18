import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import express from 'express';
import compression from 'compression';
import qrcode from 'qrcode-terminal';
import type { Response } from 'express';
import { config, ROOT, WEB_DIST } from './config.ts';
import { scanLibrary as scanDisk } from './scanner.ts';
import { buildLibrary, tracksOfAlbum } from './library.ts';
import { getCover } from './cover.ts';
import { readLyrics } from './lyrics.ts';
import { scanState, snapshot, trackIndex, setSnapshot } from './state.ts';
import {
  MAX_IMPORT_BYTES,
  importPrefix,
  prepareImportTarget,
  sanitizeImportDir,
  sanitizeImportName,
  saveUpload,
} from './import.ts';
import type { ImportResult, Track } from '../../shared/types.ts';

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.wma': 'audio/x-ms-wma',
  '.ape': 'audio/x-ape',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.alac': 'audio/mp4',
};

const app = express();
app.disable('x-powered-by');
// 曲库 JSON 在没有压缩时随曲目数线性膨胀（万首约 5MB），gzip 能压到 1/10
app.use(compression());
app.use(express.json({ limit: '1mb' }));

/* ------------------------------------------------------------------ */
/* 通用工具                                                            */
/* ------------------------------------------------------------------ */

interface ApiErrorBody {
  error: { code: string; message: string };
}

function fail(res: Response, status: number, code: string, message: string): void {
  const body: ApiErrorBody = { error: { code, message } };
  res.status(status).json(body);
}

function parseRange(header: string, size: number): { start: number; end: number } | 'invalid' | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return 'invalid';

  let start: number;
  let end: number;

  if (rawStart === '') {
    // bytes=-500 → 最后 500 字节
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'invalid';
  if (start < 0 || start >= size || start > end) return 'invalid';
  return { start, end: Math.min(end, size - 1) };
}

/** 下载时展示的文件名：优先「歌手 - 标题.扩展名」，否则回退到原文件名 */
function downloadName(track: Track): string {
  const ext = path.extname(track.fileName) || path.extname(track.path);
  const parts = [track.artist, track.title].map((s) => s.trim()).filter(Boolean);
  const base = parts.length > 0 ? parts.join(' - ') : path.basename(track.fileName, ext);
  // 去掉路径非法字符，避免浏览器 / OS 保存失败
  const safe = base.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/\.+$/g, '').trim() || 'track';
  return `${safe}${ext}`;
}

/** 生成带 RFC 5987 的 Content-Disposition，保证中文文件名可正确下载 */
function contentDisposition(type: 'attachment' | 'inline', filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/* ------------------------------------------------------------------ */
/* 音乐库刷新                                                          */
/* ------------------------------------------------------------------ */

let refreshing: Promise<void> | null = null;

function refreshLibrary(): Promise<void> {
  if (refreshing) return refreshing;

  refreshing = (async () => {
    const started = Date.now();
    try {
      const result = await scanDisk();
      setSnapshot(buildLibrary(result.tracks));
      const s = snapshot!.stats;
      console.log(
        `[scan] ${s.tracks} 首 / ${s.albums} 张专辑 / ${s.artists} 位歌手 ` +
          `(新增 ${result.added}，更新 ${result.updated}，移除 ${result.removed}，复用 ${result.reused}，${Date.now() - started}ms)`,
      );
    } catch (err) {
      console.error('[scan] 扫描失败：', (err as Error).message);
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    version: 1,
    musicDir: config.musicDir,
    // 相对 musicDir 的导入前缀，例如 "music"；前端用它展示文件落在哪
    importPrefix: importPrefix(),
    port: config.port,
    scannedAt: scanState.scannedAt,
  });
});

app.get('/api/status', (_req, res) => {
  res.json({ ...scanState, hasLibrary: snapshot !== null });
});

app.get('/api/library', (req, res) => {
  if (!snapshot) {
    fail(res, 503, 'NOT_READY', scanState.scanning ? '正在扫描音乐库，请稍候' : '音乐库尚未建立');
    return;
  }

  // 快照只在扫描完成时换新，用 scannedAt 做 ETag 就够，
  // 不必每次都对几 MB 的 JSON 求哈希。浏览器会带着 If-None-Match 来问。
  const etag = `"lib-${snapshot.scannedAt}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'no-cache');
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }

  res.json(snapshot);
});

app.post('/api/rescan', (_req, res) => {
  if (refreshing) {
    res.json({ started: false, alreadyRunning: true });
    return;
  }
  void refreshLibrary();
  res.json({ started: true, alreadyRunning: false });
});

app.get('/api/albums/:id/tracks', (req, res) => {
  if (!snapshot) {
    fail(res, 503, 'NOT_READY', '音乐库尚未建立');
    return;
  }
  const id = req.params.id;
  res.json(tracksOfAlbum(snapshot.tracks, id));
});

app.get('/api/stream/:id', async (req, res) => {
  const track = trackIndex.get(req.params.id);
  if (!track) {
    fail(res, 404, 'NOT_FOUND', '曲目不存在');
    return;
  }

  const abs = path.join(config.musicDir, track.path);
  let stat;
  try {
    stat = await fsp.stat(abs);
  } catch {
    fail(res, 404, 'NOT_FOUND', '文件已被移动或删除');
    return;
  }

  const size = stat.size;
  const mime = AUDIO_MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream';
  const etag = `"${track.id}-${Math.round(stat.mtimeMs)}"`;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mime);
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Content-Disposition', 'inline');

  const rangeHeader = req.headers.range;
  const range = rangeHeader ? parseRange(rangeHeader, size) : null;

  if (range === 'invalid') {
    res.setHeader('Content-Range', `bytes */${size}`);
    // express 只在没有 Content-Type 时才设置 json 的类型，这里先清掉音频类型
    res.removeHeader('Content-Type');
    fail(res, 416, 'BAD_RANGE', '请求的字节范围无效');
    return;
  }

  const { start, end } = range ?? { start: 0, end: size - 1 };

  res.status(range ? 206 : 200);
  res.setHeader('Content-Length', end - start + 1);
  if (range) res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = fs.createReadStream(abs, { start, end });
  // 客户端拖动进度条会中断上一个请求，及时释放句柄
  req.on('close', () => stream.destroy());
  stream.on('error', () => {
    if (!res.headersSent) fail(res, 500, 'INTERNAL', '读取音频文件失败');
    else res.destroy();
  });
  stream.pipe(res);
});

app.get('/api/cover/:id', async (req, res) => {
  const track = trackIndex.get(req.params.id);
  if (!track) {
    fail(res, 404, 'NOT_FOUND', '曲目不存在');
    return;
  }

  const cover = await getCover(track);
  if (!cover) {
    fail(res, 404, 'NOT_FOUND', '该曲目没有封面');
    return;
  }

  const etag = `"cover-${track.id}-${cover.version}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.setHeader('Content-Type', cover.contentType);
  res.setHeader('Content-Length', String(cover.body.length));

  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }

  res.end(cover.body);
});

app.get('/api/lyrics/:id', async (req, res) => {
  const track = trackIndex.get(req.params.id);
  if (!track) {
    fail(res, 404, 'NOT_FOUND', '曲目不存在');
    return;
  }

  const lyrics = await readLyrics(track);
  if (!lyrics) {
    fail(res, 404, 'NOT_FOUND', '没有找到歌词文件');
    return;
  }
  res.json(lyrics);
});

app.get('/api/download/:id', async (req, res) => {
  const track = trackIndex.get(req.params.id);
  if (!track) {
    fail(res, 404, 'NOT_FOUND', '曲目不存在');
    return;
  }

  const abs = path.join(config.musicDir, track.path);
  let stat;
  try {
    stat = await fsp.stat(abs);
  } catch {
    fail(res, 404, 'NOT_FOUND', '文件已被移动或删除');
    return;
  }

  res.setHeader('Content-Type', AUDIO_MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream');
  res.setHeader('Content-Length', String(stat.size));
  res.setHeader('Content-Disposition', contentDisposition('attachment', downloadName(track)));
  res.setHeader('Cache-Control', 'no-store');

  const stream = fs.createReadStream(abs);
  req.on('close', () => stream.destroy());
  stream.on('error', () => {
    if (!res.headersSent) fail(res, 500, 'INTERNAL', '读取音频文件失败');
    else res.destroy();
  });
  stream.pipe(res);
});

app.post('/api/import', async (req, res) => {
  const rawDir = typeof req.query.dir === 'string' ? req.query.dir : '';
  const rawName = typeof req.query.name === 'string' ? req.query.name : '';

  const dir = sanitizeImportDir(rawDir);
  if (dir === null) {
    fail(res, 400, 'BAD_DIR', '目标文件夹名不合法（不能是绝对路径，也不能包含 < > : " | ? * 等字符）');
    return;
  }

  const name = sanitizeImportName(rawName);
  if (!name) {
    fail(res, 400, 'BAD_NAME', '只支持导入音频、歌词（.lrc/.txt）或封面图片');
    return;
  }

  const declared = Number(req.headers['content-length']) || 0;
  if (declared > MAX_IMPORT_BYTES) {
    fail(res, 413, 'TOO_LARGE', '文件超过 4GB 上限');
    return;
  }

  let target;
  try {
    target = await prepareImportTarget(dir, name);
  } catch (err) {
    fail(res, 400, 'BAD_DIR', (err as Error).message);
    return;
  }

  let size = 0;
  try {
    size = await saveUpload(req, target);
  } catch (err) {
    const message = (err as Error).message;
    if (message === 'FILE_TOO_LARGE') {
      fail(res, 413, 'TOO_LARGE', '文件超过 4GB 上限');
      return;
    }
    if (message === 'EMPTY_FILE') {
      fail(res, 400, 'EMPTY_FILE', '上传的文件是空的');
      return;
    }
    console.error('[import] 写入失败：', message);
    fail(res, 500, 'WRITE_FAILED', `写入失败：${message}`);
    return;
  }

  const body: ImportResult = { path: target.relPath, size, renamed: target.renamed };
  res.json(body);

  // 音频文件会让曲库过期；歌词 / 封面只影响伴生资源，下次扫描时会自动识别
  if (config.extensions.includes(path.extname(name).toLowerCase())) {
    void refreshLibrary();
  }
});

app.use('/api', (_req, res) => {
  fail(res, 404, 'NOT_FOUND', '接口不存在');
});

/* ------------------------------------------------------------------ */
/* 前端静态资源（生产模式）                                             */
/* ------------------------------------------------------------------ */

const hasDist = fs.existsSync(path.join(WEB_DIST, 'index.html'));
if (hasDist) {
  app.use(
    express.static(WEB_DIST, {
      index: false,
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        // Vite 产出的文件名带内容哈希，可以永久缓存
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      next();
      return;
    }
    // 带扩展名说明是在找静态文件：找不到就该真的 404。
    // 回退成 index.html 会把 HTML 当 JS 交给浏览器，表现为白屏且无从排查。
    if (path.extname(req.path)) {
      next();
      return;
    }
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res
      .type('text/plain; charset=utf-8')
      .send('前端还没有构建。开发模式请访问 http://localhost:5173 ，或先运行 npm run build。');
  });
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

const server = app.listen(config.port, config.host, () => {
  const local = `http://localhost:${config.port}`;
  console.log('');
  console.log('  ♪ 音乐库播放器已启动');
  console.log(`  音乐目录: ${config.musicDir}`);
  const prefix = importPrefix();
  console.log(`  导入目录: ${config.importDir}${prefix ? `（曲库内路径：${prefix}）` : ''}`);
  console.log(`  本机访问: ${local}`);

  const lans = lanAddresses();
  for (const ip of lans) console.log(`  局域网:   http://${ip}:${config.port}`);

  if (lans.length > 0) {
    console.log('');
    console.log('  手机扫码（需与本机同一 Wi-Fi）:');
    qrcode.generate(`http://${lans[0]}:${config.port}`, { small: true }, (code) => console.log(code));
  }

  if (!hasDist) {
    console.log('  开发模式请另开终端运行 npm run dev，然后访问 http://localhost:5173');
  }
  console.log('');

  if (process.env.OPEN_BROWSER === '1') {
    setTimeout(() => exec(`start "" "${local}"`), 800);
  }

  void refreshLibrary();
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${config.port} 已被占用。请修改 music.config.json 里的 port，或关闭占用该端口的程序。`);
  } else {
    console.error('服务启动失败：', err.message);
  }
  process.exit(1);
});

/* ------------------------------------------------------------------ */
/* 退出                                                                */
/* ------------------------------------------------------------------ */

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log('\n正在关闭服务…');
    server.close(() => process.exit(0));
    // 兜底：5 秒内没关干净就强制退出
    setTimeout(() => process.exit(0), 5000).unref();
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

console.log(`[boot] 根目录 ${ROOT}`);
