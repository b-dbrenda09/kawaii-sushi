import { MATCH_CONFIG } from './GameTimer.js';

export class GameResults {
  constructor() { this.generated = 0; this.delivered = 0; this.expired = 0; this.incorrect = 0; this.streak = 0; this.bestStreak = 0; this.seen = new Set(); this.final = null; }
  record(kind, order) {
    if (this.final) return;
    if (order) { const key = `${kind}:${order.id}`; if (this.seen.has(key)) return; this.seen.add(key); }
    this[kind]++;
    if (kind === 'delivered') { this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak); }
    else if (kind === 'expired' || kind === 'incorrect') this.streak = 0;
  }
  finish(score) {
    return this.final ??= Object.freeze({ score, delivered: this.delivered, expired: this.expired, incorrect: this.incorrect,
      generated: this.generated, bestStreak: this.bestStreak, stars: MATCH_CONFIG.starThresholds.filter(limit => this.delivered >= limit).length });
  }
}
