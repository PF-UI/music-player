import fs from 'node:fs/promises';
import path from 'node:path';
import type { LrcLine, LrcWord, Lyrics, LyricsMeta, Track } from '../../shared/types.ts';
import { config } from './config.ts';

/** [mm:ss.xx] / [mm:ss:xx] / [mm:ss] 三种写法都收 */
const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
/** 增强 LRC 逐字时间戳：<mm:ss.xx> / <mm:ss:xx> / <mm:ss> */
const WORD_TAG = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;
const OFFSET_TAG = /\[offset:\s*([+-]?\d+)\s*\]/i;
const META_TAG = /^\[(ti|ar|al|by|writer|composer):\s*(.*?)\]\s*$/i;
const WRITER_RE = /^(?:作词|词)\s*[:：]\s*(.+)$/;
const COMPOSER_RE = /^(?:作曲|曲)\s*[:：]\s*(.+)$/;

function fracToMs(frac: string | undefined): number {
  if (!frac) return 0;
  if (frac.length === 1) return Number(frac) * 100;
  if (frac.length === 2) return Number(frac) * 10;
  return Number(frac.slice(0, 3));
}

function tagToMs(minutes: string, seconds: string, frac: string | undefined): number {
  return (Number(minutes) * 60 + Number(seconds)) * 1000 + fracToMs(frac);
}

/**
 * 解析增强 LRC 逐字标签。`<mm:ss.xx>` 标记其后文本的起始时间。
 * 第一个标签之前的前缀字用 time=-1，调用方再换成行时间。
 */
function parseWords(content: string): { text: string; words: LrcWord[] } {
  const tags: { index: number; end: number; time: number }[] = [];
  WORD_TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_TAG.exec(content)) !== null) {
    tags.push({ index: m.index, end: m.index + m[0].length, time: tagToMs(m[1], m[2], m[3]) });
  }
  if (tags.length === 0) {
    return { text: content.trim(), words: [] };
  }

  const words: LrcWord[] = [];
  let plain = '';

  const prefix = content.slice(0, tags[0].index);
  if (prefix) {
    words.push({ time: -1, text: prefix });
    plain += prefix;
  }

  for (let i = 0; i < tags.length; i++) {
    const start = tags[i].end;
    const end = i + 1 < tags.length ? tags[i + 1].index : content.length;
    const chunk = content.slice(start, end);
    if (!chunk) continue;
    words.push({ time: tags[i].time, text: chunk });
    plain += chunk;
  }

  return {
    text: plain.trim() || content.replace(/<[^>]*>/g, '').trim(),
    words,
  };
}

function absorbCredits(meta: LyricsMeta, content: string): void {
  const writer = WRITER_RE.exec(content);
  if (writer && !meta.writer) meta.writer = writer[1].trim();
  const composer = COMPOSER_RE.exec(content);
  if (composer && !meta.composer) meta.composer = composer[1].trim();
}

export function parseLrc(raw: string): Lyrics {
  const text = raw.replace(/^\uFEFF/, ''); // 去掉 BOM，否则第一行标签匹配不到
  const offsetMatch = OFFSET_TAG.exec(text);
  const offset = offsetMatch ? Number(offsetMatch[1]) : 0;

  const meta: LyricsMeta = {};
  const lines: LrcLine[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const metaMatch = META_TAG.exec(rawLine.trim());
    if (metaMatch) {
      const key = metaMatch[1].toLowerCase();
      const value = metaMatch[2].trim();
      if (!value) continue;
      if (key === 'ti') meta.title = value;
      else if (key === 'ar') meta.artist = value;
      else if (key === 'al') meta.album = value;
      else if (key === 'by') meta.by = value;
      else if (key === 'writer') meta.writer = value;
      else if (key === 'composer') meta.composer = value;
      continue;
    }

    TIME_TAG.lastIndex = 0;
    const stamps: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = TIME_TAG.exec(rawLine)) !== null) {
      stamps.push(tagToMs(m[1], m[2], m[3]));
    }
    if (stamps.length === 0) continue;

    // 去掉所有 [..] 标签；空内容保留为前奏/间奏留白行
    const afterTags = rawLine.replace(/\[[^\]]*\]/g, '');
    const contentRaw = afterTags.trim();

    if (!contentRaw) {
      for (const time of stamps) {
        lines.push({ time, text: '' });
      }
      continue;
    }

    const { text: content, words } = parseWords(contentRaw);
    if (!content) continue;

    absorbCredits(meta, content);

    for (const time of stamps) {
      const last = lines[lines.length - 1];
      // 同一时间戳出现两次 → 通常是原文 + 翻译，合并成一条
      if (last && Math.abs(last.time - time) < 10) {
        last.text = `${last.text}\n${content}`;
      } else {
        const line: LrcLine = { time, text: content };
        if (words.length > 0) {
          const firstTimed = words.find((w) => w.time >= 0)?.time ?? time;
          line.words = words.map((w) => ({
            time: w.time < 0 ? time : time + Math.max(0, w.time - firstTimed),
            text: w.text,
          }));
        }
        lines.push(line);
      }
    }
  }

  lines.sort((a, b) => a.time - b.time);

  if (lines.length === 0) {
    // 没有任何时间标签：当成纯文本歌词，前端静态展示
    const plain = text
      .split(/\r?\n/)
      .map((l) => {
        if (META_TAG.exec(l.trim())) return '';
        return l.replace(/\[[^\]]*\]/g, '').trim();
      })
      .filter(Boolean)
      .join('\n');
    return { lines: [], offset, plain: plain || null, meta };
  }

  return { lines, offset, plain: null, meta };
}

/** 找同名歌词文件：先 .lrc，再 .txt，大小写不敏感 */
export async function readLyrics(track: Track): Promise<Lyrics | null> {
  const abs = path.join(config.musicDir, track.path);
  const dir = path.dirname(abs);
  const base = path.basename(abs);
  const stem = base.slice(0, base.length - path.extname(base).length);

  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return null;
  }

  const lookup = new Map(names.map((n) => [n.toLowerCase(), n]));
  const target = lookup.get(`${stem.toLowerCase()}.lrc`) ?? lookup.get(`${stem.toLowerCase()}.txt`);
  if (!target) return null;

  try {
    // 歌词文件通常很小，但极端情况（整张专辑歌词塞一个文件）也会超，限制 2MB
    const stat = await fs.stat(path.join(dir, target));
    if (stat.size > 2 * 1024 * 1024) return null;
    const raw = await fs.readFile(path.join(dir, target), 'utf8');
    return parseLrc(raw);
  } catch {
    return null;
  }
}
