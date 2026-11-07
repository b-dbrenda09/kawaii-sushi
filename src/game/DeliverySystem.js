import { RECIPES } from './RecipeSystem.js';
import { BALANCE } from './Balance.js';

export class DeliverySystem {
  constructor({ station, carrySystem, customerSystem, scoreSystem, sound, isPaused }) {
    Object.assign(this, { station, carrySystem, customerSystem, scoreSystem, sound, isPaused });
    this.cooldown = 0;
    this.previousBehavior = station.behavior;
    station.behavior = this;
  }
  get dish() {
    const dish = this.carrySystem.carriedIngredient;
    return dish && !dish.disposed && dish.kind === 'sushi' && dish.state === 'sushi_ready'
      && dish.completionState === 'READY' && dish.location === 'carried' && dish.ownerId === 'player'
      && RECIPES.some(recipe => recipe.id === dish.recipeId) ? dish : null;
  }
  describe() { return { action: this.dish ? 'Entregar sushi' : 'Traga um sushi pronto', available: Boolean(this.dish) }; }
  update(dt) { this.cooldown = Math.max(0, this.cooldown - dt); }
  interact() {
    if (this.isPaused() || !this.dish || this.cooldown > 0) return { success: false, kind: 'unavailable', message: 'Entrega indisponível.' };
    this.cooldown = BALANCE.score.deliveryCooldown;
    const dish = this.dish;
    const orders = this.customerSystem.orderSystem;
    const order = orders.getActiveOrders().filter(candidate => {
      const customer = this.customerSystem.customers.get(candidate.customerId);
      return candidate.recipeId === dish.recipeId && candidate.remainingTime > 0
        && customer?.state === 'WAITING' && customer.arrivalComplete && !customer.serviceResult;
    }).sort((a, b) => a.remainingTime - b.remainingTime)[0];
    if (!order) {
      this.scoreSystem.incorrect(); this.sound.playError();
      return { success: false, kind: 'incorrect-delivery', message: 'Nenhum cliente pediu esse sushi!' };
    }
    if (!orders.markCompleted(order.id)) return { success: false, kind: 'unavailable' };
    this.carrySystem.carriedIngredient = null;
    dish.dispose();
    const customer = this.customerSystem.customers.get(order.customerId);
    customer.serviceResult = 'COMPLETED'; customer.happyRemaining = 1;
    const points = this.scoreSystem.complete(order);
    this.sound.playComplete();
    return { success: true, kind: 'delivery', message: `Sushi entregue! +${points}` };
  }
  dispose() { if (this.station.behavior === this) this.station.behavior = this.previousBehavior; }
}
