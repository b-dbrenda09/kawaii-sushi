import { BALANCE } from './Balance.js';
import { orderBonuses } from './ServiceConfig.js';
import { QUESTION_REWARDS } from './QuestionBank.js';

export class ScoreSystem {
  constructor(onChange = () => {}) { this.score = 0; this.onChange = onChange; this.settledOrders = new Set(); }
  change(amount, message, operation) {
    if (this.canChange?.(operation) === false) return 0;
    this.score += amount;
    this.onChange({ score: this.score, amount, message });
    return amount;
  }
  complete(order, { questionBonus = 0, operation } = {}) {
    if (this.canChange?.(operation) === false || order.state === 'EXPIRED'
      || (order.id != null && (order.state !== 'COMPLETED' || order.remainingTime <= 0 || this.settledOrders.has(order.id)))) return 0;
    const ratio = Math.max(0, Math.min(1, order.remainingTime / order.maxPatience));
    const bonus = orderBonuses(order).total;
    if (order.id != null) this.settledOrders.add(order.id);
    return this.change(BALANCE.score.basePoints[order.recipeId] + Math.round(BALANCE.score.maxBonus * ratio) + bonus + questionBonus,
      questionBonus ? 'Resposta correta! +50 pontos extras!' : bonus ? `Sushi entregue! Bônus especial +${bonus}.` : 'Sushi entregue!', operation);
  }
  answer(order, correct) {
    if (correct) return this.complete(order, { questionBonus: QUESTION_REWARDS.correctBonus, operation: 'question' });
    if (this.canChange?.('question') === false || order.state !== 'REJECTED' || this.settledOrders.has(order.id)) return 0;
    this.settledOrders.add(order.id);
    return this.change(-QUESTION_REWARDS.incorrectPenalty, 'Resposta incorreta! Prato perdido!', 'question');
  }
  incorrect() { if (this.canChange?.() === false) return 0; this.onIncorrect?.(); return this.change(-BALANCE.score.incorrectPenalty, 'Nenhum cliente pediu esse sushi!'); }
  expire(order = null) {
    if (this.canChange?.() === false || (order && (order.state !== 'EXPIRED' || this.settledOrders.has(order.id)))) return 0;
    if (order) this.settledOrders.add(order.id);
    return this.change(-BALANCE.score.expiredPenalty, 'Pedido expirado');
  }
}
