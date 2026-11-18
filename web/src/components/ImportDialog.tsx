import { useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import { usePlayer } from '../store/playerStore.ts';
import { formatBytes } from '../lib/format.ts';
import { CloseIcon, UploadIcon } from './Icons.tsx';

/** 允许选择的扩展名，和后端 importableExts() 保持一致 */
const ACCEPT =
  '.mp3,.flac,.m4a,.aac,.ogg,.opus,.wav,.wma,.ape,.aiff,.aif,.alac,.mp4,.m4b,.lrc,.txt,.jpg,.jpeg,.png,.webp,.bmp,.gif,.avif';

const AUDIO_EXTS = new Set([
  '.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.wma', '.ape', '.aiff', '.aif', '.alac', '.mp4', '.m4b',
]);

const ACCEPT_EXTS = new Set(ACCEPT.split(','));

type ItemStatus = 'pending' | 'uploading' | 'done' | 'error';

interface Item {
  file: File;
  status: ItemStatus;
  progress: number;
  message?: string;
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

export function ImportDialog() {
  const open = usePlayer((s) => s.importOpen);
  const setImportOpen = usePlayer((s) => s.setImportOpen);
  const waitForScan = usePlayer((s) => s.waitForScan);
  const setNotice = usePlayer((s) => s.setNotice);

  const [dir, setDir] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [prefix, setPrefix] = useState('');

  const inputRef = useRef<HTMLInputElement | null>(null);

  // 导入落点由后端固定，前端只负责展示，避免两边写死的路径不一致
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .health()
      .then((info) => {
        if (!cancelled) setPrefix(info.importPrefix);
      })
      .catch(() => {
        /* 拿不到就退化成不显示前缀，不影响导入 */
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // 关闭时清空状态，下次打开是干净的
  useEffect(() => {
    if (open) return;
    setItems([]);
    setRunning(false);
    setDragging(false);
    setHint(null);
  }, [open]);

  // Esc 关闭；导入进行中不允许关，避免传到一半的文件留下 .part
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !running) setImportOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, running, setImportOpen]);

  if (!open) return null;

  const addFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    if (list.length === 0) return;

    const accepted: Item[] = [];
    const rejected: string[] = [];

    for (const file of list) {
      const ext = extOf(file.name);
      // 目录拖进来时浏览器会给出 size 为 0 的条目，直接跳过
      if (file.size === 0) continue;
      if (!ACCEPT_EXTS.has(ext)) {
        rejected.push(file.name);
        continue;
      }
      accepted.push({ file, status: 'pending', progress: 0 });
    }

    if (accepted.length > 0) {
      setItems((prev) => [...prev, ...accepted]);
      setHint(null);
    }
    if (rejected.length > 0) {
      setHint(`已跳过 ${rejected.length} 个不支持的文件：${rejected.slice(0, 3).join('、')}${rejected.length > 3 ? '…' : ''}`);
    } else if (accepted.length === 0) {
      setHint('没有识别到可导入的文件。拖拽文件夹不会自动展开，请选中文件夹里的文件。');
    }
  };

  const updateItem = (index: number, patch: Partial<Item>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const startImport = async () => {
    if (running || items.length === 0) return;

    setRunning(true);
    setHint(null);

    let ok = 0;
    let failed = 0;
    let firstError: string | null = null;

    // 串行上传：同时写同一块磁盘不会更快，反而让进度条乱跳
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === 'done') continue;
      updateItem(i, { status: 'uploading', progress: 0, message: undefined });

      try {
        const result = await api.importFile(dir, items[i].file, (sent, total) => {
          updateItem(i, { progress: total > 0 ? sent / total : 0 });
        });
        updateItem(i, {
          status: 'done',
          progress: 1,
          message: result.renamed ? `已重命名为 ${result.path.split('/').pop()}` : undefined,
        });
        ok++;
      } catch (err) {
        const message = (err as Error).message;
        updateItem(i, { status: 'error', progress: 0, message });
        failed++;
        firstError = firstError ?? message;
      }
    }

    setRunning(false);

    if (ok === 0) {
      setHint(firstError ?? '没有文件导入成功');
      return;
    }

    setNotice(`已导入 ${ok} 个文件，正在更新曲库…`);
    const settled = await waitForScan(`已导入 ${ok} 个文件${failed > 0 ? `，${failed} 个失败` : ''}`);

    // 全部成功且曲库刷新完成才自动关窗，失败时留在原地好看错误
    if (settled && failed === 0) {
      setImportOpen(false);
    } else if (failed > 0) {
      setHint(`${failed} 个文件失败：${firstError ?? '请检查文件名或网络'}`);
    }
  };

  const audioCount = items.filter((item) => AUDIO_EXTS.has(extOf(item.file.name))).length;
  const totalSize = items.reduce((sum, item) => sum + item.file.size, 0);
  const doneCount = items.filter((item) => item.status === 'done').length;
  const busy = running;

  return (
    <div className="dialog-scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && setImportOpen(false)}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="导入歌曲">
        <header className="dialog-head">
          <div>
            <h2>导入歌曲</h2>
            <p>文件只会保存到 {prefix ? <code>{prefix}</code> : '音乐'} 目录下，导入后自动刷新曲库</p>
          </div>
          <button
            className="icon-btn"
            onClick={() => !busy && setImportOpen(false)}
            disabled={busy}
            aria-label="关闭"
            title={busy ? '导入进行中，请稍候' : '关闭'}
          >
            <CloseIcon size={18} />
          </button>
        </header>

        <div className="dialog-body">
          <label className="import-field">
            <span>
              导入位置{prefix ? <>：<code>{prefix}</code> 目录下</> : '：音乐目录'}
            </span>
            <div className="import-path">
              {prefix && <span className="import-prefix">{prefix}/</span>}
              <input
                type="text"
                value={dir}
                onChange={(e) => setDir(e.target.value)}
                placeholder="周杰伦/叶惠美（可留空）"
                disabled={busy}
                spellCheck={false}
                autoComplete="off"
                autoFocus
              />
            </div>
          </label>
          <p className="import-note">
            留空则直接放在{prefix ? `${prefix} 目录` : '音乐目录'}根下；可以用 <code>/</code> 分隔多层子目录。
            重名文件会自动加序号，不会被覆盖。
          </p>

          <div
            className={`import-drop ${dragging ? 'is-over' : ''} ${busy ? 'is-busy' : ''}`}
            onClick={() => !busy && inputRef.current?.click()}
            onDragOver={(e) => {
              if (busy) return;
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              if (busy) return;
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            role="button"
            tabIndex={busy ? -1 : 0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            <UploadIcon size={22} />
            <strong>把文件拖到这里，或点击选择</strong>
            <small>音频 · 歌词（.lrc/.txt）· 封面图片，可一次选多个</small>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {hint && <p className="import-error">{hint}</p>}

          {items.length > 0 && (
            <div className="import-summary">
              共 {items.length} 个文件（{audioCount} 首音频，{formatBytes(totalSize)}）
              {doneCount > 0 && ` · 已完成 ${doneCount}`}
            </div>
          )}

          <ul className="import-list">
            {items.map((item, index) => (
              <li key={`${item.file.name}-${item.file.size}-${index}`} className={`import-item is-${item.status}`}>
                <div className="import-item-main">
                  <span className="import-item-name" title={item.file.name}>
                    {item.file.name}
                  </span>
                  <span className="import-item-size">{formatBytes(item.file.size)}</span>
                </div>
                <div className="import-bar" aria-hidden>
                  <span style={{ width: `${Math.round(item.progress * 100)}%` }} />
                </div>
                <div className="import-item-foot">
                  <span>
                    {item.status === 'pending' && '等待导入'}
                    {item.status === 'uploading' &&
                      `上传中 ${Math.round(item.progress * 100)}%`}
                    {item.status === 'done' && '已导入'}
                    {item.status === 'error' && '失败'}
                  </span>
                  {item.message && <span className="import-item-msg">{item.message}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <footer className="dialog-foot">
          <button className="ghost-btn" onClick={() => setImportOpen(false)} disabled={busy}>
            {doneCount > 0 && doneCount === items.length ? '关闭' : '取消'}
          </button>
          <button
            className="primary-btn"
            onClick={() => void startImport()}
            disabled={busy || items.length === 0 || doneCount === items.length}
          >
            {busy ? '正在导入…' : `开始导入${items.length > doneCount ? `（${items.length - doneCount}）` : ''}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
