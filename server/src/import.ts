import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from './config.ts';
import { IMAGE_EXTS } from './scanner.ts';

/** 单个文件上限 4GB，挡住误把超大文件拖进来的情况 */
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024 * 1024;

/** 歌词文件也允许一起导入，落到音频旁边就能被 readLyrics 找到 */
const LYRICS_EXTS = new Set(['.lrc', '.txt']);

/** Windows 不允许的字符 + 控制字符 */
// eslint-disable-next-line no-control-regex
const INVALID_CHARS = /[<>:"|?*\u0000-\u001F]/g;
/** Windows 保留设备名，作为文件名会创建失败 */
const RESERVED_NAMES = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

export function importableExts(): Set<string> {
  return new Set([...config.extensions, ...LYRICS_EXTS, ...IMAGE_EXTS]);
}

/** 清洗单个路径片段；返回 null 表示这个片段不可用 */
function safeSegment(raw: string): string | null {
  const cleaned = raw
    .normalize('NFC')
    .replace(INVALID_CHARS, '')
    // Windows 不允许片段以空格或点结尾，隐藏文件也会被扫描跳过，一并去掉
    .replace(/^[\s.]+|[\s.]+$/g, '');
  if (!cleaned || cleaned === '.' || cleaned === '..') return null;
  if (RESERVED_NAMES.test(cleaned)) return null;
  // 片段过长（中文按 UTF-16 计）在 Windows 上会直接失败，截断更安全
  return cleaned.length > 180 ? cleaned.slice(0, 180) : cleaned;
}

/**
 * 规范化用户填写的目标子目录（相对导入目录，不是音乐根目录）。
 * 返回 '' 表示导入目录本身；返回 null 表示不合法（绝对路径、盘符、含非法片段等）。
 */
export function sanitizeImportDir(raw: string | null | undefined): string | null {
  const text = (raw ?? '').replace(/\\/g, '/').trim();
  const trimmed = text.replace(/^\/+|\/+$/g, '');
  if (!trimmed) return '';
  if (trimmed.length > 300) return null;
  // 拒绝 C:/ 之类的盘符写法，否则 path.resolve 会跳出导入目录
  if (/^[a-zA-Z]:/.test(trimmed)) return null;

  let parts = trimmed.split('/').filter(Boolean);
  if (parts.length === 0) return '';

  // 允许用户习惯性地写 music/xxx：剥掉与导入目录同名的前缀，避免出现 music/music
  const prefixSegments = importPrefix()
    .split('/')
    .filter(Boolean)
    .map((seg) => seg.toLowerCase());
  if (prefixSegments.length > 0 && parts.length >= prefixSegments.length) {
    const head = parts.slice(0, prefixSegments.length).map((seg) => seg.toLowerCase());
    if (head.every((seg, i) => seg === prefixSegments[i])) {
      parts = parts.slice(prefixSegments.length);
    }
  }
  if (parts.length === 0) return '';
  if (parts.length > 8) return null;

  const out: string[] = [];
  for (const part of parts) {
    const seg = safeSegment(part);
    if (!seg) return null;
    out.push(seg);
  }

  // 导入目录相对音乐根目录的那几段（例如 music）不算用户输入，
  // 只检查用户自己填的片段，避免误伤。
  const blocked = out.find((seg) => config.excludeDirs.some((dir) => dir.toLowerCase() === seg.toLowerCase()));
  if (blocked) return null;

  return out.join('/');
}

/** 校验导入的文件名，只允许音频 / 歌词 / 图片 */
export function sanitizeImportName(raw: string | null | undefined): string | null {
  const base = path.basename((raw ?? '').replace(/\\/g, '/')).trim();
  if (!base) return null;

  const ext = path.extname(base).toLowerCase();
  if (!importableExts().has(ext)) return null;

  const stem = safeSegment(base.slice(0, base.length - ext.length));
  if (!stem) return null;

  return `${stem}${ext}`;
}

export interface ImportTarget {
  /** 目标目录相对音乐根目录的路径（含导入前缀，如 music/周杰伦），统一用 / */
  dirRel: string;
  absPath: string;
  relPath: string;
  /** 因为重名而自动加了序号 */
  renamed: boolean;
}

/**
 * 导入目录相对音乐根目录的前缀，例如 musicDir 是项目根时返回 "music"。
 * 前端用它提示「文件会落在哪里」，和曲目 path 的前缀是同一个值。
 */
export function importPrefix(): string {
  return path.relative(config.musicDir, config.importDir).split(path.sep).filter(Boolean).join('/');
}

async function exists(target: string): Promise<boolean> {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

function withSuffix(fileName: string, index: number): string {
  const ext = path.extname(fileName);
  return `${fileName.slice(0, fileName.length - ext.length)} (${index})${ext}`;
}

/** 建目录并算出一个不冲突的最终文件名。dirRel 是相对导入目录的子路径 */
export async function prepareImportTarget(dirRel: string, fileName: string): Promise<ImportTarget> {
  const dirAbs = path.resolve(config.importDir, dirRel);

  // 用户片段已清洗过，这里再兜一道，防止未来改动绕过校验跳出导入目录
  const insideImport = path.relative(config.importDir, dirAbs);
  if (insideImport.startsWith('..') || path.isAbsolute(insideImport)) {
    throw new Error('目标目录不在导入目录内');
  }

  await fsp.mkdir(dirAbs, { recursive: true });

  let name = fileName;
  let renamed = false;
  let next = await exists(path.join(dirAbs, name));
  for (let index = 2; next; index++) {
    if (index > 999) throw new Error('同名文件太多了，换个文件名吧');
    name = withSuffix(fileName, index);
    renamed = true;
    next = await exists(path.join(dirAbs, name));
  }

  // 返回值统一相对音乐根目录，和 Track.path 的语义保持一致
  const dirRelToMusic = path.relative(config.musicDir, dirAbs).split(path.sep).filter(Boolean).join('/');

  return {
    dirRel: dirRelToMusic,
    absPath: path.join(dirAbs, name),
    relPath: dirRelToMusic ? `${dirRelToMusic}/${name}` : name,
    renamed,
  };
}

/**
 * 把请求体流式写到磁盘：先写 .part，完整收完再改名，
 * 中途断线不会在曲库里留下半截文件。返回实际字节数。
 */
export async function saveUpload(body: Readable, target: ImportTarget): Promise<number> {
  const partPath = `${target.absPath}.part`;
  let bytes = 0;
  let tooLarge = false;

  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > MAX_IMPORT_BYTES) {
        tooLarge = true;
        callback(new Error('FILE_TOO_LARGE'));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(body, counter, fs.createWriteStream(partPath));
    if (bytes === 0) throw new Error('EMPTY_FILE');
    await fsp.rename(partPath, target.absPath);
    return bytes;
  } catch (err) {
    await fsp.rm(partPath, { force: true }).catch(() => {});
    if (tooLarge) throw new Error('FILE_TOO_LARGE');
    throw err;
  }
}
