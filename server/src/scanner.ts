import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseFile, selectCover } from 'music-metadata';
import type { CoverSource, Track } from '../../shared/types.ts';
import { config, CACHE_FILE } from './config.ts';
import { scanState } from './state.ts';

/** 扫描时并发解析的文件数。标签解析是 CPU + IO 混合负载，太高反而拖慢整体 */
const PARSE_CONCURRENCY = 4;
/** 目录递归深度上限，防止异常目录结构把进程拖死 */
const MAX_DEPTH = 16;
/** 缓存格式版本，结构变了就自动丢弃旧缓存 */
const CACHE_VERSION = 4;

export const IMAGE_STEMS = new Set(['cover', 'folder', 'front', 'albumart', 'albumartsmall', 'album', 'artwork', 'thumb', 'poster']);
export const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.avif']);

export function toTrackId(relPath: string): string {
  return createHash('sha1').update(relPath.toLowerCase()).digest('hex').slice(0, 12);
}

interface FoundFile {
  rel: string;
  abs: string;
  size: number;
  mtimeMs: number;
}

interface CacheShape {
  version: number;
  scannedAt: number;
  tracks: Record<string, Track>;
  /**
   * 相对目录 -> 扫描时该目录的 mtime。
   * 歌词、目录封面是音频的伴生文件，改它们不会动音频的 mtime，
   * 只有靠目录自身的 mtime 才能发现「目录内容变了、缓存里的
   * hasCover / hasLyrics 可能已经过期」。
   */
  dirMtimes: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* 目录遍历                                                            */
/* ------------------------------------------------------------------ */

async function walk(
  dir: string,
  rel: string,
  depth: number,
  out: FoundFile[],
  dirMtimes: Map<string, number>,
): Promise<void> {
  if (depth > MAX_DEPTH) return;

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return; // 没有权限 / 目录已被删除，跳过而不是整体失败
  }

  // 记下目录 mtime：目录里新增/删除文件都会改变它，用来判断伴生资源缓存是否过期
  try {
    dirMtimes.set(rel, Math.round((await fs.stat(dir)).mtimeMs));
  } catch {
    /* 目录在遍历途中消失，忽略 */
  }

  for (const entry of entries) {
    const name = entry.name;
    if (name.startsWith('.')) continue;

    const abs = path.join(dir, name);
    const relChild = rel ? `${rel}/${name}` : name;

    if (entry.isDirectory()) {
      if (config.excludeDirs.includes(name)) continue;
      await walk(abs, relChild, depth + 1, out, dirMtimes);
      continue;
    }

    // 符号链接在 Windows 上 isFile() 为 false，统一用扩展名判断
    const ext = path.extname(name).toLowerCase();
    if (!config.extensions.includes(ext)) continue;

    try {
      const st = await fs.stat(abs);
      if (!st.isFile() || st.size === 0) continue;
      out.push({ rel: relChild, abs, size: st.size, mtimeMs: Math.round(st.mtimeMs) });
    } catch {
      /* 文件在遍历途中消失，忽略 */
    }
  }
}

/* ------------------------------------------------------------------ */
/* 同目录附加资源（歌词 / 目录封面）                                     */
/* ------------------------------------------------------------------ */

const dirListCache = new Map<string, Map<string, string>>();

/** 返回 小写文件名 -> 真实文件名，用于大小写不敏感地查找伴生文件 */
async function listDir(dirAbs: string): Promise<Map<string, string>> {
  const cached = dirListCache.get(dirAbs);
  if (cached) return cached;

  const map = new Map<string, string>();
  try {
    const names = await fs.readdir(dirAbs);
    for (const n of names) map.set(n.toLowerCase(), n);
  } catch {
    /* 忽略 */
  }
  dirListCache.set(dirAbs, map);
  return map;
}

function findFolderImage(listing: Map<string, string>): string | null {
  let best: string | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const [lower, real] of listing) {
    const ext = path.extname(lower);
    if (!IMAGE_EXTS.has(ext)) continue;
    const stem = lower.slice(0, lower.length - ext.length);
    if (!IMAGE_STEMS.has(stem)) continue;
    // cover > folder > front > 其余
    const rank = stem === 'cover' ? 0 : stem === 'folder' ? 1 : stem === 'front' ? 2 : 3;
    if (best === null || rank < bestRank) {
      best = real;
      bestRank = rank;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* 文件名兜底解析                                                      */
/* ------------------------------------------------------------------ */

/** 从 "01 - 歌手 - 歌名" / "歌手 - 歌名" / "歌名" 里提取信息 */
function parseFromFileName(stem: string): { artist: string; title: string } {
  // 去掉开头曲目号：01. / 01 - / 01_
  let s = stem.replace(/^\s*\d{1,3}\s*[.\-_)]\s*/, '').trim();
  s = s.replace(/^\s*\[\d{1,3}\]\s*/, '').trim();

  const m = /^(.{1,80}?)\s+[-–—]\s+(.+)$/.exec(s);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };

  return { artist: '', title: s || stem };
}

