import assert from 'node:assert/strict';
import { Scene } from '../src/game/Scene.js';
import { CustomerSystem } from '../src/game/CustomerSystem.js';
import { OrderSystem, DEFAULT_PATIENCE, patienceLevel } from '../src/game/OrderSystem.js';
import { RECIPES } from '../src/game/RecipeSystem.js';

assert.deepEqual(RECIPES.map(r => DEFAULT_PATIENCE[r.id]), [100, 120, 120]);
for (const [ratio, expected] of [[1,'calm'], [.601,'calm'], [.6,'concerned'], [.3,'concerned'], [.299,'impatient'], [0,'impatient']]) assert.equal(patienceLevel(ratio), expected);
assert.throws(() => new OrderSystem({ patience: { salmon_nigiri: 0 } }));
for (const fps of [20, 60, 144]) {
  let index = 0;
  const system = new OrderSystem({ patience: { salmon_nigiri: 55, salmon_maki: 70, cucumber_uramaki: 70 }, random: () => (index++ % 3 + .1) / 3 });
  const clients = [0,1,2].map(i => ({ id: `test-${i}`, state: 'WALKING_TO_COUNTER', arrivalComplete: false }));
  assert.equal(system.createForCustomer(clients[0]), null);
  const orders = clients.map(client => { client.state = 'WAITING'; client.arrivalComplete = true; return system.createForCustomer(client); });
  assert.equal(system.getActiveOrders().length, 3);
  assert.equal(new Set(orders).size, 3); assert.equal(new Set(orders.map(o => o.id)).size, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(orders[i].recipeId, RECIPES[i].id);
    assert.equal(orders[i].recipeName, RECIPES[i].name);
    assert.equal(system.getRequestedRecipe(clients[i].id), RECIPES[i]);
    assert.equal(system.getOrder(orders[i].id), orders[i]);
    assert.equal(system.createForCustomer(clients[i]), orders[i]);
  }
  for (let i = 0; i < 56 * fps; i++) system.update(1 / fps);
  assert.equal(orders[0].state, 'EXPIRED'); assert.equal(orders[0].remainingTime, 0);
  assert.equal(system.getActiveOrder(clients[0].id), null);
  assert.equal(orders[1].state, 'PENDING'); assert.ok(Math.abs(orders[1].remainingTime - 14) < 1e-8);
  assert.equal(system.getActiveOrders().length, 2);
  assert.equal(system.markCompleted(orders[0].id), false);
  system.removeForCustomer(clients[0].id); assert.equal(system.getOrder(orders[0].id), null);
  // Só uma chamada explícita à interface futura pode concluir; sem ação de entrega.
  assert.equal(system.markCompleted(orders[1].id), true);
  system.update(100); assert.equal(orders[1].state, 'COMPLETED'); assert.equal(orders[2].state, 'EXPIRED');
  system.dispose(); assert.equal(system.orders.size, 0);
}

const world = new Scene();
const orders = new OrderSystem({ patience: { salmon_nigiri: 55, salmon_maki: 70, cucumber_uramaki: 70 }, random: () => 0 });
const customers = new CustomerSystem({ scene: world.scene, delivery: world.kitchen.stations.get('delivery'), orderSystem: orders, firstArrival: 5, arrivalInterval: 10, maxCustomers: 3 });
customers.update(31);
assert.equal(orders.getActiveOrders().length, 3);
const first = [...customers.customers.values()][0], firstOrder = orders.getActiveOrder(first.id);
assert.ok(firstOrder && first.arrivalComplete);
assert.ok(firstOrder.remainingTime < 55);
const timers = orders.getActiveOrders().map(o => o.remainingTime);
assert.equal(new Set(timers).size, 3, 'Chegadas em momentos diferentes têm cronômetros independentes');
customers.update(10);
assert.equal(first.state, 'WAITING', 'Não sai após os antigos 25s');
assert.equal(first.patienceLevel, 'concerned');
assert.ok(first.rig.brows.every(b => b.visible));
customers.update(12);
assert.equal(first.patienceLevel, 'impatient');
assert.ok(first.rig.mouth.scale.y > .013);
while (first.state === 'WAITING') customers.update(.05);
assert.equal(firstOrder.state, 'EXPIRED');
assert.equal(first.state, 'LEAVING');
assert.equal(first.slot.customerId, first.id, 'Não libera posição antes de sair');
assert.equal(orders.getActiveOrder(first.id), null);
while (first.state !== 'REMOVED') customers.update(.05);
assert.equal(first.slot.customerId, null);
assert.equal(orders.getOrder(firstOrder.id), null);
customers.update(20);
assert.ok([...customers.customers.values()].some(c => c.id !== first.id));
assert.ok(orders.getActiveOrders().length <= 3);
customers.dispose(); assert.equal(orders.orders.size, 0); world.dispose();
console.log('OK: receitas existentes, IDs exclusivos, chegada concluída, paciência 55/70/70 configurável, cores, expressões, três relógios independentes, fim da espera 25s, expiração, saída, liberação e limpeza.');
