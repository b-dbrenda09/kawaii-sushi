import { BALANCE } from './Balance.js';

export class ScoreSystem {
  constructor(onChange = () => {}) { this.score = 0; this.onChange = onChange; }
  change(amount, message) {
    this.score = Math.max(0, this.score + amount);
    this.onChange({ score: this.score, amount, message });
    return amount;
  }
  complete(order) {
    const ratio = Math.max(0, Math.min(1, order.remainingTime / order.maxPatience));
    return this.change(BALANCE.score.basePoints[order.recipeId] + Math.round(BALANCE.score.maxBonus * ratio), 'Sushi entregue!');
  }
  incorrect() { return this.change(-BALANCE.score.incorrectPenalty, 'Nenhum cliente pediu esse sushi!'); }
  expire() { return this.change(-BALANCE.score.expiredPenalty, 'Pedido expirado'); }
}
