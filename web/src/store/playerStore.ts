import { create } from 'zustand';
import type { LibrarySnapshot, Lyrics, PanelMode, PlayMode, Track, ViewType } from '@shared/types.ts';
import { api } from '../api.ts';
import { engine } from '../audio/engine.ts';
import { loadPersisted, defaults, savePersisted } from '../lib/persist.ts';

/* ------------------------------------------------------------------ */
/* 模块级状态（不参与渲染，避免无谓的重渲染）                            */
/* ------------------------------------------------------------------ */

/** 当前 <audio> 里装的曲目 id，用于判断要不要重新设 src */
let loadedTrackId: string | null = null;
/** 恢复上次播放位置时，等音频就绪再跳转 */
let pendingSeek = 0;
let initStarted = false;

function ensureSource(track: Track): void {
  if (loadedTrackId === track.id) return;
  const audio = engine.audio;
  audio.src = api.streamUrl(track.id);
  audio.load();
  loadedTrackId = track.id;
}

function shuffleArray<T>(list: T[]): T[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function applyTheme(theme: 'dark' | 'light'): void {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b0d12' : '#f4f6fb');
}

function updateMediaSession(track: Track | null): void {
  if (!('mediaSession' in navigator)) return;

  if (!track) {
    navigator.mediaSession.metadata = null;
    return;
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.hasCover
      ? [
          { src: api.coverUrl(track.id), sizes: '512x512', type: 'image/jpeg' },
          { src: api.coverUrl(track.id), sizes: '256x256', type: 'image/jpeg' },
        ]
      : [],
  });
  document.title = `${track.title} · ${track.artist}`;
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export interface PlayerState {
  /* 曲库 */
  library: LibrarySnapshot | null;
  loading: boolean;
  libraryError: string | null;
  notice: string | null;
  scanning: boolean;
  scanProgress: { scanned: number; total: number };

  /* 视图 */
  view: ViewType;
  albumId: string | null;
  artistFilter: string | null;
  query: string;
  favorites: string[];
  panel: PanelMode;
  theme: 'dark' | 'light';
  sidebarOpen: boolean;
  /** 导入歌曲对话框是否打开 */
  importOpen: boolean;

  /* 播放 */
  queue: Track[];
  queueIndex: number;
  queueOrigin: Track[] | null;
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  /** 列表循环 / 单曲循环 / 随机播放，共用一个按钮循环切换 */
  playMode: PlayMode;

  /* 歌词 */
  lyrics: Lyrics | null;
  lyricsLoading: boolean;

  /* actions */
  init: () => Promise<void>;
  syncLibrary: () => Promise<void>;
  rescan: () => Promise<void>;
  /** 轮询扫描状态直到结束，label 用于拼提示语；返回是否成功等到结果 */
  waitForScan: (label: string) => Promise<boolean>;
  setImportOpen: (open: boolean) => void;
  setNotice: (text: string | null) => void;

  playTracks: (tracks: Track[], index: number) => void;
  playCurrent: () => void;
  togglePlay: () => void;
  next: (auto?: boolean) => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  cyclePlayMode: () => void;
  toggleFavorite: (id: string) => void;

  setView: (v: ViewType) => void;
  openAlbum: (id: string) => void;
  openArtist: (name: string) => void;
  clearArtistFilter: () => void;
  setQuery: (q: string) => void;
  clearQuery: () => void;
  setPanel: (p: PanelMode) => void;
  togglePanel: (p: PanelMode) => void;
  setTheme: (t: 'dark' | 'light') => void;
  toggleTheme: () => void;
  setSidebarOpen: (open: boolean) => void;

  playNextInQueue: (track: Track) => void;
  addToQueue: (tracks: Track[]) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  moveInQueue: (from: number, to: number) => void;
}

const initial = defaults();

export const usePlayer = create<PlayerState>((set, get) => ({
  library: null,
  loading: true,
  libraryError: null,
  notice: null,
  scanning: false,
  scanProgress: { scanned: 0, total: 0 },

  view: 'tracks',
  albumId: null,
  artistFilter: null,
  query: '',
  favorites: initial.favorites,
  panel: initial.panel,
  theme: initial.theme,
  sidebarOpen: false,
  importOpen: false,

  queue: [],
  queueIndex: 0,
  queueOrigin: null,
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: initial.volume,
  muted: initial.muted,
  playMode: initial.playMode,

  lyrics: null,
  lyricsLoading: false,

  /* ---------------- 曲库 ---------------- */

  async init() {
    if (initStarted) return;
    initStarted = true;

    const persisted = loadPersisted();
    engine.audio.volume = persisted.volume;
    engine.audio.muted = persisted.muted;
    applyTheme(persisted.theme);

    // 手机上侧栏是浮层，默认展开会直接糊住整个界面，所以一律先收起
    const narrow = window.matchMedia('(max-width: 1020px)').matches;

    set({
      volume: persisted.volume,
      muted: persisted.muted,
      playMode: persisted.playMode,
      favorites: persisted.favorites,
      theme: persisted.theme,
      panel: narrow ? 'none' : persisted.panel,
    });

    await get().syncLibrary();

    // 恢复上次播放的曲目与进度，但不自动播放（浏览器会拦截自动播放）
    const { library } = get();
    if (persisted.lastTrackId && library) {
      const track = library.tracks.find((t) => t.id === persisted.lastTrackId);
      if (track) {
        pendingSeek = persisted.lastPosition;
        set({
          currentTrack: track,
          currentTime: persisted.lastPosition,
          duration: track.duration,
          queue: library.tracks,
          queueIndex: library.tracks.indexOf(track),
        });
        updateMediaSession(track);
        void loadLyricsFor(set, get, track.id);
      }
    }
  },

  async syncLibrary() {
    set({ loading: true, libraryError: null });
    let attempts = 0;

    for (;;) {
      try {
        const library = await api.library();
        set({ library, loading: false, libraryError: null });
        return;
      } catch (err) {
        // 首次扫描还没结束时接口会返回 503，等一会儿重试
        attempts++;
        if (attempts >= 40) {
          set({ loading: false, libraryError: (err as Error).message });
          return;
        }
        await new Promise((r) => setTimeout(r, 700));
      }
    }
  },

  async rescan() {
    set({ scanning: true, notice: '正在重新扫描音乐库…' });
    await api.rescan();
    await get().waitForScan('扫描完成');
  },

  async waitForScan(label) {
    for (;;) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const status = await api.status();
        set({ scanning: status.scanning, scanProgress: { scanned: status.scanned, total: status.total } });
        if (!status.scanning) {
          await get().syncLibrary();
          const stats = get().library?.stats;
          set({
            scanning: false,
            notice: stats ? `${label}：${stats.tracks} 首歌曲，${stats.albums} 张专辑` : label,
          });
          return true;
        }
      } catch {
        set({ scanning: false, notice: '扫描状态获取失败' });
        return false;
      }
    }
  },

  setImportOpen(open) {
    set({ importOpen: open });
  },

  setNotice(text) {
    set({ notice: text });
  },

  /* ---------------- 播放 ---------------- */

  playTracks(tracks, index) {
    if (!tracks.length) return;
    const track = tracks[Math.max(0, Math.min(index, tracks.length - 1))];
    const { playMode } = get();

    let queue = tracks;
    let queueIndex = tracks.indexOf(track);

    if (playMode === 'shuffle' && tracks.length > 1) {
      const rest = shuffleArray(tracks.filter((t) => t.id !== track.id));
      queue = [track, ...rest];
      queueIndex = 0;
    }

    set({ queue, queueIndex, queueOrigin: tracks });
    get().playCurrent();
  },

  playCurrent() {
    const { queue, queueIndex } = get();
    const track = queue[queueIndex];
    if (!track) return;

    ensureSource(track);
    set({ currentTrack: track, isPlaying: true, duration: track.duration || 0 });

    if (pendingSeek > 0) {
      const target = pendingSeek;
      pendingSeek = 0;
      const apply = () => {
        try {
          engine.audio.currentTime = target;
        } catch {
          /* 元数据还没就绪，忽略 */
        }
      };
      if (engine.audio.readyState >= 1) apply();
      else engine.audio.addEventListener('loadedmetadata', apply, { once: true });
    }

    void engine.play().catch((err: Error) => {
      set({ isPlaying: false, notice: `无法播放：${err.message}` });
    });

    updateMediaSession(track);
    void loadLyricsFor(set, get, track.id);
  },

  togglePlay() {
    const { isPlaying, currentTrack, queue } = get();

    if (!currentTrack) {
      if (queue.length > 0) get().playCurrent();
      else {
        const lib = get().library;
        if (lib && lib.tracks.length > 0) get().playTracks(lib.tracks, 0);
      }
      return;
    }

    if (isPlaying) {
      engine.pause();
      set({ isPlaying: false });
      return;
    }

    ensureSource(currentTrack);
    set({ isPlaying: true });
    void engine.play().catch((err: Error) => {
      set({ isPlaying: false, notice: `无法播放：${err.message}` });
    });
  },

  next(auto = false) {
    const { queue, queueIndex, playMode } = get();
    if (queue.length === 0) return;

    const isLast = queueIndex >= queue.length - 1;

    if (!isLast) {
      set({ queueIndex: queueIndex + 1 });
      get().playCurrent();
      return;
    }

    // 到最后了：列表循环 / 随机模式回到开头，单曲循环交给 ended 事件重播
    if (playMode === 'loop' || playMode === 'shuffle') {
      set({ queueIndex: 0 });
      get().playCurrent();
      return;
    }

    if (auto) {
      engine.pause();
      set({ isPlaying: false, currentTime: 0 });
    }
  },

  prev() {
    const { queue, queueIndex, playMode, currentTime } = get();
    if (queue.length === 0) return;

    // 播了 3 秒以上，按「上一首」先回到本曲开头（和主流播放器一致）
    if (currentTime > 3) {
      get().seek(0);
      return;
    }

    if (queueIndex > 0) {
      set({ queueIndex: queueIndex - 1 });
      get().playCurrent();
      return;
    }

    if (playMode === 'loop' || playMode === 'shuffle') {
      set({ queueIndex: queue.length - 1 });
      get().playCurrent();
    } else {
      get().seek(0);
    }
  },

  seek(seconds) {
    const { currentTrack, duration } = get();
    if (!currentTrack) return;

    const target = Math.max(0, Math.min(seconds, duration || seconds));

    if (loadedTrackId !== currentTrack.id || engine.audio.readyState < 1) {
      pendingSeek = target;
      set({ currentTime: target });
      return;
    }

    try {
      engine.audio.currentTime = target;
    } catch {
      pendingSeek = target;
    }
    set({ currentTime: target });
  },

  setVolume(v) {
    const volume = Math.max(0, Math.min(1, v));
    engine.audio.volume = volume;
    if (volume > 0 && get().muted) {
      engine.audio.muted = false;
      set({ muted: false });
    }
    set({ volume });
  },

  toggleMute() {
    const muted = !get().muted;
    engine.audio.muted = muted;
    set({ muted });
  },

  /**
   * 列表循环 → 单曲循环 → 随机播放 → 列表循环。
   * 随机模式会打乱队列并把原顺序记在 queueOrigin 里，切走时原样恢复，
   * 这样「开一下随机再关掉」不会把用户手动排的队列弄乱。
   */
  cyclePlayMode() {
    const { playMode, queue, queueIndex, currentTrack, queueOrigin } = get();
    const order: PlayMode[] = ['loop', 'one', 'shuffle'];
    const nextMode = order[(order.indexOf(playMode) + 1) % order.length];

    const labels: Record<PlayMode, string> = {
      loop: '列表循环',
      one: '单曲循环',
      shuffle: '随机播放',
    };

    // 离开随机：还原成打乱之前的队列
    if (playMode === 'shuffle' && nextMode !== 'shuffle') {
      const origin = queueOrigin ?? queue;
      const index = currentTrack ? origin.findIndex((t) => t.id === currentTrack.id) : 0;
      set({
        playMode: nextMode,
        queue: origin,
        queueIndex: index < 0 ? 0 : index,
        queueOrigin: null,
        notice: labels[nextMode],
      });
      return;
    }

    // 进入随机：当前这首留在队首，其余打乱
    if (nextMode === 'shuffle' && playMode !== 'shuffle') {
      const rest = shuffleArray(queue.filter((_, i) => i !== queueIndex));
      const nextQueue = currentTrack ? [currentTrack, ...rest] : rest;
      set({
        playMode: 'shuffle',
        queue: nextQueue,
        queueIndex: 0,
        queueOrigin: queue,
        notice: labels.shuffle,
      });
      return;
    }

    set({ playMode: nextMode, notice: labels[nextMode] });
  },

  toggleFavorite(id) {
    const favorites = get().favorites;
    set({
      favorites: favorites.includes(id) ? favorites.filter((x) => x !== id) : [id, ...favorites],
    });
  },

  /* ---------------- 视图 ---------------- */

  setView(v) {
    set({ view: v, sidebarOpen: false });
  },

  openAlbum(id) {
    set({ view: 'album', albumId: id, sidebarOpen: false });
  },

  openArtist(name) {
    set({ view: 'tracks', artistFilter: name, query: '', sidebarOpen: false });
  },

  clearArtistFilter() {
    set({ artistFilter: null });
  },

  setQuery(q) {
    set({ query: q, view: q ? 'tracks' : get().view, artistFilter: q ? null : get().artistFilter });
  },

  clearQuery() {
    set({ query: '', artistFilter: null });
  },

  setPanel(p) {
    set({ panel: p });
  },

  togglePanel(p) {
    set({ panel: get().panel === p ? 'none' : p });
  },

  setTheme(t) {
    applyTheme(t);
    set({ theme: t });
  },

  toggleTheme() {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark');
  },

  setSidebarOpen(open) {
    set({ sidebarOpen: open });
  },

  /* ---------------- 队列 ---------------- */

  playNextInQueue(track) {
    const { queue, queueIndex } = get();
    const filtered = queue.filter((t) => t.id !== track.id);
    const index = loadedTrackId ? queueIndex : -1;
    const insertAt = index < 0 ? filtered.length : index + 1;
    filtered.splice(insertAt, 0, track);
    set({ queue: filtered, queueIndex: insertAt <= queueIndex ? queueIndex + 1 : queueIndex });
    if (!get().currentTrack) get().playTracks([track], 0);
  },

  addToQueue(tracks) {
    const { queue } = get();
    const existing = new Set(queue.map((t) => t.id));
    const merged = [...queue, ...tracks.filter((t) => !existing.has(t.id))];
    set({ queue: merged });
    if (!get().currentTrack && merged.length > 0) get().playTracks(merged, 0);
  },

  removeFromQueue(id) {
    const { queue, queueIndex, currentTrack } = get();
    const index = queue.findIndex((t) => t.id === id);
    if (index === -1) return;

    const nextQueue = queue.filter((t) => t.id !== id);

    if (currentTrack?.id === id) {
      if (nextQueue.length === 0) {
        engine.pause();
        engine.audio.removeAttribute('src');
        loadedTrackId = null;
        set({ queue: [], queueIndex: 0, currentTrack: null, isPlaying: false, currentTime: 0, duration: 0 });
        updateMediaSession(null);
        return;
      }
      const nextIndex = Math.min(index, nextQueue.length - 1);
      set({ queue: nextQueue, queueIndex: nextIndex });
      get().playCurrent();
      return;
    }

    set({
      queue: nextQueue,
      queueIndex: index < queueIndex ? Math.max(0, queueIndex - 1) : queueIndex,
    });
  },

  clearQueue() {
    engine.pause();
    engine.audio.removeAttribute('src');
    loadedTrackId = null;
    set({ queue: [], queueIndex: 0, currentTrack: null, isPlaying: false, currentTime: 0, duration: 0, lyrics: null });
    updateMediaSession(null);
  },

  moveInQueue(from, to) {
    const { queue, queueIndex } = get();
    if (from === to || from < 0 || to < 0 || from >= queue.length || to >= queue.length) return;

    const nextQueue = [...queue];
    const [moved] = nextQueue.splice(from, 1);
    nextQueue.splice(to, 0, moved);

    const currentId = queue[queueIndex]?.id;
    const nextIndex = currentId ? nextQueue.findIndex((t) => t.id === currentId) : 0;

    set({ queue: nextQueue, queueIndex: nextIndex < 0 ? 0 : nextIndex });
  },
}));

