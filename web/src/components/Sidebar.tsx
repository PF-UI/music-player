import { usePlayer } from '../store/playerStore.ts';
import { formatTotal } from '../lib/format.ts';
import {
  AlbumIcon,
  ArtistIcon,
  CloseIcon,
  HeartIcon,
  MusicIcon,
  QueueIcon,
  RefreshIcon,
  UploadIcon,
} from './Icons.tsx';
import type { ViewType } from '@shared/types.ts';

interface NavItem {
  key: ViewType;
  label: string;
  icon: typeof MusicIcon;
  count?: number;
}

export function Sidebar() {
  const view = usePlayer((s) => s.view);
  const setView = usePlayer((s) => s.setView);
  const library = usePlayer((s) => s.library);
  const favorites = usePlayer((s) => s.favorites);
  const queue = usePlayer((s) => s.queue);
  const rescan = usePlayer((s) => s.rescan);
  const scanning = usePlayer((s) => s.scanning);
  const scanProgress = usePlayer((s) => s.scanProgress);
  const sidebarOpen = usePlayer((s) => s.sidebarOpen);
  const setSidebarOpen = usePlayer((s) => s.setSidebarOpen);
  const theme = usePlayer((s) => s.theme);
  const toggleTheme = usePlayer((s) => s.toggleTheme);
  const setImportOpen = usePlayer((s) => s.setImportOpen);

  const stats = library?.stats;

  const items: NavItem[] = [
    { key: 'tracks', label: '全部歌曲', icon: MusicIcon, count: stats?.tracks },
    { key: 'albums', label: '专辑', icon: AlbumIcon, count: stats?.albums },
    { key: 'artists', label: '歌手', icon: ArtistIcon, count: stats?.artists },
    { key: 'favorites', label: '我的收藏', icon: HeartIcon, count: favorites.length },
    { key: 'queue', label: '播放队列', icon: QueueIcon, count: queue.length },
  ];

  return (
    <>
      {sidebarOpen && <div className="scrim" onClick={() => setSidebarOpen(false)} aria-hidden />}
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <MusicIcon size={18} />
          </div>
          <div className="brand-text">
            <strong>音乐库</strong>
            <span>本地播放器</span>
          </div>
          <button className="icon-btn sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="收起菜单">
            <CloseIcon size={18} />
          </button>
        </div>

        <nav className="nav">
          {items.map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              className={`nav-item ${view === key ? 'is-active' : ''}`}
              onClick={() => setView(key)}
            >
              <Icon size={18} />
              <span className="nav-label">{label}</span>
              {count !== undefined && count > 0 && <span className="nav-count">{count}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {stats && (
            <div className="stats">
              <div className="stat-row">
                <span>曲目</span>
                <strong>{stats.tracks}</strong>
              </div>
              <div className="stat-row">
                <span>总时长</span>
                <strong>{formatTotal(stats.totalDuration)}</strong>
              </div>
            </div>
          )}

          <button className="ghost-btn full" onClick={() => setImportOpen(true)} disabled={scanning}>
            <UploadIcon size={16} />
            导入歌曲
          </button>

          <button className="ghost-btn full" onClick={() => void rescan()} disabled={scanning}>
            <RefreshIcon size={16} className={scanning ? 'spin' : ''} />
            {scanning
              ? scanProgress.total > 0
                ? `扫描中 ${scanProgress.scanned}/${scanProgress.total}`
                : '扫描中…'
              : '重新扫描'}
          </button>

          <button className="ghost-btn full" onClick={toggleTheme}>
            {theme === 'dark' ? '切换到浅色' : '切换到深色'}
          </button>
        </div>
      </aside>
    </>
  );
}
