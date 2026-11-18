import { useEffect, useState } from 'react';
import type { Track } from '@shared/types.ts';
import { usePlayer } from '../store/playerStore.ts';
import { formatTotal } from '../lib/format.ts';
import { TrackList } from './TrackList.tsx';
import { Cover } from './Cover.tsx';
import { PlayIcon } from './Icons.tsx';

export function AlbumDetail() {
  const albumId = usePlayer((s) => s.albumId);
  const library = usePlayer((s) => s.library);
  const playTracks = usePlayer((s) => s.playTracks);
  const setView = usePlayer((s) => s.setView);
  const openArtist = usePlayer((s) => s.openArtist);

  const album = library?.albums.find((a) => a.id === albumId) ?? null;
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!albumId) return;
    let cancelled = false;
    setLoading(true);

    fetch(`/api/albums/${encodeURIComponent(albumId)}/tracks`)
      .then((res) => (res.ok ? (res.json() as Promise<Track[]>) : Promise.resolve([])))
      .then((list) => {
        if (!cancelled) setTracks(list);
      })
      .catch(() => {
        if (!cancelled) setTracks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [albumId]);

  if (!album) {
    return (
      <div className="empty">
        <p>找不到这张专辑，可能音乐库已更新</p>
        <button className="ghost-btn" onClick={() => setView('albums')}>
          返回专辑列表
        </button>
      </div>
    );
  }

  return (
    <div className="album-detail">
      <div className="album-hero">
        <Cover
          trackId={album.coverTrackId}
          hasCover={album.hasCover}
          seed={album.name}
          label={album.name}
          size={190}
          className="album-hero-cover"
          alt={`${album.name} 封面`}
        />

        <div className="album-hero-info">
          <span className="eyebrow">专辑</span>
          <h1>{album.name}</h1>
          <div className="album-hero-sub">
            <button className="link-btn strong" onClick={() => openArtist(album.artist)}>
              {album.artist}
            </button>
            {album.year && <span>· {album.year}</span>}
            <span>· {album.trackCount} 首</span>
            <span>· {formatTotal(album.duration)}</span>
          </div>

          <div className="album-hero-actions">
            <button className="primary-btn" onClick={() => tracks.length && playTracks(tracks, 0)} disabled={!tracks.length}>
              <PlayIcon size={16} />
              播放全部
            </button>
            <button className="ghost-btn" onClick={() => setView('albums')}>
              返回
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="empty small">
          <p>正在读取曲目…</p>
        </div>
      ) : (
        <TrackList tracks={tracks} showAlbum={false} emptyHint="这张专辑里还没有可用曲目" />
      )}
    </div>
  );
}
