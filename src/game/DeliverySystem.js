import { RECIPES } from './RecipeSystem.js';
import { BALANCE } from './Balance.js';
import { QuestionSystem } from './QuestionSystem.js';

export class DeliverySystem {
  constructor({ station, carrySystem, customerSystem, scoreSystem, sound, isPaused, questionSystem = new QuestionSystem() }) {
    Object.assign(this, { station, carrySystem, customerSystem, scoreSystem, sound, isPaused, questionSystem });
    this.pendingDelivery = null; this.reservationSequence = 0;
    this.cooldown = 0;
    this.previousBehavior = station.behavior;
    station.behavior = this;
  }
  get dish() {
    const dish = this.carrySystem.carriedIngredient;
    return dish && !dish.disposed && dish.kind === 'sushi' && dish.state === 'sushi_ready'
      && dish.completionState === 'READY' && dish.location === 'carried' && dish.ownerId === (this.carrySystem.player.id ?? 'player')
      && RECIPES.some(recipe => recipe.id === dish.recipeId) ? dish : null;
  }
  describe(carrySystem = this.carrySystem) { this.carrySystem = carrySystem; return { action: this.questionSystem.busy ? 'Desafio da entrega em andamento' : this.dish ? 'Entregar sushi' : 'Traga um sushi pronto', available: !this.questionSystem.busy && Boolean(this.dish) && this.cooldown <= 0 }; }
  update(dt) { this.cooldown = Math.max(0, this.cooldown - dt); }
  // Selection is read-only, separate from the commit below, for future delivery activities.
  findMatchingOrder(dish = this.dish) {
    if (!dish) return null;
    return this.customerSystem.orderSystem.getActiveOrders().filter(candidate => {
      const customer = this.customerSystem.customers.get(candidate.customerId);
      return !candidate.deliveryReservation && candidate.recipeId === dish.recipeId && candidate.remainingTime > 0
        && customer?.state === 'WAITING' && customer.arrivalComplete && !customer.serviceResult;
    }).sort((a, b) => a.remainingTime - b.remainingTime)[0] ?? null;
  }
  interact(carrySystem = this.carrySystem) {
    if (this.station.fireState === 'burning') return { success: false, kind: 'burning', message: 'Estação em chamas!' };
    if (carrySystem.carriedTool) return { success: false, kind: 'unavailable', message: 'Deixe o extintor no chão ou no suporte.' };
    this.carrySystem = carrySystem;
    if (this.disposed || this.questionSystem.busy || this.pendingDelivery || this.isPaused() || !this.dish || this.cooldown > 0) return { success: false, kind: 'unavailable', message: 'Entrega indisponível.' };
    this.cooldown = BALANCE.score.deliveryCooldown;
    const dish = this.dish;
    const orders = this.customerSystem.orderSystem;
    const order = this.findMatchingOrder(dish);
    if (!order) {
      this.scoreSystem.incorrect(); this.sound.playError();
      return { success: false, kind: 'incorrect-delivery', message: 'Nenhum cliente pediu esse sushi!' };
    }
    const reservation = `delivery-${++this.reservationSequence}`;
    const transaction = { reservation, carry: carrySystem, dish, order, customer: this.customerSystem.customers.get(order.customerId), settled: false };
    dish.deliveryReservation = reservation; order.deliveryReservation = reservation; this.pendingDelivery = transaction;
    const challenge = this.questionSystem.open({ playerId: carrySystem.player.id ?? 'player', orderId: order.id,
      resolve: correct => this.resolveQuestion(transaction, correct), cancel: () => this.releaseReservation(transaction) });
    if (!challenge) {
      this.releaseReservation(transaction);
      return { success: false, kind: 'unavailable', message: 'Nenhuma pergunta disponível para esta entrega.' };
    }
    return { success: true, kind: 'delivery-question', message: 'Selecione uma alternativa para concluir a entrega.', questionId: challenge.id };
  }

  releaseReservation(transaction) {
    const { dish, order, reservation } = transaction;
    if (dish.deliveryReservation === reservation) delete dish.deliveryReservation;
    if (order.deliveryReservation === reservation) delete order.deliveryReservation;
    if (this.pendingDelivery === transaction) this.pendingDelivery = null;
  }

  resolveQuestion(transaction, correct) {
    const { carry, dish, order, customer, reservation } = transaction;
    const orders = this.customerSystem.orderSystem;
    if (this.disposed || transaction.settled || this.pendingDelivery !== transaction || carry.disposed
      || carry.carriedIngredient !== dish || dish.disposed || dish.kind !== 'sushi' || dish.state !== 'sushi_ready' || dish.completionState !== 'READY'
      || dish.location !== 'carried' || dish.ownerId !== (carry.player.id ?? 'player')
      || orders.getActiveOrder(customer.id) !== order || this.customerSystem.customers.get(customer.id) !== customer
      || customer.state !== 'WAITING' || !customer.arrivalComplete || customer.serviceResult || order.recipeId !== dish.recipeId
      || dish.deliveryReservation !== reservation || order.deliveryReservation !== reservation) return { success: false, kind: 'unavailable', message: 'A entrega não está mais disponível. Nenhum ponto foi concedido.' };
    transaction.settled = true;
    if (!(correct ? orders.markCompleted(order.id, 'question') : orders.markRejected(order.id))) return { success: false, kind: 'unavailable', message: 'Não foi possível finalizar o pedido.' };
    carry.carriedIngredient = null; dish.dispose();
    customer.serviceResult = correct ? 'COMPLETED' : 'REJECTED';
    if (correct) customer.happyRemaining = 1; else customer.sadRemaining = .65;
    const points = this.scoreSystem.answer(order, correct);
    if (correct) this.sound.playComplete(); else this.sound.playError();
    return { success: true, correct, kind: correct ? 'delivery' : 'question-incorrect', points,
      message: correct ? `Resposta correta! Entrega concluída: +${points}` : 'Resposta incorreta! Prato perdido! -50 pontos!',
      orderId: order.id, customerId: customer.id, recipeId: order.recipeId, playerId: carry.player.id ?? 'player' };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.questionSystem.dispose();
    if (this.pendingDelivery) this.releaseReservation(this.pendingDelivery);
    if (this.station.behavior === this) this.station.behavior = this.previousBehavior;
  }
}
