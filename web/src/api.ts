import type { ImportResult, LibrarySnapshot, Lyrics, ScanStatus } from '@shared/types.ts';

export interface ScanStatusWithLibrary extends ScanStatus {
  hasLibrary: boolean;
}

export interface HealthInfo {
  ok: boolean;
  version: number;
  musicDir: string;
  /** 导入目录相对音乐根目录的前缀，例如 "music"；为空表示导入目录就是音乐根目录 */
  importPrefix: string;
  port: number;
  scannedAt: number;
}

interface ApiErrorBody {
  error: { code: string; message: string };
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>;
    return body.error?.message ?? `请求失败（HTTP ${res.status}）`;
  } catch {
    return `请求失败（HTTP ${res.status}）`;
  }
}

export const api = {
  async health(): Promise<HealthInfo> {
    const res = await fetch('/api/health');
    if (!res.ok) throw new Error(await readError(res));
    return (await res.json()) as HealthInfo;
  },

  async status(): Promise<ScanStatusWithLibrary> {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error(await readError(res));
    return (await res.json()) as ScanStatusWithLibrary;
  },

  async library(): Promise<LibrarySnapshot> {
    const res = await fetch('/api/library');
    if (!res.ok) throw new Error(await readError(res));
    return (await res.json()) as LibrarySnapshot;
  },

  async rescan(): Promise<void> {
    await fetch('/api/rescan', { method: 'POST' });
  },

  async lyrics(id: string): Promise<Lyrics | null> {
    try {
      const res = await fetch(`/api/lyrics/${id}`);
      if (!res.ok) return null;
      return (await res.json()) as Lyrics;
    } catch {
      return null;
    }
  },

  streamUrl: (id: string): string => `/api/stream/${id}`,
  coverUrl: (id: string): string => `/api/cover/${id}`,
  downloadUrl: (id: string): string => `/api/download/${id}`,

  /**
   * 上传单个文件到指定子目录。
   * 用 XMLHttpRequest 而不是 fetch：fetch 拿不到上传进度。
   */
  importFile(dir: string, file: File, onProgress?: (sent: number, total: number) => void): Promise<ImportResult> {
    const query = new URLSearchParams({ dir, name: file.name });
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/import?${query.toString()}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.timeout = 30 * 60 * 1000;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(e.loaded, e.total);
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as ImportResult);
          } catch {
            reject(new Error('服务器返回了无法解析的内容'));
          }
          return;
        }
        let message = `导入失败（HTTP ${xhr.status}）`;
        try {
          const body = JSON.parse(xhr.responseText) as Partial<ApiErrorBody>;
          if (body.error?.message) message = body.error.message;
        } catch {
          /* 非 JSON 响应，用默认提示 */
        }
        reject(new Error(message));
      };

      xhr.onerror = () => reject(new Error('网络中断，文件没有导入'));
      xhr.ontimeout = () => reject(new Error('上传超时'));
      xhr.onabort = () => reject(new Error('已取消'));
      xhr.send(file);
    });
  },
};
