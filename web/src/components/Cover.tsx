import { useState } from 'react';
import { api } from '../api.ts';
import { gradientFor, initialsOf } from '../lib/format.ts';

interface CoverProps {
  /** 用来取封面的曲目 id；没有则只显示占位图 */
  trackId?: string | null;
  hasCover?: boolean;
  /** 占位图的种子，一般传专辑名或曲目名 */
  seed: string;
  /** 占位图上显示的字 */
  label?: string;
  size?: number;
  className?: string;
  /** 用于 grid 布局，宽度 100% */
  fluid?: boolean;
  alt?: string;
}

/**
 * 封面组件。三级回退：内嵌/目录封面 → 渐变占位 + 首字。
 * 图片加载失败（后端也没找到）时同样退到占位图，不会出现破图。
 */
export function Cover({
  trackId,
  hasCover = false,
  seed,
  label,
  size = 44,
  className = '',
  fluid = false,
  alt = '',
}: CoverProps) {
  // 记「哪一首的封面加载失败」而不是一个布尔值：
  // 播放条切歌时会复用同一个组件实例，布尔值会让一次失败永久传染给后面所有曲目
  const [failedId, setFailedId] = useState<string | null>(null);
  const showImage = Boolean(trackId) && hasCover && failedId !== trackId;

  const style = fluid
    ? ({ width: '100%', aspectRatio: '1 / 1' } as const)
    : ({ width: size, height: size } as const);

  return (
    <div
      className={`cover ${className}`}
      style={{ ...style, background: showImage ? undefined : gradientFor(seed || 'music') }}
      aria-label={alt || undefined}
    >
      {showImage ? (
        <img
          src={api.coverUrl(trackId!)}
          alt={alt}
          loading="lazy"
          draggable={false}
          onError={() => setFailedId(trackId ?? null)}
        />
      ) : (
        <span className="cover-fallback" style={{ fontSize: Math.max(12, (fluid ? 28 : size) * 0.36) }}>
          {initialsOf(label ?? seed)}
        </span>
      )}
    </div>
  );
}