function cleanText(value: string | undefined | null): string {
  if (!value) return '';
  return value.replace(/\u0000/g, '').trim();
}

/** 有些老文件标签里是乱码（GBK 当 UTF-8 解），用「非可打印字符比例」粗略判断 */
function looksBroken(text: string): boolean {
  if (!text) return false;
  const bad = (text.match(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) ?? []).length;
  return bad / text.length > 0.15;
}

/* ------------------------------------------------------------------ */
/* 单曲解析                                                            */
/* ------------------------------------------------------------------ */

async function parseOne(file: FoundFile): Promise<Track> {
  const id = toTrackId(file.rel);
  const fileName = path.posix.basename(file.rel);
  const stem = fileName.slice(0, fileName.length - path.extname(fileName).length);
  const dirAbs = path.dirname(file.abs);
  const listing = await listDir(dirAbs);

  const fromName = parseFromFileName(stem);

  let title = '';
  let artist = '';
  let album = '';
  let albumArtist = '';
  let trackNo: number | null = null;
  let discNo: number | null = null;
  let year: number | null = null;
  let genre: string[] = [];
  let duration = 0;
  let bitrate: number | null = null;
  let sampleRate: number | null = null;
  let codec = path.extname(fileName).slice(1).toUpperCase();
  let embeddedCover = false;
  let warning: string | undefined;

  try {
    // skipCovers: false 是为了判断「有没有内嵌封面」，但拿到 picture 后立刻丢弃，
    // 不进入缓存，避免整库封面把内存撑爆。
    const meta = await parseFile(file.abs, { duration: true, skipCovers: false });
    const c = meta.common;
    const f = meta.format;

    title = cleanText(c.title);
    artist = cleanText(c.artist) || cleanText(c.albumartist);
    album = cleanText(c.album);
    albumArtist = cleanText(c.albumartist);
    trackNo = c.track?.no ?? null;
    discNo = c.disk?.no ?? null;
    year = c.year ?? null;
    genre = (c.genre ?? []).map((g) => cleanText(g)).filter(Boolean);
    duration = Number.isFinite(f.duration) ? Math.round(f.duration ?? 0) : 0;
    bitrate = f.bitrate ? Math.round(f.bitrate) : null;
    sampleRate = f.sampleRate ?? null;
    if (f.codec) codec = f.codec;
    embeddedCover = Boolean(selectCover(c.picture));
  } catch (err) {
    warning = (err as Error).message ?? String(err);
  }

  // 标签缺失或乱码时，退回文件名解析
  if (!title || looksBroken(title)) title = fromName.title || stem;
  if (!artist || looksBroken(artist)) artist = fromName.artist || '';
  if (!album || looksBroken(album)) album = '';

  const folderImage = findFolderImage(listing);
  let coverSource: CoverSource = 'none';
  if (embeddedCover) coverSource = 'embedded';
  else if (folderImage) coverSource = 'folder';

  const hasLyrics = listing.has(`${stem.toLowerCase()}.lrc`) || listing.has(`${stem.toLowerCase()}.txt`);

  return {
    id,
    path: file.rel,
    fileName,
    title,
    artist: artist || '未知艺术家',
    album: album || '未知专辑',
    albumArtist: albumArtist || artist || '未知艺术家',
    trackNo,
    discNo,
    year,
    genre,
    duration,
    bitrate,
    sampleRate,
    codec,
    size: file.size,
    mtimeMs: file.mtimeMs,
    hasCover: coverSource !== 'none',
    coverSource,
    hasLyrics,
    warning,
  };
}

/* ------------------------------------------------------------------ */
/* 缓存                                                                */
/* ------------------------------------------------------------------ */

interface LoadedCache {
  tracks: Map<string, Track>;
  dirMtimes: Record<string, number>;
}

async function readCache(): Promise<LoadedCache> {
  const empty: LoadedCache = { tracks: new Map(), dirMtimes: {} };
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as CacheShape;
    if (parsed.version !== CACHE_VERSION || typeof parsed.tracks !== 'object') return empty;
    return {
      tracks: new Map(Object.entries(parsed.tracks)),
      dirMtimes: parsed.dirMtimes && typeof parsed.dirMtimes === 'object' ? parsed.dirMtimes : {},
    };
  } catch {
    return empty;
  }
}

