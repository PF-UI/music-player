import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** 项目根目录（d:\Music） */
export const ROOT = path.resolve(here, '..', '..');
export const CACHE_DIR = path.join(ROOT, '.cache');
export const CACHE_FILE = path.join(CACHE_DIR, 'library.json');
export const WEB_DIST = path.join(ROOT, 'web', 'dist');

export interface ResolvedConfig {
  /** 音乐根目录的绝对路径 */
  musicDir: string;
  /** 导入功能的落盘根目录（绝对路径），一定位于 musicDir 内 */
  importDir: string;
  port: number;
  host: string;
  /** 小写，带点 */
  extensions: string[];
  excludeDirs: string[];
}

interface RawConfig {
  musicDir?: string;
  /** 导入目录，相对项目根目录；不填则用 music */
  importDir?: string;
  port?: number;
  host?: string;
  extensions?: string[];
  excludeDirs?: string[];
}

const DEFAULTS: Required<RawConfig> = {
  musicDir: '.',
  importDir: 'music',
  port: 3001,
  host: '0.0.0.0',
  extensions: ['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.wma', '.ape', '.aiff', '.aif', '.alac', '.mp4', '.m4b'],
  excludeDirs: ['node_modules', '.git', '.cache', 'dist', '.vite', 'server', 'web'],
};

function loadConfig(): ResolvedConfig {
  const file = path.join(ROOT, 'music.config.json');
  let raw: RawConfig = {};

  if (fs.existsSync(file)) {
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8')) as RawConfig;
    } catch (err) {
      console.warn(`[config] music.config.json 解析失败，使用默认配置：${(err as Error).message}`);
    }
  }

  const merged = { ...DEFAULTS, ...raw };
  const musicDir = path.resolve(ROOT, merged.musicDir);

  // 导入目录必须落在音乐目录内部，否则导入的文件永远不会被扫描到。
  // 这里直接兜底回音乐根目录，而不是让用户看到「导入成功但曲库没变化」。
  let importDir = path.resolve(ROOT, merged.importDir);
  const importRel = path.relative(musicDir, importDir);
  if (!importRel || importRel.startsWith('..') || path.isAbsolute(importRel)) {
    if (importRel) {
      console.warn(`[config] importDir 不在 musicDir 内，已改为音乐根目录：${musicDir}`);
    }
    importDir = musicDir;
  }

  const excludeDirs = merged.excludeDirs;
  // 导入目录本身被扫描排除时，导入等于白导，提前说清楚
  const importSegments = path.relative(musicDir, importDir).split(path.sep).filter(Boolean);
  const blocked = importSegments.find((seg) => excludeDirs.some((dir) => dir.toLowerCase() === seg.toLowerCase()));
  if (blocked) {
    console.warn(`[config] importDir 含有被 excludeDirs 排除的目录「${blocked}」，导入的文件不会出现在曲库里`);
  }

  return {
    musicDir,
    importDir,
    port: Number(merged.port) || DEFAULTS.port,
    host: merged.host || DEFAULTS.host,
    extensions: merged.extensions.map((e) => (e.startsWith('.') ? e : `.${e}`).toLowerCase()),
    excludeDirs,
  };
}

export const config = loadConfig();

fs.mkdirSync(CACHE_DIR, { recursive: true });