/* ------------------------------------------------------------------ */
/* 歌词                                                                */
/* ------------------------------------------------------------------ */

type Set = (partial: Partial<PlayerState>) => void;
type Get = () => PlayerState;

async function loadLyricsFor(set: Set, get: Get, trackId: string): Promise<void> {
  set({ lyrics: null, lyricsLoading: true });
  const lyrics = await api.lyrics(trackId);
  // 请求期间可能已经切歌了，只有仍然指向同一首才写入
  if (get().currentTrack?.id !== trackId) return;
  set({ lyrics, lyricsLoading: false });
}

/* ------------------------------------------------------------------ */
/* 音频事件绑定                                                        */
/* ------------------------------------------------------------------ */

const audio = engine.audio;

audio.addEventListener('timeupdate', () => {
  usePlayer.setState({ currentTime: audio.currentTime });
});

audio.addEventListener('durationchange', () => {
  const d = audio.duration;
  if (Number.isFinite(d) && d > 0) usePlayer.setState({ duration: d });
});

audio.addEventListener('play', () => usePlayer.setState({ isPlaying: true }));
audio.addEventListener('pause', () => usePlayer.setState({ isPlaying: false }));

audio.addEventListener('ended', () => {
  const state = usePlayer.getState();
  if (state.playMode === 'one') {
    audio.currentTime = 0;
    void engine.play().catch(() => usePlayer.setState({ isPlaying: false }));
    return;
  }
  state.next(true);
});

