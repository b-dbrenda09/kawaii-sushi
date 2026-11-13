import assert from 'node:assert/strict';
import { Scene } from '../src/game/Scene.js';
import { answerDelivery } from './answer-delivery.mjs';
import { CollisionSystem } from '../src/game/CollisionSystem.js';
import { IngredientFactory } from '../src/game/IngredientFactory.js';
import { SushiFactory } from '../src/game/SushiFactory.js';
import { CarrySystem } from '../src/game/CarrySystem.js';
import { CustomerSystem } from '../src/game/CustomerSystem.js';
import { InteractionSystem } from '../src/game/InteractionSystem.js';
import { DeliverySystem } from '../src/game/DeliverySystem.js';
import { ScoreSystem } from '../src/game/ScoreSystem.js';
import { RECIPES } from '../src/game/RecipeSystem.js';

const world = new Scene(), collision = new CollisionSystem({ bounds: world.collisionBounds });
world.collisionObstacles.forEach(o => collision.registerObstacle(o));
const factory = new IngredientFactory(), sushi = new SushiFactory();
const carry = new CarrySystem({ player: world.player, stations: world.kitchen.stations, factory });
const station = world.kitchen.stations.get('delivery');
const customers = new CustomerSystem({ scene: world.scene, delivery: station, firstArrival: 9999, maxCustomers: 3 });
const score = new ScoreSystem(); customers.orderSystem.onExpired = () => score.expire();
let paused = false, successes = 0, errors = 0;
const delivery = new DeliverySystem({ station, carrySystem: carry, customerSystem: customers, scoreSystem: score,
  sound: { playComplete() { successes++; }, playError() { errors++; } }, isPaused: () => paused });
const interaction = new InteractionSystem({ stations: [station], collisionSystem: collision, carrySystem: carry });
const advance = seconds => { for (let t = 0; t < seconds; t += .05) customers.update(.05); };
const addCustomer = () => { const c = customers.spawn(); assert.ok(c); for (let t = 0; !c.orderId && t < 40; t += .05) customers.update(.05); assert.ok(c.arrivalComplete); return c; };
try {
  customers.orderSystem.random = () => 0;
  const a = addCustomer(), b = addCustomer();
  const oa = customers.orderSystem.getActiveOrder(a.id), ob = customers.orderSystem.getActiveOrder(b.id);
  oa.remainingTime = 80; ob.remainingTime = 25;
  carry.attach(sushi.create(RECIPES[0]));
  world.player.group.position.copy(station.getApproachPosition());
  interaction.update(.01, world.player);
  assert.equal(interaction.active.action, 'Entregar sushi');
  const attempt = () => interaction.update(.01, world.player, { interactPressed: true });
  paused = true; assert.equal(attempt().success, false); assert.equal(score.score, 0); paused = false;
  world.player.group.position.z += 3; assert.equal(attempt(), null);
  world.player.group.position.copy(station.getApproachPosition());
  const pos = world.player.group.position;
  collision.registerObstacle({ id: 'test-wall', position: { x: pos.x, z: pos.z - .3 }, width: 2, depth: .1 });
  assert.equal(attempt(), null); collision.removeObstacle('test-wall');
  const dish = carry.carriedIngredient;
  assert.equal(attempt().success, true); assert.equal(ob.state, 'PENDING'); assert.equal(score.score, 0);
  answerDelivery(delivery); assert.equal(ob.state, 'COMPLETED'); assert.equal(oa.state, 'PENDING');
  assert.equal(score.score, 163); assert.equal(carry.carriedIngredient, null); assert.equal(dish.disposed, true);
  assert.equal(b.serviceResult, 'COMPLETED'); assert.equal(b.slot.customerId, b.id);
  const frozen = ob.remainingTime; advance(.5); assert.equal(ob.remainingTime, frozen); assert.equal(b.animation, 'HAPPY');
  advance(1); assert.equal(b.state, 'LEAVING'); assert.equal(b.slot.customerId, b.id);
  advance(30); assert.equal(b.state, 'REMOVED'); assert.equal(b.slot.customerId, null);
  delivery.update(1); carry.attach(sushi.create(RECIPES[1]));
  const wrong = carry.carriedIngredient;
  assert.equal(attempt().kind, 'incorrect-delivery'); assert.equal(score.score, 153);
  for (let i = 0; i < 10; i++) attempt();
  assert.equal(score.score, 153); assert.equal(errors, 1); assert.equal(carry.carriedIngredient, wrong);
  assert.equal(oa.state, 'PENDING');
  oa.remainingTime = .01; customers.update(.05); assert.equal(score.score, 123);
  customers.update(.1); assert.equal(score.score, 123);
  carry.discard(); delivery.update(1); carry.attach(sushi.create(RECIPES[0]));
  assert.equal(attempt().kind, 'incorrect-delivery'); assert.equal(oa.state, 'EXPIRED');
  for (const recipe of RECIPES) {
    const expected = recipe.id === 'salmon_nigiri' ? 100 : 120;
    const check = new ScoreSystem();
    check.complete({ recipeId: recipe.id, remainingTime: 100, maxPatience: 100 }); assert.equal(check.score, expected + 50);
    check.complete({ recipeId: recipe.id, remainingTime: 0, maxPatience: 100 }); assert.equal(check.score, expected * 2 + 50);
  }
  const beforePenalty = score.score;
  score.change(-9999); score.expire(); score.incorrect(); assert.equal(score.score, beforePenalty - 9999 - 30 - 10);
  assert.equal(customers.orderSystem.markCompleted(ob.id), false); assert.equal(successes, 1);
  console.log('OK: entrega por E, alcance/obstáculo, pausa, receita por dados, menor paciência, consumo único, felicidade/saída/reserva, erro com cooldown, expiração única, bônus de todas as receitas e pontuação negativa.');
} finally {
  interaction.dispose(); delivery.dispose(); customers.dispose(); carry.dispose(); sushi.dispose(); factory.dispose(); collision.dispose(); world.dispose();
}
