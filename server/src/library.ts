import { createHash } from 'node:crypto';
import type { Album, Artist, LibrarySnapshot, LibraryStats, Track } from '../../shared/types.ts';

function shortHash(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 12);
}

/** 曲目所在目录（相对路径），根目录返回空串 */
function dirOf(relPath: string): string {
  const i = relPath.lastIndexOf('/');
  return i === -1 ? '' : relPath.slice(0, i);
}

/**
 * 没有专辑标签时，如果按「未知专辑」聚合，会把半个库塞进同一个专辑里。
 * 这里退化成按文件夹分组，视觉上更接近用户的直觉。
 */
function albumKeyOf(track: Track): string {
  if (track.album && track.album !== '未知专辑') {
    return `tag:${track.albumArtist}|${track.album}`;
  }
  return `dir:${dirOf(track.path)}`;
}

function albumNameOf(track: Track, key: string): string {
  if (key.startsWith('tag:')) return track.album;
  const dir = dirOf(track.path);
  if (!dir) return '根目录';
  const parts = dir.split('/');
  return parts[parts.length - 1] ?? '根目录';
}

export function buildLibrary(tracks: Track[]): LibrarySnapshot {
  interface AlbumAcc {
    name: string;
    artist: string;
    year: number | null;
    trackCount: number;
    duration: number;
    coverTrackId: string;
    hasCover: boolean;
  }

  const albumMap = new Map<string, AlbumAcc>();
  const artistMap = new Map<string, { trackCount: number; albums: Set<string> }>();
  let totalDuration = 0;
  let totalSize = 0;

  for (const track of tracks) {
    const key = albumKeyOf(track);
    const albumId = shortHash(key);

    let acc = albumMap.get(key);
    if (!acc) {
      acc = {
        name: albumNameOf(track, key),
        artist: track.albumArtist,
        year: null,
        trackCount: 0,
        duration: 0,
        coverTrackId: track.id,
        hasCover: false,
      };
      albumMap.set(key, acc);
    }

    acc.trackCount += 1;
    acc.duration += track.duration;
    if (acc.year === null && track.year) acc.year = track.year;
    if (!acc.hasCover && track.hasCover) {
      acc.hasCover = true;
      acc.coverTrackId = track.id;
    }
    // 专辑歌手优先取有 albumartist 的那首
    if (acc.artist === '未知艺术家' && track.albumArtist !== '未知艺术家') {
      acc.artist = track.albumArtist;
    }

    const artistName = track.artist || '未知艺术家';
    let artistAcc = artistMap.get(artistName);
    if (!artistAcc) {
      artistAcc = { trackCount: 0, albums: new Set() };
      artistMap.set(artistName, artistAcc);
    }
    artistAcc.trackCount += 1;
    artistAcc.albums.add(albumId);

    totalDuration += track.duration;
    totalSize += track.size;
  }

  const albums: Album[] = [...albumMap.entries()]
    .map(([key, acc]) => ({
      id: shortHash(key),
      name: acc.name,
      artist: acc.artist,
      year: acc.year,
      trackCount: acc.trackCount,
      duration: acc.duration,
      coverTrackId: acc.coverTrackId,
      hasCover: acc.hasCover,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  const artists: Artist[] = [...artistMap.entries()]
    .map(([name, acc]) => ({ name, trackCount: acc.trackCount, albumCount: acc.albums.size }))
    .sort((a, b) => b.trackCount - a.trackCount || a.name.localeCompare(b.name, 'zh-CN'));

  const stats: LibraryStats = {
    tracks: tracks.length,
    albums: albums.length,
    artists: artists.length,
    totalDuration,
    totalSize,
  };

  return { tracks, albums, artists, stats, scannedAt: Date.now() };
}

/** 按专辑 id 取该专辑的曲目（已按 disc/track 排好） */
export function tracksOfAlbum(tracks: Track[], albumId: string): Track[] {
  return tracks.filter((t) => shortHash(albumKeyOf(t)) === albumId);
}

export { shortHash };
