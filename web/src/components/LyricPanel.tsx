import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { LrcLine, LrcWord, LyricsMeta } from '@shared/types.ts';
import { usePlayer } from '../store/playerStore.ts';
import { LyricIcon } from './Icons.tsx';

/**
 * 把一行拆成逐字列表。
 * - 若 LRC 自带 words（增强格式），直接用；
 * - 否则按 Unicode 字素均分到 [行开始, 下一行开始) 区间。
 */
function resolveWords(line: LrcLine, nextTime: number | null): LrcWord[] {
  if (!line.text) return [];
  if (line.words && line.words.length > 0) return line.words;

  // 翻译行（\n 之后）不参与逐字动画，只拆主文
  const main = line.text.split('\n')[0] ?? '';
  const chars = Array.from(main);
  if (chars.length === 0) return [];

  const end = nextTime != null && nextTime > line.time ? nextTime : line.time + Math.max(1200, chars.length * 280);
  const span = Math.max(end - line.time, chars.length * 40);
  const step = span / chars.length;

  return chars.map((ch, i) => ({
    time: Math.round(line.time + step * i),
    text: ch,
  }));
}

function findActive(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

function MetaHeader({
  meta,
  fallback,
}: {
  meta: LyricsMeta;
  fallback?: { title?: string; artist?: string; album?: string };
}) {
  const title = meta.title || fallback?.title;
  const artist = meta.artist || fallback?.artist;
  const album = meta.album || fallback?.album;
  if (!title && !artist && !album) return null;

  return (
    <div className="lyric-meta">
      {title && <p className="lyric-meta-title">{title}</p>}
      {artist && <p className="lyric-meta-artist">{artist}</p>}
      {album && <p className="lyric-meta-album">{album}</p>}
    </div>
  );
}

const EMPTY_WORDS: LrcWord[] = [];

interface LyricLineProps {
  line: LrcLine;
  words: LrcWord[];
  isActive: boolean;
  isPast: boolean;
  /** 只在当前行有意义，非当前行统一传 -1，保证 memo 的比较结果稳定 */
  activeWordIndex: number;
  offsetSec: number;
  onSeek: (seconds: number) => void;
  setRef: (el: HTMLParagraphElement | null) => void;
}

/**
 * 单行歌词。
 * 用 memo 包住的原因：播放时 currentTime 每秒更新四次，如果整屏几十行
 * 每行几十个字全部重渲染，移动端会明显掉帧。包住之后一次更新只重渲染
 * 状态真正变了的 1～2 行。
 */
const LyricLineRow = memo(function LyricLineRow({
  line,
  words,
  isActive,
  isPast,
  activeWordIndex,
  offsetSec,
  onSeek,
  setRef,
}: LyricLineProps) {
  if (!line.text) {
    return <p ref={setRef} className={`lyric-spacer ${isActive ? 'is-active' : ''}`} aria-hidden />;
  }

  const translation = line.text.includes('\n') ? line.text.split('\n').slice(1).join('\n') : null;

  return (
    <p
      ref={setRef}
      className={`lyric-line ${isActive ? 'is-active' : ''} ${isPast ? 'is-past' : ''}`}
      onClick={() => onSeek(line.time / 1000 + offsetSec)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSeek(line.time / 1000 + offsetSec);
      }}
    >
      <span className="lyric-main">
        {words.map((w, wi) => {
          const wordPast = isPast || (isActive && wi < activeWordIndex);
          const wordActive = isActive && wi === activeWordIndex;
          return (
            <span
              key={`${w.time}-${wi}`}
              className={`lyric-word ${wordActive ? 'is-active' : ''} ${wordPast ? 'is-past' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onSeek(w.time / 1000 + offsetSec);
              }}
            >
              {w.text}
            </span>
          );
        })}
      </span>
      {translation && <span className="lyric-sub">{translation}</span>}
    </p>
  );
});

/**
 * 歌词面板。
 * 标题/词曲固定在滚动区上方；正文按行+字高亮，并支持前奏留白行。
 */
export function LyricPanel() {
  const lyrics = usePlayer((s) => s.lyrics);
  const lyricsLoading = usePlayer((s) => s.lyricsLoading);
  const currentTime = usePlayer((s) => s.currentTime);
  const currentTrack = usePlayer((s) => s.currentTrack);
  const seek = usePlayer((s) => s.seek);
  const setPanel = usePlayer((s) => s.setPanel);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const [manualUntil, setManualUntil] = useState(0);
  const [active, setActive] = useState(-1);

  const lines = lyrics?.lines ?? [];
  const offset = lyrics?.offset ?? 0;
  const plain = lyrics?.plain ?? null;
  const meta = lyrics?.meta ?? {};

  const wordLists = useMemo(
    () => lines.map((line, i) => resolveWords(line, i + 1 < lines.length ? lines[i + 1].time : null)),
    [lines],
  );

  const lineTimes = useMemo(() => lines.map((l) => l.time), [lines]);

  // ref 回调必须保持引用稳定，否则每次 currentTime 更新都会让 memo 失效
  const lineRefSetters = useMemo(
    () =>
      lines.map((_, i) => (el: HTMLParagraphElement | null) => {
        lineRefs.current[i] = el;
      }),
    [lines.length],
  );

  const activeIndex = useMemo(() => {
    if (lineTimes.length === 0) return -1;
    return findActive(lineTimes, currentTime * 1000 - offset);
  }, [lineTimes, currentTime, offset]);

  const activeWordIndex = useMemo(() => {
    if (activeIndex < 0) return -1;
    const words = wordLists[activeIndex] ?? [];
    if (words.length === 0) return -1;
    return findActive(
      words.map((w) => w.time),
      currentTime * 1000 - offset,
    );
  }, [activeIndex, wordLists, currentTime, offset]);

  useEffect(() => {
    setActive(activeIndex);
  }, [activeIndex]);

  // 自动跟随（留白行也参与滚动，让前奏期间停在留白位置）
  useEffect(() => {
    if (active < 0) return;
    if (Date.now() < manualUntil) return;
    const container = scrollRef.current;
    const el = lineRefs.current[active];
    if (!container || !el) return;

    const target = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [active, manualUntil, lines.length]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onScroll = () => setManualUntil(Date.now() + 3000);
    container.addEventListener('wheel', onScroll, { passive: true });
    container.addEventListener('touchmove', onScroll, { passive: true });
    return () => {
      container.removeEventListener('wheel', onScroll);
      container.removeEventListener('touchmove', onScroll);
    };
  }, [lines.length]);

  const metaBlock = currentTrack ? (
    <MetaHeader
      meta={meta}
      fallback={{
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
      }}
    />
  ) : null;

  return (
    <section className="panel lyric-panel">
      <header className="panel-head">
        <h2>歌词</h2>
        <button className="icon-btn" onClick={() => setPanel('none')} aria-label="关闭歌词面板">
          ×
        </button>
      </header>

      {!currentTrack ? (
        <div className="empty small">
          <LyricIcon size={24} />
          <p>还没有播放任何歌曲</p>
        </div>
      ) : lyricsLoading ? (
        <div className="empty small">
          <p>正在读取歌词…</p>
        </div>
      ) : lines.length > 0 ? (
        <div className="lyric-scroll" ref={scrollRef}>
          <div className="lyric-inner">
            {metaBlock}
            {lines.map((line, i) => (
              <LyricLineRow
                key={`${line.time}-${i}`}
                line={line}
                words={wordLists[i] ?? EMPTY_WORDS}
                isActive={i === active}
                isPast={i < active}
                activeWordIndex={i === active ? activeWordIndex : -1}
                offsetSec={offset / 1000}
                onSeek={seek}
                setRef={lineRefSetters[i]}
              />
            ))}
          </div>
        </div>
      ) : plain ? (
        <div className="lyric-scroll">
          <div className="lyric-inner">
            {metaBlock}
            {plain.split('\n').map((line, i) => (
              <p key={i} className="lyric-line is-past">
                {line}
              </p>
            ))}
            <p className="lyric-hint">这份歌词没有时间轴，无法自动高亮</p>
          </div>
        </div>
      ) : (
        <div className="empty small">
          <LyricIcon size={24} />
          <p>这首歌没有歌词文件</p>
          <small>把同名 .lrc 放在音频旁边即可自动加载</small>
        </div>
      )}
    </section>
  );
}
