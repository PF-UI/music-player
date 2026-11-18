import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Track } from '@shared/types.ts';
import { usePlayer } from '../store/playerStore.ts';
import { formatTime } from '../lib/format.ts';
import { api } from '../api.ts';
import { Cover } from './Cover.tsx';
import { DownloadIcon, HeartIcon, MusicIcon, PlayIcon } from './Icons.tsx';

interface TrackListProps {
  tracks: Track[];
  /** 是否显示专辑列（专辑详情里不需要） */
  showAlbum?: boolean;
  showHeader?: boolean;
  emptyHint?: string;
}

/** 与 index.css 里 .track-row 的 height 保持一致 */
const ROW_HEIGHT = 58;
/** 视口上下各多渲染几行，快速滚动时不至于露白 */
const OVERSCAN = 8;

/**
 * 只渲染视口附近的行。
 * 列表本身不滚动（滚的是外层的 .content），所以把监听挂到 window 的捕获阶段，
 * 任何祖先容器滚动都能收到；视口高度用 window.innerHeight 近似，
 * 最多多渲染一两行，不会漏行。
 */
function useVirtualRange(ref: React.RefObject<HTMLDivElement | null>, count: number) {
  const [range, setRange] = useState(() => ({ start: 0, end: Math.min(count, 40) }));

  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const offset = -list.getBoundingClientRect().top; // 已经滚过列表顶部的像素
      const viewport = window.innerHeight;
      const start = Math.max(0, Math.min(count, Math.floor(offset / ROW_HEIGHT) - OVERSCAN));
      const end = Math.max(0, Math.min(count, Math.ceil((offset + viewport) / ROW_HEIGHT) + OVERSCAN));
      setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll, { passive: true });
    const observer = new ResizeObserver(onScroll);
    observer.observe(list);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      observer.disconnect();
    };
  }, [ref, count]);

  return range;
}

export function TrackList({ tracks, showAlbum = true, showHeader = true, emptyHint = '这里还没有歌曲' }: TrackListProps) {
  const currentTrack = usePlayer((s) => s.currentTrack);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const queue = usePlayer((s) => s.queue);
  const playTracks = usePlayer((s) => s.playTracks);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const favorites = usePlayer((s) => s.favorites);
  const toggleFavorite = usePlayer((s) => s.toggleFavorite);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const setNotice = usePlayer((s) => s.setNotice);

  // 队列里正在播的是不是这个列表里的曲目：决定点击行是「跳到那首」还是「重新开队列」
  const queueIds = useMemo(() => queue.map((t) => t.id), [queue]);
  const activeId = currentTrack?.id ?? null;

  const listRef = useRef<HTMLDivElement | null>(null);
  const { start, end } = useVirtualRange(listRef, tracks.length);

  if (tracks.length === 0) {
    return (
      <div className="empty">
        <MusicIcon size={28} />
        <p>{emptyHint}</p>
      </div>
    );
  }

  const handleRowClick = (index: number) => {
    const track = tracks[index];
    const inQueue = queueIds.includes(track.id);
    if (inQueue && activeId === track.id) {
      togglePlay();
      return;
    }
    // 已经在队列里：直接定位到那首，保留队列上下文
    if (inQueue) {
      const target = queue.findIndex((t) => t.id === track.id);
      if (target >= 0) {
        usePlayer.setState({ queueIndex: target });
        usePlayer.getState().playCurrent();
        return;
      }
    }
    playTracks(tracks, index);
  };

  return (
    <div className="track-list" ref={listRef}>
      {showHeader && (
        <div className="track-head">
          <span className="col-index">#</span>
          <span className="col-title">标题</span>
          {showAlbum && <span className="col-album">专辑</span>}
          <span className="col-like" />
          <span className="col-time">时长</span>
        </div>
      )}

      {/* 屏幕外的行用等高占位撑开，保证滚动条长度和位置正确 */}
      {start > 0 && <div style={{ height: start * ROW_HEIGHT, flex: 'none' }} aria-hidden />}

      {tracks.slice(start, end).map((track, offset) => {
        const index = start + offset;
        const isActive = track.id === activeId;
        const isCurrentPlaying = isActive && isPlaying;
        const liked = favorites.includes(track.id);

        return (
          <div
            key={`${track.id}-${index}`}
            className={`track-row ${isActive ? 'is-active' : ''}`}
            onClick={() => handleRowClick(index)}
            onDoubleClick={() => playTracks(tracks, index)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleRowClick(index);
              }
            }}
          >
            <span className="col-index">
              {isCurrentPlaying ? (
                <span className="bars" aria-label="正在播放">
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                <>
                  <span className="index-num">{index + 1}</span>
                  <span className="index-play">
                    <PlayIcon size={14} />
                  </span>
                </>
              )}
            </span>

            <span className="col-title">
              <Cover
                trackId={track.id}
                hasCover={track.hasCover}
                seed={track.album}
                label={track.title}
                size={40}
                alt={`${track.title} 封面`}
              />
              <span className="title-text">
                <span className="title-main" title={track.title}>
                  {track.title}
                </span>
                <span className="title-sub">{track.artist}</span>
              </span>
            </span>

            {showAlbum && (
              <span className="col-album" title={track.album}>
                {track.album}
              </span>
            )}

            <span className="col-like">
              <button
                className={`icon-btn heart ${liked ? 'is-liked' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(track.id);
                }}
                aria-label={liked ? '取消收藏' : '收藏'}
              >
                <HeartIcon size={16} filled={liked} />
              </button>
              <button
                className="icon-btn add-queue"
                onClick={(e) => {
                  e.stopPropagation();
                  addToQueue([track]);
                  setNotice(`已加入队列：${track.title}`);
                }}
                aria-label="加入队列"
                title="加入队列"
              >
                <QueuePlus />
              </button>
              <a
                className="icon-btn download-link"
                href={api.downloadUrl(track.id)}
                download
                onClick={(e) => e.stopPropagation()}
                aria-label="下载"
                title="下载到本机"
              >
                <DownloadIcon size={16} />
              </a>
            </span>

            <span className="col-time">{formatTime(track.duration)}</span>
          </div>
        );
      })}

      {end < tracks.length && (
        <div style={{ height: (tracks.length - end) * ROW_HEIGHT, flex: 'none' }} aria-hidden />
      )}
    </div>
  );
}

function QueuePlus() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
    >
      <path d="M4 7h9M4 12h9M4 17h6" />
      <path d="M17 13v6M14 16h6" />
    </svg>
  );
}
