import { useDeferredValue, useEffect, useMemo } from 'react';
import { usePlayer } from './store/playerStore.ts';
import { useKeyboard } from './hooks/useKeyboard.ts';
import { AmbientBackground } from './components/AmbientBackground.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { TrackList } from './components/TrackList.tsx';
import { AlbumGrid } from './components/AlbumGrid.tsx';
import { ArtistList } from './components/ArtistList.tsx';
import { AlbumDetail } from './components/AlbumDetail.tsx';
import { QueueView } from './components/QueueView.tsx';
import { LyricPanel } from './components/LyricPanel.tsx';
import { PlayerBar } from './components/PlayerBar.tsx';
import { ImportDialog } from './components/ImportDialog.tsx';
import { MenuIcon, MusicIcon, SearchIcon } from './components/Icons.tsx';
import { formatBytes, formatRelativeTime, formatTotal } from './lib/format.ts';

export default function App() {
  const init = usePlayer((s) => s.init);
  const loading = usePlayer((s) => s.loading);
  const libraryError = usePlayer((s) => s.libraryError);
  const library = usePlayer((s) => s.library);
  const view = usePlayer((s) => s.view);
  const query = usePlayer((s) => s.query);
  const setQuery = usePlayer((s) => s.setQuery);
  const clearQuery = usePlayer((s) => s.clearQuery);
  const artistFilter = usePlayer((s) => s.artistFilter);
  const clearArtistFilter = usePlayer((s) => s.clearArtistFilter);
  const favorites = usePlayer((s) => s.favorites);
  const panel = usePlayer((s) => s.panel);
  const notice = usePlayer((s) => s.notice);
  const setNotice = usePlayer((s) => s.setNotice);
  const setPanel = usePlayer((s) => s.setPanel);
  const setSidebarOpen = usePlayer((s) => s.setSidebarOpen);
  const queue = usePlayer((s) => s.queue);

  useKeyboard();
  usePlayer((s) => s.theme);

  useEffect(() => {
    void init();
  }, [init]);

  // 提示条 3 秒后自动消失
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice, setNotice]);

  // 输入框保持即时响应，过滤推迟一帧再做：曲库上万首时每敲一个字全量过滤会明显卡顿
  const deferredQuery = useDeferredValue(query);

  const tracks = useMemo(() => library?.tracks ?? [], [library]);

  const filtered = useMemo(() => filterTracks(tracks, deferredQuery), [tracks, deferredQuery]);

  const favoriteTracks = useMemo(() => {
    const ids = new Set(favorites);
    return tracks.filter((t) => ids.has(t.id));
  }, [tracks, favorites]);

  const artistTracks = useMemo(
    () => (artistFilter ? tracks.filter((t) => t.artist === artistFilter) : []),
    [tracks, artistFilter],
  );

  if (loading) {
    return (
      <div className="boot">
        <AmbientBackground />
        <div className="boot-inner">
          <div className="boot-mark">
            <MusicIcon size={26} />
          </div>
          <h1>音乐库</h1>
          <p>正在读取曲目…首次扫描需要一点时间</p>
          <div className="boot-bar">
            <span />
          </div>
        </div>
      </div>
    );
  }

  if (libraryError) {
    return (
      <div className="boot">
        <div className="boot-inner">
          <h1>打不开音乐库</h1>
          <p>{libraryError}</p>
          <button className="primary-btn" onClick={() => location.reload()}>
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`app ${panel !== 'none' ? 'has-panel' : ''}`}>
      <AmbientBackground />

      <Sidebar />

      <main className="main">
        <div className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setSidebarOpen(true)} aria-label="打开菜单">
            <MenuIcon size={20} />
          </button>

          <div className="search-wrap">
            <SearchIcon size={17} />
            <input
              className="search-input"
              type="search"
              placeholder="搜索歌曲、歌手、专辑…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="搜索"
            />
            {query && (
              <button className="icon-btn search-clear" onClick={clearQuery} aria-label="清空搜索">
                ×
              </button>
            )}
            <kbd>/</kbd>
          </div>
        </div>

        <div className="content">
          <ViewHeader view={view} query={query} artistFilter={artistFilter} />

          {query ? (
            <TrackList
              tracks={filtered}
              emptyHint={`没有找到与「${query}」匹配的歌曲`}
            />
          ) : view === 'tracks' ? (
            <>
              {artistFilter && (
                <div className="filter-chip">
                  只看歌手：<strong>{artistFilter}</strong>
                  <button className="icon-btn" onClick={clearArtistFilter} aria-label="取消歌手筛选">
                    ×
                  </button>
                </div>
              )}
              <TrackList tracks={artistFilter ? artistTracks : (library?.tracks ?? [])} />
            </>
          ) : view === 'albums' ? (
            <AlbumGrid albums={library?.albums ?? []} />
          ) : view === 'artists' ? (
            <ArtistList />
          ) : view === 'favorites' ? (
            <TrackList tracks={favoriteTracks} emptyHint="还没有收藏。点歌曲右侧的心形图标即可收藏" />
          ) : view === 'queue' ? (
            <QueueView />
          ) : (
            <AlbumDetail />
          )}

          {library && library.stats.tracks === 0 && !query && (
            <div className="empty">
              <MusicIcon size={30} />
              <p>音乐目录里还没有歌曲</p>
              <small>
                点侧边栏的「导入歌曲」上传文件，或把音频直接放进{' '}
                <code>{'.'}</code> 目录（即 music.config.json 里的 musicDir），再点「重新扫描」
              </small>
            </div>
          )}
        </div>
      </main>

      {panel !== 'none' && (
        <>
          <div className="panel-scrim" onClick={() => setPanel('none')} aria-hidden />
          <div className="side-panel">
            <LyricPanel />
          </div>
        </>
      )}

      <PlayerBar />

      <ImportDialog />

      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}

      <div className="sr-only" aria-live="polite">
        队列共 {queue.length} 首
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function filterTracks(tracks: import('@shared/types.ts').Track[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return tracks;
  const terms = q.split(/\s+/).filter(Boolean);

  return tracks.filter((t) => {
    const haystack = `${t.title}\n${t.artist}\n${t.album}\n${t.albumArtist}\n${t.fileName}\n${t.genre.join(' ')}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

interface ViewHeaderProps {
  view: string;
  query: string;
  artistFilter: string | null;
}

function ViewHeader({ view, query, artistFilter }: ViewHeaderProps) {
  const library = usePlayer((s) => s.library);
  const clearArtistFilter = usePlayer((s) => s.clearArtistFilter);
  const stats = library?.stats;

  if (query) {
    return (
      <header className="view-head">
        <h1>搜索结果</h1>
        <p>关键词「{query}」</p>
      </header>
    );
  }

  const titles: Record<string, { title: string; sub?: string }> = {
    tracks: {
      title: artistFilter ? artistFilter : '全部歌曲',
      sub: artistFilter ? '该歌手的全部曲目' : undefined,
    },
    albums: { title: '专辑', sub: stats ? `共 ${stats.albums} 张` : undefined },
    artists: { title: '歌手', sub: stats ? `共 ${stats.artists} 位` : undefined },
    favorites: { title: '我的收藏' },
    queue: { title: '播放队列' },
    album: { title: '专辑详情' },
  };

  const meta = titles[view] ?? titles.tracks;

  return (
    <header className="view-head">
      <div>
        <h1>{meta.title}</h1>
        {meta.sub && <p>{meta.sub}</p>}
      </div>
      {stats && view === 'tracks' && !artistFilter && (
        <div className="head-stats">
          <span>{stats.tracks} 首</span>
          <span>{formatTotal(stats.totalDuration)}</span>
          <span>{formatBytes(stats.totalSize)}</span>
          <span>更新于 {formatRelativeTime(library?.scannedAt ?? 0)}</span>
        </div>
      )}
      {view === 'tracks' && artistFilter && (
        <button className="ghost-btn" onClick={clearArtistFilter}>
          取消歌手筛选
        </button>
      )}
    </header>
  );
}
