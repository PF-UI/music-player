import type { PanelMode, PlayMode } from '@shared/types.ts';

const KEY = 'mp:v1';

export interface PersistedState {
  volume: number;
  muted: boolean;
  playMode: PlayMode;
  favorites: string[];
  theme: 'dark' | 'light';
  panel: PanelMode;
  lastTrackId: string | null;
  lastPosition: number;
}

const DEFAULTS: PersistedState = {
  volume: 0.8,
  muted: false,
  playMode: 'loop',
  favorites: [],
  theme: 'dark',
  panel: 'lyrics',
  lastTrackId: null,
  lastPosition: 0,
};

const VALID_PLAY_MODE: PlayMode[] = ['loop', 'one', 'shuffle'];
const VALID_PANEL: PanelMode[] = ['none', 'lyrics'];

/** 旧版本把「循环」和「随机」拆成两个开关，这里折算成单键模式，升级后设置不丢 */
function resolvePlayMode(raw: Partial<PersistedState> & { repeat?: unknown; shuffle?: unknown }): PlayMode {
  if (VALID_PLAY_MODE.includes(raw.playMode as PlayMode)) return raw.playMode as PlayMode;
  if (raw.shuffle === true) return 'shuffle';
  if (raw.repeat === 'one') return 'one';
  return DEFAULTS.playMode;
}

function sanitize(raw: Partial<PersistedState> | null): PersistedState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS };

  const volume = typeof raw.volume === 'number' && raw.volume >= 0 && raw.volume <= 1 ? raw.volume : DEFAULTS.volume;

  return {
    volume,
    muted: Boolean(raw.muted),
    playMode: resolvePlayMode(raw as Partial<PersistedState> & { repeat?: unknown; shuffle?: unknown }),
    favorites: Array.isArray(raw.favorites) ? raw.favorites.filter((x) => typeof x === 'string') : [],
    theme: raw.theme === 'light' ? 'light' : 'dark',
    panel: VALID_PANEL.includes(raw.panel as PanelMode) ? (raw.panel as PanelMode) : DEFAULTS.panel,
    lastTrackId: typeof raw.lastTrackId === 'string' ? raw.lastTrackId : null,
    lastPosition:
      typeof raw.lastPosition === 'number' && Number.isFinite(raw.lastPosition) && raw.lastPosition >= 0
        ? raw.lastPosition
        : 0,
  };
}

export function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return sanitize(JSON.parse(raw) as Partial<PersistedState>);
  } catch {
    return { ...DEFAULTS };
  }
}

let writeTimer: number | undefined;

export function savePersisted(state: PersistedState): void {
  // 合并短时间内的多次写入（拖音量条时每像素都会触发）
  if (writeTimer !== undefined) window.clearTimeout(writeTimer);
  writeTimer = window.setTimeout(() => {
    writeTimer = undefined;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* 隐私模式或配额满，忽略 */
    }
  }, 350);
}

export function defaults(): PersistedState {
  return { ...DEFAULTS };
}
