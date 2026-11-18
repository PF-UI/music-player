import { useMemo } from 'react';
import type { Track } from '@shared/types.ts';
import { usePlayer } from '../store/playerStore.ts';
import { initialsOf } from '../lib/format.ts';
import { PlayIcon } from './Icons.tsx';

export function ArtistList() {
  const library = usePlayer((s) => s.library);
  const openArtist = usePlayer((s) => s.openArtist);
  const playTracks = usePlayer((s) => s.playTracks);

  const artists = library?.artists ?? [];

  const tracksByArtist = useMemo(() => {
    const map = new Map<string, Track[]>();
    if (!library) return map;
    for (const t of library.tracks) {
      const list = map.get(t.artist);
      if (list) list.push(t);
      else map.set(t.artist, [t]);
    }
    return map;
  }, [library]);

  if (artists.length === 0) {
    return (
      <div className="empty">
        <p>还没有歌手信息</p>
      </div>
    );
  }

  return (
    <div className="artist-grid">
      {artists.map((artist) => {
        const tracks = tracksByArtist.get(artist.name) ?? [];
        const withCover = tracks.find((t) => t.hasCover);

        return (
          <div key={artist.name} className="artist-card">
            <button className="artist-avatar" onClick={() => openArtist(artist.name)} aria-label={`查看 ${artist.name}`}>
              {withCover ? (
                <img src={`/api/cover/${withCover.id}`} alt="" loading="lazy" draggable={false} />
              ) : (
                <span>{initialsOf(artist.name)}</span>
              )}
            </button>
            <div className="artist-meta">
              <strong title={artist.name}>{artist.name}</strong>
              <small>
                {artist.trackCount} 首 · {artist.albumCount} 张专辑
              </small>
            </div>
            <button
              className="icon-btn artist-play"
              onClick={() => tracks.length && playTracks(tracks, 0)}
              aria-label={`播放 ${artist.name}`}
              title="播放该歌手的全部歌曲"
            >
              <PlayIcon size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
