export const MATCH_CONFIG = Object.freeze({ duration: 180, warning: 30, urgent: 10, starThresholds: Object.freeze([1, 3, 5]) });

export class GameTimer {
  constructor(config = MATCH_CONFIG) { this.config = config; this.remaining = config.duration; }
  update(dt) {
    if (Number.isFinite(dt) && dt > 0) this.remaining = Math.max(0, this.remaining - dt);
    if (this.remaining < 1e-8) this.remaining = 0;
    return this.remaining === 0;
  }
  get text() { const seconds = Math.ceil(this.remaining); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
  get level() { return this.remaining <= this.config.urgent ? 'urgent' : this.remaining <= this.config.warning ? 'warning' : 'normal'; }
}
