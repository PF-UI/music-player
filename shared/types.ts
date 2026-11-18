/**
 * 前后端共享的数据契约。
 * 只放类型，不放运行时代码 —— 这样它既能被 Node 的类型剥离直接忽略，
 * 也能被 Vite 在编译期擦除，不需要额外的构建产物。
 */

/** 封面来源：内嵌标签 / 同目录图片 / 无 */
export type CoverSource = 'embedded' | 'folder' | 'none';

export interface Track {
  /** 相对路径的短哈希，前端所有请求用它，URL 里不暴露真实路径 */
  id: string;
  /** 相对音乐根目录的路径，统一用 / 分隔 */
  path: string;
  fileName: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  trackNo: number | null;
  discNo: number | null;
  year: number | null;
  genre: string[];
  /** 秒。标签里没有时由音频头或前端补 */
  duration: number;
  bitrate: number | null;
  sampleRate: number | null;
  codec: string;
  size: number;
  mtimeMs: number;
  hasCover: boolean;
  coverSource: CoverSource;
  hasLyrics: boolean;
  /** 解析标签时出现的问题，仅用于排查，界面上不打扰用户 */
  warning?: string;
}

export interface Album {
  id: string;
  name: string;
  artist: string;
  year: number | null;
  trackCount: number;
  duration: number;
  /** 用来取专辑封面的曲目 id */
  coverTrackId: string;
  /** 这张专辑的曲目里至少有一首带封面 */
  hasCover: boolean;
}

export interface Artist {
  name: string;
  trackCount: number;
  albumCount: number;
}

export interface LibraryStats {
  tracks: number;
  albums: number;
  artists: number;
  totalDuration: number;
  totalSize: number;
}

export interface LibrarySnapshot {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  stats: LibraryStats;
  scannedAt: number;
}

export interface ScanStatus {
  scanning: boolean;
  scanned: number;
  total: number;
  phase: 'idle' | 'walking' | 'parsing' | 'building';
  scannedAt: number;
  error: string | null;
}

/** 逐字时间轴上的一个字（或一小段不可再分的文本） */
export interface LrcWord {
  /** 毫秒 */
  time: number;
  text: string;
}

export interface LrcLine {
  /** 毫秒 */
  time: number;
  /** 可能是多行（原文 + 翻译），用 \n 分隔 */
  text: string;
  /**
   * 逐字时间轴。来自增强 LRC 的 <mm:ss.xx> 标签；
   * 没有时由前端按行时长均分推算。
   */
  words?: LrcWord[];
}

/** 文件头部的 [ti:] [ar:] [al:] [by:]，以及从正文识别的词曲信息 */
export interface LyricsMeta {
  title?: string;
  artist?: string;
  album?: string;
  by?: string;
  /** 作词 */
  writer?: string;
  /** 作曲 */
  composer?: string;
}

export interface Lyrics {
  lines: LrcLine[];
  /** LRC 的 [offset:] 值，毫秒，正数表示歌词提前 */
  offset: number;
  /** 没有任何时间标签时退回纯文本展示 */
  plain: string | null;
  /** 歌词文件自带的歌曲信息，可能为空对象 */
  meta: LyricsMeta;
}

/** 单个文件导入成功后返回的信息 */
export interface ImportResult {
  /** 相对音乐根目录的路径，统一用 / 分隔 */
  path: string;
  size: number;
  /** 目标目录里已有同名文件，导入时自动加了序号 */
  renamed: boolean;
}

/**
 * 播放模式。三个状态共用一个按钮循环切换：
 * loop = 列表循环，one = 单曲循环，shuffle = 随机播放。
 */
export type PlayMode = 'loop' | 'one' | 'shuffle';

export type PanelMode = 'none' | 'lyrics';

export type ViewType = 'tracks' | 'albums' | 'artists' | 'favorites' | 'queue' | 'album';
