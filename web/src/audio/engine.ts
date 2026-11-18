/**
 * 音频引擎：全局唯一的 <audio> 实例。
 *
 * 为什么只用一个元素：反复 new Audio() 在移动端会争抢音频焦点，
 * 而且旧元素不释放会导致多路流同时播放。切换曲目只改 src。
 */
class AudioEngine {
  readonly audio: HTMLAudioElement;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.volume = 0.8;
  }

  async play(): Promise<void> {
    await this.audio.play();
  }

  pause(): void {
    this.audio.pause();
  }
}

export const engine = new AudioEngine();
