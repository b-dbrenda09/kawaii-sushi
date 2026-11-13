import { RECIPES } from './RecipeSystem.js';

import { BALANCE } from './Balance.js';
import { CUSTOMER_PROFILES, ORDER_TYPES, SERVICE_CONFIG } from './ServiceConfig.js';
export const ORDER_STATES = Object.freeze({ PENDING: 'PENDING', EXPIRED: 'EXPIRED', COMPLETED: 'COMPLETED', REJECTED: 'REJECTED' });
export const DEFAULT_PATIENCE = BALANCE.patience;
export const patienceLevel = (ratio) => ratio > 0.6 ? 'calm' : ratio >= 0.3 ? 'concerned' : 'impatient';
let nextOrderId = 1;

export class OrderSystem {
  constructor({ patience = {}, random = Math.random, difficulty = null, profiles = CUSTOMER_PROFILES,
    orderTypes = ORDER_TYPES, minimumPatience = SERVICE_CONFIG.minimumPatience } = {}) {
    Object.assign(this, { difficulty, profiles, orderTypes, minimumPatience });
    this.patience = { ...DEFAULT_PATIENCE, ...patience };
    for (const recipe of RECIPES) {
      if (!Number.isFinite(this.patience[recipe.id]) || this.patience[recipe.id] <= 0) throw new Error('Paciência deve ser positiva.');
    }
    this.random = random;
    this.orders = new Map();
    this.byCustomer = new Map();
    this.disposed = false;
  }

  createForCustomer(customer) {
    if (this.canChange?.() === false || this.disposed || customer.state !== 'WAITING' || !customer.arrivalComplete) return null;
    const existing = this.getOrderForCustomer(customer.id);
    if (existing) return existing;
    if (this.difficulty && this.getActiveOrders().length >= this.difficulty.maxOrders) return null;
    const recipe = RECIPES[Math.min(RECIPES.length - 1, Math.max(0, Math.floor(this.random() * RECIPES.length)))];
    const profileId = customer.profile ?? 'common';
    const profile = this.profiles[profileId] ?? this.profiles.common;
    const type = this.difficulty?.pickOrderType() ?? 'normal';
    const rules = this.orderTypes[type];
    const adjusted = this.patience[recipe.id] * profile.patienceMultiplier * rules.patienceMultiplier;
    const maxPatience = this.difficulty ? Math.max(this.minimumPatience, adjusted) : adjusted;
    const order = { id: `order-${nextOrderId++}`, customerId: customer.id, recipeId: recipe.id,
      recipeName: recipe.name, maxPatience, remainingTime: maxPatience, state: ORDER_STATES.PENDING,
      type, profile: profileId, profileLabel: profile.label,
      rewards: Object.freeze({ completionBonus: rules.completionBonus, speedBonus: rules.speedBonus,
        quickBonus: profile.quickBonus, quickThreshold: profile.quickThreshold }) };
    this.orders.set(order.id, order); this.byCustomer.set(customer.id, order.id);
    customer.orderId = order.id; customer.requestedRecipe = recipe.id; customer.patienceTime = maxPatience;
    this.onCreated?.(order);
    return order;
  }

  getOrder(id) { return this.orders.get(id) ?? null; }
  getOrderForCustomer(customerId) { return this.getOrder(this.byCustomer.get(customerId)); }
  getActiveOrder(customerId) {
    const order = this.getOrderForCustomer(customerId);
    return order?.state === ORDER_STATES.PENDING ? order : null;
  }
  getRequestedRecipe(customerId) {
    const order = this.getActiveOrder(customerId);
    return order ? RECIPES.find((recipe) => recipe.id === order.recipeId) : null;
  }
  getActiveOrders() { return [...this.orders.values()].filter((order) => order.state === ORDER_STATES.PENDING); }

  update(deltaTime) {
    if (this.canChange?.() === false || this.disposed || !Number.isFinite(deltaTime) || deltaTime <= 0) return;
    for (const order of this.orders.values()) {
      if (order.state !== ORDER_STATES.PENDING) continue;
      order.remainingTime = Math.max(0, order.remainingTime - deltaTime);
      if (order.remainingTime < 1e-8) { order.remainingTime = 0; order.state = ORDER_STATES.EXPIRED; this.onExpired?.(order); }
    }
  }

  // Apenas pedidos pendentes com paciência podem ser concluídos.
  markCompleted(id, operation) {
    if (this.canChange?.(operation) === false) return false;
    const order = this.getOrder(id);
    if (!order || order.state !== ORDER_STATES.PENDING || order.remainingTime <= 0) return false;
    order.state = ORDER_STATES.COMPLETED;
    this.onCompleted?.(order);
    return true;
  }

  markRejected(id, operation = 'question') {
    if (this.canChange?.(operation) === false) return false;
    const order = this.getOrder(id);
    if (!order || order.state !== ORDER_STATES.PENDING || order.remainingTime <= 0) return false;
    order.state = ORDER_STATES.REJECTED; this.onRejected?.(order); return true;
  }

  removeForCustomer(customerId) {
    const id = this.byCustomer.get(customerId);
    if (id) this.orders.delete(id);
    this.byCustomer.delete(customerId);
  }

  dispose() { this.orders.clear(); this.byCustomer.clear(); this.disposed = true; }
}