audio.addEventListener('error', () => {
  const state = usePlayer.getState();
  // 用户主动清空 src 时会触发一次 error，忽略这种情况
  if (!audio.getAttribute('src')) return;
  usePlayer.setState({ isPlaying: false, notice: `播放失败：${state.currentTrack?.title ?? '未知曲目'}` });
});

/* MediaSession 动作 */
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const safeSet = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
    try {
      ms.setActionHandler(action, handler);
    } catch {
      /* 部分浏览器不支持某些动作 */
    }
  };

  safeSet('play', () => usePlayer.getState().togglePlay());
  safeSet('pause', () => usePlayer.getState().togglePlay());
  safeSet('previoustrack', () => usePlayer.getState().prev());
  safeSet('nexttrack', () => usePlayer.getState().next());
  safeSet('seekbackward', (d) => usePlayer.getState().seek(usePlayer.getState().currentTime - (d.seekOffset ?? 10)));
  safeSet('seekforward', (d) => usePlayer.getState().seek(usePlayer.getState().currentTime + (d.seekOffset ?? 10)));
  safeSet('seekto', (d) => {
    if (typeof d.seekTime === 'number') usePlayer.getState().seek(d.seekTime);
  });
}

/* ------------------------------------------------------------------ */
/* 持久化                                                              */
/* ------------------------------------------------------------------ */

let lastKey = '';

usePlayer.subscribe((state) => {
  const payload = {
    volume: state.volume,
    muted: state.muted,
    playMode: state.playMode,
    favorites: state.favorites,
    theme: state.theme,
    panel: state.panel,
    lastTrackId: state.currentTrack?.id ?? null,
  };

  const key = JSON.stringify(payload);
  if (key === lastKey) return;
  lastKey = key;

  savePersisted({ ...payload, lastPosition: usePlayer.getState().currentTime });
});

// 进度每分钟存一次就够了，太频繁会拖慢 localStorage
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    const state = usePlayer.getState();
    if (!state.currentTrack) return;
    savePersisted({
      volume: state.volume,
      muted: state.muted,
      playMode: state.playMode,
      favorites: state.favorites,
      theme: state.theme,
      panel: state.panel,
      lastTrackId: state.currentTrack.id,
      lastPosition: state.currentTime,
    });
  }, 10_000);
}
