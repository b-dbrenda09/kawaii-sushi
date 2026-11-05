export class SoundSystem {
  constructor({ target = window, volume = 0.16, enabled = true } = {}) {
    this.target = target;
    this.volume = volume;
    this.enabled = enabled;
    this.context = null;
    this.nodes = new Set();
    this.disposed = false;
    this.unlock = () => {
      if (!this.enabled || this.disposed) return;
      const AudioContext = target.AudioContext ?? target.webkitAudioContext;
      if (!AudioContext) return;
      try {
        this.context ??= new AudioContext();
        this.context.resume().catch(() => {});
      } catch { /* Áudio opcional: o jogo continua quando o navegador não oferece áudio. */ }
    };
    target.addEventListener('keydown', this.unlock);
    target.addEventListener('pointerdown', this.unlock);
  }

  tone(frequency, duration, type = 'sine', offset = 0, level = 1) {
    const context = this.context;
    if (!this.enabled || this.disposed || context?.state !== 'running') return false;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    const time = context.currentTime + offset;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.65, time + duration);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(this.volume * level, time + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain); gain.connect(context.destination);
    this.nodes.add(oscillator); this.nodes.add(gain);
    oscillator.onended = () => {
      oscillator.disconnect(); gain.disconnect(); this.nodes.delete(oscillator); this.nodes.delete(gain);
    };
    oscillator.start(time); oscillator.stop(time + duration + 0.01);
    return true;
  }

  playChop() { return this.tone(230, 0.055, 'triangle'); }
  playComplete() { this.tone(660, 0.14, 'sine', 0, 0.5); this.tone(880, 0.18, 'sine', 0.08, 0.4); }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.target.removeEventListener('keydown', this.unlock);
    this.target.removeEventListener('pointerdown', this.unlock);
    this.nodes.forEach((node) => { try { node.stop?.(); } catch {} node.disconnect(); });
    this.nodes.clear();
    this.context?.close().catch(() => {});
  }
}
