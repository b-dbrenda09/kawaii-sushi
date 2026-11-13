import assert from 'node:assert/strict';
import { Scene } from '../src/game/Scene.js';
import { answerDelivery } from './answer-delivery.mjs';
import { CustomerFactory, CUSTOMER_TYPES } from '../src/game/CustomerFactory.js';
import { Customer } from '../src/game/Customer.js';
import { CustomerSystem } from '../src/game/CustomerSystem.js';
import { OrderSystem } from '../src/game/OrderSystem.js';
import { ScoreSystem } from '../src/game/ScoreSystem.js';
import { DifficultySystem } from '../src/game/DifficultySystem.js';
import { SERVICE_CONFIG, CUSTOMER_PROFILES, ORDER_TYPES, orderBonuses, weightedChoice } from '../src/game/ServiceConfig.js';
import { GameTimer } from '../src/game/GameTimer.js';
import { CarrySystem } from '../src/game/CarrySystem.js';
import { IngredientFactory } from '../src/game/IngredientFactory.js';
import { SushiFactory } from '../src/game/SushiFactory.js';
import { DeliverySystem } from '../src/game/DeliverySystem.js';
import { RECIPES } from '../src/game/RecipeSystem.js';
import { Vector3 } from 'three';

const factory = new CustomerFactory();
for (const type of ['rabbit', 'bear', 'cat', 'dog', 'panda']) {
  assert.ok(CUSTOMER_TYPES.includes(type));
  const customer = new Customer({ type, factory, slot: { position: new Vector3() }, entry: new Vector3() });
  customer.state = 'WAITING';
  customer.update(.3);
  assert.notEqual(customer.rig.head.rotation.z, 0);
  assert.ok(customer.rig.ears.length === 2);
  customer.happyRemaining = 1; customer.serviceResult = 'COMPLETED'; customer.update(.1);
  assert.equal(customer.rig.satisfaction.visible, true);
  customer.update(1); assert.equal(customer.rig.satisfaction.visible, false);
  customer.serviceResult = 'EXPIRED'; customer.sadRemaining = .65; customer.update(.1);
  assert.equal(customer.animation, 'SAD');
  customer.dispose();
}
factory.dispose();

const ids = new Set();
for (const profile of Object.keys(CUSTOMER_PROFILES)) for (const type of Object.keys(ORDER_TYPES)) {
  const difficulty = { maxOrders: 4, pickOrderType: () => type };
  const orders = new OrderSystem({ difficulty, random: () => 0 });
  const client = { id: `${profile}-${type}`, profile, state: 'WAITING', arrivalComplete: true };
  const order = orders.createForCustomer(client);
  assert.ok(!ids.has(order.id)); ids.add(order.id);
  assert.equal(orders.createForCustomer(client), order);
  assert.equal(order.maxPatience, Math.max(70, 100 * CUSTOMER_PROFILES[profile].patienceMultiplier * ORDER_TYPES[type].patienceMultiplier));
  assert.equal(order.type, type);
  const score = new ScoreSystem();
  assert.equal(score.complete(order), 0, 'A pending order cannot be paid');
  assert.equal(orders.markCompleted(order.id), true);
  const expectedExtra = ORDER_TYPES[type].completionBonus + ORDER_TYPES[type].speedBonus + CUSTOMER_PROFILES[profile].quickBonus;
  assert.equal(score.complete(order), 150 + expectedExtra);
  assert.equal(score.complete({ ...order }), 0, 'Copies with the same order ID cannot be paid twice');
  order.state = 'EXPIRED';
  assert.equal(score.expire(order), 0, 'Settled orders cannot incur another outcome');
  orders.dispose();
}
const hurry = { state: 'PENDING', maxPatience: 100, remainingTime: 50,
  rewards: { quickBonus: 30, quickThreshold: .55, speedBonus: 40, completionBonus: 35 } };
assert.deepEqual(orderBonuses(hurry), { urgent: 35, speed: 20, personality: 0, total: 55 });
hurry.state = 'EXPIRED'; assert.equal(orderBonuses(hurry).total, 0);
const expired = new OrderSystem({ random: () => 0 }), score = new ScoreSystem();
score.change(100);
const expiredOrder = expired.createForCustomer({ id: 'expired', state: 'WAITING', arrivalComplete: true });
let expiryEvents = 0;
expired.onExpired = order => { expiryEvents++; score.expire(order); };
expired.update(1000); expired.update(1000); score.expire(expiredOrder);
assert.equal(expiryEvents, 1); assert.equal(score.score, 70); assert.equal(score.complete(expiredOrder), 0);
expired.dispose();

