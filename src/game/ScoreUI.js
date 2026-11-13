export class ScoreUI {
  constructor(container) {
    this.root = document.createElement('div'); this.root.className = 'score-hud';
    this.label = document.createElement('div'); this.label.textContent = '⭐ Pontos: 0';
    this.feedback = document.createElement('div'); this.feedback.className = 'score-feedback';
    this.feedback.setAttribute('role', 'status');
    this.root.append(this.label, this.feedback); container.append(this.root);
    this.remaining = 0;
  }
  render({ score, amount, message }) {
    this.label.textContent = `⭐ Pontos: ${score}`;
    this.feedback.textContent = `${message} ${amount > 0 ? '+' : ''}${amount}`;
    this.root.dataset.effect = amount > 0 ? 'success' : 'error';
    this.animation?.cancel();
    if (amount > 0 && !document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.animation = this.feedback.animate?.([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], 220);
    }
    this.remaining = 2;
  }
  update(dt) {
    this.remaining = Math.max(0, this.remaining - dt);
    if (!this.remaining) { this.feedback.textContent = ''; delete this.root.dataset.effect; }
  }
  dispose() { this.animation?.cancel(); this.root.remove(); }
}