async function writeCache(tracks: Track[], dirMtimes: Map<string, number>): Promise<void> {
  const payload: CacheShape = {
    version: CACHE_VERSION,
    scannedAt: Date.now(),
    tracks: Object.fromEntries(tracks.map((t) => [t.id, t])),
    dirMtimes: Object.fromEntries(dirMtimes),
  };
  // 先写临时文件再重命名，避免写一半被中断留下坏缓存
  const tmp = `${CACHE_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload), 'utf8');
  await fs.rename(tmp, CACHE_FILE);
}

/* ------------------------------------------------------------------ */
/* 并发池                                                              */
/* ------------------------------------------------------------------ */

async function pool(count: number, limit: number, fn: (index: number) => Promise<void>): Promise<void> {
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, count));
  const workers = Array.from({ length: size }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= count) return;
      await fn(index);
    }
  });
  await Promise.all(workers);
}

/* ------------------------------------------------------------------ */
/* 主入口                                                              */
/* ------------------------------------------------------------------ */

export interface ScanResult {
  tracks: Track[];
  added: number;
  updated: number;
  removed: number;
  reused: number;
  durationMs: number;
  scannedAt: number;
}

export function compareTracks(a: Track, b: Track): number {
  if (a.path !== b.path) {
    const ad = a.path.includes('/') ? a.path.slice(0, a.path.lastIndexOf('/')) : '';
    const bd = b.path.includes('/') ? b.path.slice(0, b.path.lastIndexOf('/')) : '';
    if (ad !== bd) return ad.localeCompare(bd, 'zh-CN');
  }
  const ad = a.discNo ?? 0;
  const bd = b.discNo ?? 0;
  if (ad !== bd) return ad - bd;
  const at = a.trackNo ?? 0;
  const bt = b.trackNo ?? 0;
  if (at !== bt) return at - bt;
  return a.fileName.localeCompare(b.fileName, 'zh-CN', { numeric: true });
}

/**
 * 扫描音乐目录。mtime + size 都没变的文件直接复用缓存，不重新解析标签。
 */
export async function scanLibrary(): Promise<ScanResult> {
  const started = Date.now();
  dirListCache.clear();

  scanState.scanning = true;
  scanState.phase = 'walking';
  scanState.scanned = 0;
  scanState.total = 0;
  scanState.error = null;

  try {
    const { tracks: previous, dirMtimes: previousDirMtimes } = await readCache();

    const found: FoundFile[] = [];
    const dirMtimes = new Map<string, number>();
    await walk(config.musicDir, '', 0, found, dirMtimes);

    scanState.phase = 'parsing';
    scanState.total = found.length;

    const tracks: Track[] = new Array(found.length) as Track[];
    let added = 0;
    let updated = 0;
    let reused = 0;

    await pool(found.length, PARSE_CONCURRENCY, async (index) => {
      const file = found[index];
      const id = toTrackId(file.rel);
      const cached = previous.get(id);
      // 目录里新增/删除了歌词、封面时音频的 mtime 不变，
      // 但 hasCover / hasLyrics 已经过期，必须重新解析
      const dirRel = file.rel.includes('/') ? file.rel.slice(0, file.rel.lastIndexOf('/')) : '';
      const dirChanged = previousDirMtimes[dirRel] !== dirMtimes.get(dirRel);

      let track: Track;
      if (cached && !dirChanged && cached.mtimeMs === file.mtimeMs && cached.size === file.size && cached.path === file.rel) {
        track = cached;
        reused++;
      } else {
        track = await parseOne(file);
        if (cached) updated++;
        else added++;
      }

      tracks[index] = track;
      scanState.scanned++;
    });

    const cleaned = tracks.filter(Boolean).sort(compareTracks);

    const seen = new Set(cleaned.map((t) => t.id));
    let removed = 0;
    for (const id of previous.keys()) if (!seen.has(id)) removed++;

    scanState.phase = 'building';
    await writeCache(cleaned, dirMtimes);

    const scannedAt = Date.now();
    scanState.scannedAt = scannedAt;

    return { tracks: cleaned, added, updated, removed, reused, durationMs: Date.now() - started, scannedAt };
  } catch (err) {
    scanState.error = (err as Error).message ?? String(err);
    throw err;
  } finally {
    scanState.scanning = false;
    scanState.phase = 'idle';
  }
}
