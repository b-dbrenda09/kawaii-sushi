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

  playError() { this.tone(330, 0.12, 'sine', 0, 0.35); this.tone(260, 0.14, 'sine', 0.09, 0.25); }
  playChop() { return this.tone(290, 0.055, 'triangle', 0, 0.32); }
  playDash() { this.tone(420, 0.085, 'sine', 0, 0.22); }
  playExpired() { this.tone(310, 0.16, 'sine', 0, 0.25); }
  playRiceReady() { this.tone(740, 0.16, 'sine', 0, 0.34); }
  playFireAlert() { this.tone(880, .2, 'triangle', 0, .45); this.tone(660, .23, 'triangle', .22, .4); }
  playFireOut() { this.tone(620, .12, 'sine', 0, .25); this.tone(830, .16, 'sine', .08, .2); }
  playExtinguisher() {
    const ctx = this.context;
    if (!this.enabled || this.disposed || ctx?.state !== 'running' || this.spraySource) return;
    this.sprayBuffer ??= ctx.createBuffer(1, Math.floor(ctx.sampleRate * .4), ctx.sampleRate);
    if (!this.sprayBufferReady) {
      const data = this.sprayBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.sprayBufferReady = true;
    }
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = this.sprayBuffer; source.loop = true; filter.type = 'lowpass'; filter.frequency.value = 1700;
    gain.gain.value = this.volume * .22;
    source.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    for (const node of [source, filter, gain]) this.nodes.add(node);
    this.spraySource = source;
    source.onended = () => {
      for (const node of [source, filter, gain]) { node.disconnect(); this.nodes.delete(node); }
    };
    source.start();
  }
  stopExtinguisher() {
    if (!this.spraySource) return;
    try { this.spraySource.stop(); } catch { /* Already stopped on teardown. */ }
    this.spraySource = null;
  }

  playInteraction(kind) {
    if (['pickup', 'retrieve', 'swap', 'take-sushi', 'take-cooked-rice', 'take-cut-ingredient'].includes(kind)) {
      this.tone(590, 0.09, 'sine', 0, 0.28);
    } else if (['place', 'place-sushi', 'add-ingredient', 'load-rice', 'load-cutting'].includes(kind)) {
      this.tone(360, 0.07, 'sine', 0, 0.25);
    } else if (kind === 'finish-sushi') this.playComplete();
  }
  playComplete() { this.tone(660, 0.14, 'sine', 0, 0.5); this.tone(880, 0.18, 'sine', 0.08, 0.4); }

  dispose() {
    if (this.disposed) return;
    this.stopExtinguisher();
    this.disposed = true;
    this.target.removeEventListener('keydown', this.unlock);
    this.target.removeEventListener('pointerdown', this.unlock);
    this.nodes.forEach((node) => { try { node.stop?.(); } catch {} node.disconnect(); });
    this.nodes.clear();
    this.context?.close().catch(() => {});
  }
}
