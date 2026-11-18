import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../store/playerStore.ts';
import { formatTime } from '../lib/format.ts';
import { api } from '../api.ts';
import { Cover } from './Cover.tsx';
import {
  DownloadIcon,
  HeartIcon,
  LyricIcon,
  MuteIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  QueueIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  VolumeIcon,
} from './Icons.tsx';

export function PlayerBar() {
  const currentTrack = usePlayer((s) => s.currentTrack);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const currentTime = usePlayer((s) => s.currentTime);
  const duration = usePlayer((s) => s.duration);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const playMode = usePlayer((s) => s.playMode);
  const panel = usePlayer((s) => s.panel);
  const favorites = usePlayer((s) => s.favorites);

  const togglePlay = usePlayer((s) => s.togglePlay);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const seek = usePlayer((s) => s.seek);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const cyclePlayMode = usePlayer((s) => s.cyclePlayMode);
  const togglePanel = usePlayer((s) => s.togglePanel);
  const toggleFavorite = usePlayer((s) => s.toggleFavorite);
  const setView = usePlayer((s) => s.setView);
  const openAlbum = usePlayer((s) => s.openAlbum);
  const toggleTheme = usePlayer((s) => s.toggleTheme);
  const theme = usePlayer((s) => s.theme);

  const liked = currentTrack ? favorites.includes(currentTrack.id) : false;
  const playModeLabel =
    playMode === 'one' ? '单曲循环' : playMode === 'shuffle' ? '随机播放' : '列表循环';

  return (
    <footer className="player-bar">
      {/* 左：当前曲目 */}
      <div className="pb-track">
        {currentTrack ? (
          <>
            <Cover
              trackId={currentTrack.id}
              hasCover={currentTrack.hasCover}
              seed={currentTrack.album}
              label={currentTrack.title}
              size={52}
              alt={`${currentTrack.title} 封面`}
            />
            <div className="pb-track-text">
              <strong title={currentTrack.title}>{currentTrack.title}</strong>
              <button className="link-btn" onClick={() => setView('tracks')} title={currentTrack.artist}>
                {currentTrack.artist}
              </button>
            </div>
            <button
              className={`icon-btn heart ${liked ? 'is-liked' : ''}`}
              onClick={() => toggleFavorite(currentTrack.id)}
              aria-label={liked ? '取消收藏' : '收藏'}
              title="收藏"
            >
              <HeartIcon size={17} filled={liked} />
            </button>
          </>
        ) : (
          <div className="pb-idle">选择一首歌开始播放</div>
        )}
      </div>

      {/* 中：控制 + 进度 */}
      <div className="pb-center">
        <div className="pb-controls">
          <button className="icon-btn skip-btn" onClick={prev} aria-label="上一首" title="上一首">
            <PrevIcon size={18} />
          </button>

          <button className="play-btn" onClick={togglePlay} aria-label={isPlaying ? '暂停' : '播放'}>
            {isPlaying ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
          </button>

          <button className="icon-btn skip-btn" onClick={() => next()} aria-label="下一首" title="下一首">
            <NextIcon size={18} />
          </button>

          {/* 列表循环 / 单曲循环 / 随机共用一个按钮，点一次切下一个 */}
          <button
            className={`icon-btn play-mode-btn ${playMode !== 'loop' ? 'is-on' : ''}`}
            onClick={cyclePlayMode}
            aria-label={`播放模式：${playModeLabel}`}
            title={`${playModeLabel}（点击切换，快捷键 S）`}
          >
            {playMode === 'one' ? (
              <RepeatOneIcon size={17} />
            ) : playMode === 'shuffle' ? (
              <ShuffleIcon size={17} />
            ) : (
              <RepeatIcon size={17} />
            )}
          </button>
        </div>

        <div className="pb-progress">
          <span className="time">{formatTime(currentTime)}</span>
          <SeekBar current={currentTime} duration={duration} onSeek={seek} disabled={!currentTrack} />
          <span className="time">{formatTime(duration)}</span>
        </div>
      </div>

      {/* 右：音量 + 面板 */}
      <div className="pb-right">
        <button
          className={`icon-btn ${panel === 'lyrics' ? 'is-on' : ''}`}
          onClick={() => togglePanel('lyrics')}
          aria-label="歌词面板"
          title="歌词（L）"
        >
          <LyricIcon size={18} />
        </button>
        <button className="icon-btn" onClick={() => setView('queue')} aria-label="播放队列" title="播放队列">
          <QueueIcon size={18} />
        </button>

        {/* 下载放在右侧操作区：原来紧挨播放键，手机上极容易误点 */}
        {currentTrack && (
          <a
            className="icon-btn download-link"
            href={api.downloadUrl(currentTrack.id)}
            download
            aria-label="下载"
            title="下载到本机"
          >
            <DownloadIcon size={17} />
          </a>
        )}

        <div className="volume">
          <button className="icon-btn" onClick={toggleMute} aria-label={muted ? '取消静音' : '静音'} title="静音">
            {muted || volume === 0 ? <MuteIcon size={17} /> : <VolumeIcon size={17} />}
          </button>
          <input
            className="slider volume-slider"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="音量"
            style={{ ['--fill' as string]: `${(muted ? 0 : volume) * 100}%` }}
          />
        </div>

        <button className="icon-btn theme-toggle" onClick={toggleTheme} aria-label="切换主题" title="切换主题">
          {theme === 'dark' ? '☾' : '☀'}
        </button>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */

interface SeekBarProps {
  current: number;
  duration: number;
  onSeek: (seconds: number) => void;
  disabled?: boolean;
}

/**
 * 进度条。拖动过程中用本地值，避免 timeupdate 把滑块拽回去。
 */
function SeekBar({ current, duration, onSeek, disabled }: SeekBarProps) {
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(0);
  const barRef = useRef<HTMLDivElement | null>(null);

  const total = duration > 0 ? duration : 0;
  const value = dragging ? preview : current;
  const percent = total > 0 ? Math.min(100, (value / total) * 100) : 0;

  // 拖动时在 document 上监听，指针移出进度条也继续跟随
  useEffect(() => {
    if (!dragging) return;

    const move = (e: PointerEvent) => {
      const el = barRef.current;
      if (!el || total <= 0) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      setPreview(ratio * total);
    };

    const up = () => {
      setDragging(false);
      setPreview((p) => {
        onSeek(p);
        return p;
      });
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, total, onSeek]);

  const startFrom = (e: React.PointerEvent) => {
    if (disabled || total <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setPreview(ratio * total);
    setDragging(true);
    onSeek(ratio * total);
  };

  return (
    <div
      className={`seek-bar ${disabled ? 'is-disabled' : ''} ${dragging ? 'is-dragging' : ''}`}
      ref={barRef}
      onPointerDown={startFrom}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="播放进度"
      aria-valuemin={0}
      aria-valuemax={Math.round(total)}
      aria-valuenow={Math.round(value)}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'ArrowLeft') onSeek(Math.max(0, current - 5));
        if (e.key === 'ArrowRight') onSeek(Math.min(total, current + 5));
      }}
    >
      <span className="seek-track">
        <span className="seek-fill" style={{ width: `${percent}%` }} />
        <span className="seek-thumb" style={{ left: `${percent}%` }} />
      </span>
      {dragging && <span className="seek-tip">{formatTime(preview)}</span>}
    </div>
  );
}