// Two actual inventories competing for one urgent order: one commit and one consumed plate.
const deliveryWorld = new Scene({ gameMode: 'coop' });
let sampleIndex = 0;
const deliveryDifficulty = new DifficultySystem({ elapsed: () => 120, random: () => sampleIndex++ % 2 === 0 ? .95 : .6 });
const clients = new CustomerSystem({ scene: deliveryWorld.scene, delivery: deliveryWorld.kitchen.stations.get('delivery'), difficulty: deliveryDifficulty });
clients.orderSystem.random = () => 0;
const servedCustomer = clients.spawn();
for (let t = 0; !servedCustomer.orderId && t < 40; t += .05) clients.update(.05);
const servedOrder = clients.orderSystem.getActiveOrder(servedCustomer.id);
assert.equal(servedOrder.type, 'urgent'); assert.equal(servedOrder.profile, 'hurried');
const ingredientFactory = new IngredientFactory(), sushi = new SushiFactory();
const inventories = deliveryWorld.players.map(player => new CarrySystem({ player, stations: deliveryWorld.kitchen.stations, factory: ingredientFactory }));
inventories.forEach(inventory => inventory.attach(sushi.create(RECIPES[0])));
const deliveryScore = new ScoreSystem();
const delivery = new DeliverySystem({ station: deliveryWorld.kitchen.stations.get('delivery'), carrySystem: inventories[0],
  customerSystem: clients, scoreSystem: deliveryScore, sound: { playError() {}, playComplete() {} }, isPaused: () => false });
const beforeSelection = servedOrder.remainingTime;
assert.equal(delivery.findMatchingOrder(), servedOrder);
assert.equal(servedOrder.state, 'PENDING'); assert.equal(servedOrder.remainingTime, beforeSelection);
const expectedPoints = 100 + Math.round(50 * servedOrder.remainingTime / servedOrder.maxPatience) + orderBonuses(servedOrder).total + 50;
assert.ok(delivery.interact(inventories[0]).success);
const delivered = answerDelivery(delivery);
assert.equal(delivered.points, expectedPoints); assert.equal(delivered.orderId, servedOrder.id);
assert.equal(delivered.playerId, deliveryWorld.players[0].id);
assert.equal(inventories[0].carriedIngredient, null);
assert.equal(delivery.interact(inventories[1]).success, false);
assert.equal(deliveryScore.score, expectedPoints);
assert.ok(inventories[1].carriedIngredient);
clients.update(.05); assert.equal(servedCustomer.rig.satisfaction.visible, true);
delivery.dispose(); clients.dispose(); inventories.forEach(inventory => inventory.dispose()); sushi.dispose(); ingredientFactory.dispose(); deliveryWorld.dispose();

for (const mode of ['solo', 'coop']) {
  const timer = new GameTimer();
  const difficulty = new DifficultySystem({ gameMode: mode, elapsed: () => 180 - timer.remaining, random: () => 0 });
  for (const [elapsed, phase, cap] of [[0, 0, 2], [59.99, 0, 2], [60, 1, 3], [119.99, 1, 3], [120, 2, 4], [180, 2, 4]]) {
    timer.remaining = 180 - elapsed;
    assert.equal(difficulty.index, phase); assert.equal(difficulty.maxOrders, cap);
  }
  timer.remaining = 180;
  const world = new Scene({ gameMode: mode });
  const stationsBefore = [...world.kitchen.stations.values()].map(station => station.model.matrix.toArray());
  const customers = new CustomerSystem({ scene: world.scene, delivery: world.kitchen.stations.get('delivery'), difficulty });
  const peaks = [0, 0, 0];
  const allIDs = new Set();
  for (let frame = 0; frame < 180 * 20; frame++) {
    timer.update(.05); customers.update(.05);
    const active = customers.orderSystem.getActiveOrders();
    assert.ok(active.length <= difficulty.maxOrders);
    assert.ok(customers.customers.size <= difficulty.maxOrders);
    peaks[difficulty.index] = Math.max(peaks[difficulty.index], active.length);
    assert.equal(new Set(active.map(order => order.id)).size, active.length);
    for (const customer of customers.customers.values()) {
      allIDs.add(customer.id);
      assert.ok(customer.model.position.z < customers.counterZ);
      for (const other of customers.customers.values()) if (other !== customer) {
        assert.ok(customer.model.position.distanceTo(other.model.position) > .9);
      }
    }
  }
  assert.deepEqual(peaks, [2, 3, 4]);
  assert.ok(allIDs.size >= 4);
  assert.equal(timer.remaining, 0);
  assert.deepEqual([...world.kitchen.stations.values()].map(station => station.model.matrix.toArray()), stationsBefore);
  customers.dispose(); world.dispose();
  timer.remaining = 180; assert.equal(difficulty.index, 0); assert.equal(difficulty.maxOrders, 2);
}
for (const mode of ['solo', 'coop']) for (const stage of SERVICE_CONFIG[mode]) {
  for (const weights of [stage.orders, stage.profiles]) {
    assert.ok(Math.abs(Object.values(weights).reduce((a, b) => a + b, 0) - 1) < 1e-9);
    // Every configured variant has a nonempty selection interval.
    let preceding = 0;
    for (const [key, weight] of Object.entries(weights)) {
      assert.equal(weightedChoice(weights, () => preceding + weight / 2), key); preceding += weight;
    }
  }
}
assert.equal(RECIPES.length, 3);
console.log('OK: five finished animal rigs, waiting/happy/sad, all profile/order combinations, unique IDs, exact bonuses, once-only scoring/expiry, solo/coop 0/60/120s phases, 2/3/4 actual orders, spacing, unchanged kitchen, 180s and reset.');
