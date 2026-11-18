import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFile, selectCover } from 'music-metadata';
import type { Track } from '../../shared/types.ts';
import { config } from './config.ts';
import { IMAGE_EXTS, IMAGE_STEMS } from './scanner.ts';

export interface CoverResult {
  body: Buffer;
  contentType: string;
  /** 用于 ETag，随文件修改时间变化 */
  version: number;
}

/** FIFO 缓存，防止每次拖动进度条都重新解析标签读取封面 */
const MAX_CACHED = 160;
const cache = new Map<string, CoverResult>();

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
};

async function readEmbedded(track: Track): Promise<CoverResult | null> {
  try {
    const meta = await parseFile(path.join(config.musicDir, track.path), { skipCovers: false });
    const picture = selectCover(meta.common.picture);
    if (!picture) return null;
    return {
      body: Buffer.from(picture.data),
      contentType: picture.format || 'image/jpeg',
      version: track.mtimeMs,
    };
  } catch {
    return null;
  }
}

async function readFolderImage(track: Track): Promise<CoverResult | null> {
  const dir = path.dirname(path.join(config.musicDir, track.path));
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return null;
  }

  let best: string | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const name of names) {
    const ext = path.extname(name).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    const stem = name.slice(0, name.length - ext.length).toLowerCase();
    if (!IMAGE_STEMS.has(stem)) continue;
    const rank = stem === 'cover' ? 0 : stem === 'folder' ? 1 : stem === 'front' ? 2 : 3;
    if (best === null || rank < bestRank) {
      best = name;
      bestRank = rank;
    }
  }
  if (!best) return null;

  const abs = path.join(dir, best);
  try {
    const [body, stat] = await Promise.all([fs.readFile(abs), fs.stat(abs)]);
    return {
      body,
      contentType: MIME_BY_EXT[path.extname(best).toLowerCase()] ?? 'image/jpeg',
      version: Math.round(stat.mtimeMs),
    };
  } catch {
    return null;
  }
}

export async function getCover(track: Track): Promise<CoverResult | null> {
  const hit = cache.get(track.id);
  if (hit) {
    // 命中后挪到队尾，实现 LRU 而不是纯 FIFO
    cache.delete(track.id);
    cache.set(track.id, hit);
    return hit;
  }

  const result = (track.coverSource === 'folder' ? null : await readEmbedded(track)) ?? (await readFolderImage(track));
  if (!result) return null;

  cache.set(track.id, result);
  if (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return result;
}
