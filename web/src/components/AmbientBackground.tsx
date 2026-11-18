import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { usePlayer } from '../store/playerStore.ts';

/**
 * 氛围背景：把当前封面的模糊大图铺满 + 渐变压暗。
 * 用双层交叉淡入，切歌时不会出现"闪白"。
 */
export function AmbientBackground() {
  const track = usePlayer((s) => s.currentTrack);
  const [layerA, setLayerA] = useState<string | null>(null);
  const [layerB, setLayerB] = useState<string | null>(null);
  const [useA, setUseA] = useState(true);

  const url = track && track.hasCover ? api.coverUrl(track.id) : null;

  useEffect(() => {
    if (url === (useA ? layerA : layerB)) return;
    if (useA) {
      setLayerB(url);
      setUseA(false);
    } else {
      setLayerA(url);
      setUseA(true);
    }
    // 只在封面变化时切换
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return (
    <div className="ambient" aria-hidden>
      <div className={`ambient-layer ${useA ? 'is-visible' : ''}`} style={layerA ? { backgroundImage: `url(${layerA})` } : undefined} />
      <div className={`ambient-layer ${useA ? '' : 'is-visible'}`} style={layerB ? { backgroundImage: `url(${layerB})` } : undefined} />
      <div className="ambient-veil" />
    </div>
  );
}
