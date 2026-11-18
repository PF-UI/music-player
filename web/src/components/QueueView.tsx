import { useState } from 'react';
import { usePlayer } from '../store/playerStore.ts';
import { formatTime } from '../lib/format.ts';
import { Cover } from './Cover.tsx';
import { PlayIcon, QueueIcon, TrashIcon } from './Icons.tsx';

export function QueueView() {
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const currentTrack = usePlayer((s) => s.currentTrack);
  const removeFromQueue = usePlayer((s) => s.removeFromQueue);
  const clearQueue = usePlayer((s) => s.clearQueue);
  const moveInQueue = usePlayer((s) => s.moveInQueue);
  const playTracks = usePlayer((s) => s.playTracks);
  const togglePlay = usePlayer((s) => s.togglePlay);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const totalDuration = queue.reduce((sum, t) => sum + t.duration, 0);

  if (queue.length === 0) {
    return (
      <div className="empty">
        <QueueIcon size={28} />
        <p>播放队列是空的</p>
        <small>从歌曲列表里点「加入队列」即可添加</small>
      </div>
    );
  }

  return (
    <div className="queue-view">
      <div className="queue-toolbar">
        <span>
          共 {queue.length} 首 · {formatTime(totalDuration)}
        </span>
        <button className="ghost-btn" onClick={clearQueue}>
          <TrashIcon size={15} />
          清空队列
        </button>
      </div>

      <div className="queue-list">
        {queue.map((track, index) => {
          const isActive = track.id === currentTrack?.id;
          return (
            <div
              key={`${track.id}-${index}`}
              className={`queue-row ${isActive ? 'is-active' : ''} ${overIndex === index ? 'is-over' : ''}`}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnter={() => setOverIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) moveInQueue(dragIndex, index);
                setDragIndex(null);
                setOverIndex(null);
              }}
            >
              <span className="drag-handle" aria-hidden>
                ⋮⋮
              </span>
              <button
                className="queue-play"
                onClick={() => {
                  if (isActive) togglePlay();
                  else playTracks(queue, index);
                }}
                aria-label={isActive && isPlaying ? '暂停' : '播放'}
              >
                <Cover
                  trackId={track.id}
                  hasCover={track.hasCover}
                  seed={track.album}
                  label={track.title}
                  size={38}
                  alt=""
                />
                <span className="queue-play-overlay">{isActive && isPlaying ? '❚❚' : <PlayIcon size={14} />}</span>
              </button>
              <span className="queue-text">
                <strong title={track.title}>{track.title}</strong>
                <small>{track.artist}</small>
              </span>
              <span className="queue-dur">{formatTime(track.duration)}</span>
              <button
                className="icon-btn queue-remove"
                onClick={() => removeFromQueue(track.id)}
                aria-label="从队列移除"
                title="移除"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <p className="queue-hint">拖动左侧手柄可以调整播放顺序</p>
      <p className="queue-hint dim">当前序号 {queueIndex + 1}</p>
    </div>
  );
}
