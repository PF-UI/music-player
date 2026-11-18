import type { LibrarySnapshot, ScanStatus } from '../../shared/types.ts';

/** 扫描进度，供 /api/status 轮询读取 */
export const scanState: ScanStatus = {
  scanning: false,
  scanned: 0,
  total: 0,
  phase: 'idle',
  scannedAt: 0,
  error: null,
};

/** 最近一次构建好的音乐库快照，进程内缓存 */
export let snapshot: LibrarySnapshot | null = null;
/** id -> 曲目，接口按 id 反查 */
export let trackIndex = new Map<string, import('../../shared/types.ts').Track>();

export function setSnapshot(next: LibrarySnapshot): void {
  snapshot = next;
  trackIndex = new Map(next.tracks.map((t) => [t.id, t]));
}
