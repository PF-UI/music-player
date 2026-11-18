import { useState } from 'react';
import type { Album, Track } from '@shared/types.ts';
import { usePlayer } from '../store/playerStore.ts';
import { formatTotal } from '../lib/format.ts';
import { Cover } from './Cover.tsx';
import { PlayIcon } from './Icons.tsx';

interface AlbumGridProps {
  albums: Album[];
  emptyHint?: string;
}

/**
 * 专辑卡片网格。
 * 曲目列表不在快照里直接携带（会让 /api/library 体积翻倍），
 * 所以点「播放」时按需拉一次该专辑的曲目。
 */
export function AlbumGrid({ albums, emptyHint = '还没有专辑' }: AlbumGridProps) {
  const openAlbum = usePlayer((s) => s.openAlbum);
  const playTracks = usePlayer((s) => s.playTracks);
  const setNotice = usePlayer((s) => s.setNotice);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (albums.length === 0) {
    return (
      <div className="empty">
        <p>{emptyHint}</p>
      </div>
    );
  }

  const playAlbum = async (album: Album) => {
    setPendingId(album.id);
    try {
      const res = await fetch(`/api/albums/${encodeURIComponent(album.id)}/tracks`);
      if (!res.ok) throw new Error('无法读取专辑曲目');
      const tracks = (await res.json()) as Track[];
      if (tracks.length === 0) {
        setNotice('这张专辑里没有可播放的曲目');
        return;
      }
      playTracks(tracks, 0);
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="album-grid">
      {albums.map((album) => (
        <div key={album.id} className="album-card">
          <div className="album-cover-wrap">
            <button className="album-cover-btn" onClick={() => openAlbum(album.id)} aria-label={`打开专辑 ${album.name}`}>
              <Cover
                trackId={album.coverTrackId}
                hasCover={album.hasCover}
                seed={album.name}
                label={album.name}
                fluid
                alt={`${album.name} 封面`}
              />
            </button>
            <button
              className={`album-play ${pendingId === album.id ? 'is-busy' : ''}`}
              onClick={() => void playAlbum(album)}
              aria-label={`播放专辑 ${album.name}`}
              title="播放整张专辑"
            >
              <PlayIcon size={18} />
            </button>
          </div>

          <button className="album-meta" onClick={() => openAlbum(album.id)}>
            <strong title={album.name}>{album.name}</strong>
            <span title={album.artist}>{album.artist}</span>
            <small>
              {album.trackCount} 首 · {formatTotal(album.duration)}
            </small>
          </button>
        </div>
      ))}
    </div>
  );
}
