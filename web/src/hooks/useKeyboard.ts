import { useEffect } from 'react';
import { usePlayer } from '../store/playerStore.ts';

/**
 * 全局快捷键。
 * 输入框聚焦时不拦截，避免在搜索框里打字触发播放。
 */
export function useKeyboard(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

      const state = usePlayer.getState();

      if (e.key === 'Escape') {
        if (state.query) {
          state.clearQuery();
          (document.activeElement as HTMLElement | null)?.blur();
        }
        return;
      }

      if (typing) return;

      const mod = e.ctrlKey || e.metaKey;
      if (mod) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          state.togglePlay();
          break;

        case 'ArrowRight':
          e.preventDefault();
          state.seek(state.currentTime + (e.shiftKey ? 30 : 5));
          break;

        case 'ArrowLeft':
          e.preventDefault();
          state.seek(Math.max(0, state.currentTime - (e.shiftKey ? 30 : 5)));
          break;

        case 'ArrowUp':
          e.preventDefault();
          state.setVolume(state.volume + 0.05);
          break;

        case 'ArrowDown':
          e.preventDefault();
          state.setVolume(state.volume - 0.05);
          break;

        case 'n':
        case 'N':
          state.next();
          break;

        case 'p':
        case 'P':
          state.prev();
          break;

        case 'l':
        case 'L':
          state.togglePanel('lyrics');
          break;

        case 'f':
        case 'F':
          if (state.currentTrack) state.toggleFavorite(state.currentTrack.id);
          break;

        case 's':
        case 'S':
        // 随机和循环合并成一个模式按钮后，s / r 都切同一个模式，
        // 原来习惯按哪个都不会落空
        case 'r':
        case 'R':
          state.cyclePlayMode();
          break;

        case '/': {
          e.preventDefault();
          const input = document.querySelector<HTMLInputElement>('.search-input');
          input?.focus();
          input?.select();
          break;
        }

        case 'm':
        case 'M':
          state.toggleMute();
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
