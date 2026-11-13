import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3, Vector3 } from 'three';
import { Scene } from '../src/game/Scene.js';
import { answerDelivery } from './answer-delivery.mjs';
import { CustomerSystem } from '../src/game/CustomerSystem.js';
import { CollisionSystem } from '../src/game/CollisionSystem.js';
import { DifficultySystem } from '../src/game/DifficultySystem.js';
import { Camera } from '../src/game/Camera.js';
import { CarrySystem } from '../src/game/CarrySystem.js';
import { IngredientFactory } from '../src/game/IngredientFactory.js';
import { SushiFactory } from '../src/game/SushiFactory.js';
import { DeliverySystem } from '../src/game/DeliverySystem.js';
import { ScoreSystem } from '../src/game/ScoreSystem.js';
import { RECIPES } from '../src/game/RecipeSystem.js';

for (const path of ['index.html', 'src/main.js', 'src/game/PauseUI.js', 'src/game/ResultsUI.js']) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  assert.ok(/hello kitty sushi/i.test(source), path);
  assert.ok(!/kawaii sushi/i.test(source), path);
}
assert.equal(JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).name, 'hello-kitty-sushi');

for (const mode of ['solo', 'coop']) for (const fps of [20, 60, 144]) {
  const dt = 1 / fps;
  const world = new Scene({ gameMode: mode });
  const stationSnapshot = [...world.kitchen.stations.values()].map(station => station.position.toArray());
  const collision = new CollisionSystem({ bounds: world.collisionBounds });
  world.collisionObstacles.forEach(obstacle => collision.registerObstacle(obstacle));
  const difficulty = new DifficultySystem({ gameMode: mode, elapsed: () => 120, random: () => 0 });
  const system = new CustomerSystem({ scene: world.scene, architecture: world.architecture, collisionSystem: collision,
    delivery: world.kitchen.stations.get('delivery'), difficulty, firstArrival: 10000 });
  const bounds = world.bounds.clone().union(system.bounds);
  // These are the original kitchen/customer framing limits, before adding the door.
  assert.ok(Math.abs(bounds.min.x + 11.1) < 1e-5);
  assert.ok(Math.abs(bounds.max.x - 11.1) < 1e-5);
  assert.ok(Math.abs(bounds.min.z + 9.98) < 1e-5);
  assert.equal(bounds.max.z, 11.25);
  const camera = new Camera(1440, 1000, bounds);
  const projection = camera.camera.projectionMatrix.toArray();
  const obstacles = [];
  world.architecture.traverse(object => {
    if (/^(back-wall|left-wall|right-low-wall)/.test(object.name)) obstacles.push(new Box3().setFromObject(object));
  });
  system.area.traverse(object => {
    if (object.name.startsWith('customer-wall-extension')) obstacles.push(new Box3().setFromObject(object));
  });
  let doorCrossings = 0;
  const priorX = new Map();
  const step = () => {
    system.update(dt);
    const guests = [...system.customers.values()];
    for (const customer of guests) {
      const p = customer.model.position;
      assert.ok(p.z <= system.counterZ - .64, 'Never crosses the service counter');
      for (const box of obstacles) {
        const dx = p.x - Math.max(box.min.x, Math.min(p.x, box.max.x));
        const dz = p.z - Math.max(box.min.z, Math.min(p.z, box.max.z));
        assert.ok(Math.hypot(dx, dz) >= .4, `No wall penetration: ${customer.id}`);
      }
      for (const other of guests) if (other !== customer) assert.ok(p.distanceTo(other.model.position) > .9);
      if (customer.state === 'WALKING_TO_COUNTER') assert.equal(customer.orderId, null);
      const oldX = priorX.get(customer.id);
      if (oldX !== undefined && (oldX - system.route.door.x) * (p.x - system.route.door.x) < 0) {
        assert.ok(Math.abs(p.z - system.route.door.z) < 1e-5);
        assert.ok(system.entrance.openAmount >= .98, 'Cross only after door opens');
        doorCrossings++;
      }
      if (Math.abs(p.x - system.route.door.x) > 1e-6) priorX.set(customer.id, p.x);
    }
  };
  const until = (condition, maxSeconds = 45) => {
    for (let t = 0; !condition() && t < maxSeconds; t += dt) step();
    assert.ok(condition(), 'Customer flow must finish without deadlock');
  };
  const guests = [];
  for (let i = 0; i < difficulty.maxOrders; i++) {
    const guest = system.spawn(); assert.ok(guest); guests.push(guest);
    assert.ok(guest.model.position.x > world.collisionBounds.maxX);
    assert.equal(system.spawn(), null, 'Single transit reservation');
    until(() => Boolean(guest.orderId));
    const order = system.orderSystem.getActiveOrder(guest.id);
    assert.equal(order.remainingTime, order.maxPatience, 'No patience consumed outdoors');
    assert.ok(guest.model.position.distanceTo(guest.slot.position) < 1e-5);
  }
  assert.equal(system.spawn(), null, 'Difficulty capacity enforced');
  const served = guests[0], order = system.orderSystem.getActiveOrder(served.id);
  const ingredients = new IngredientFactory(), sushi = new SushiFactory();
  const carry = new CarrySystem({ player: world.player, stations: world.kitchen.stations, factory: ingredients });
  carry.attach(sushi.create(RECIPES.find(recipe => recipe.id === order.recipeId)));
  const score = new ScoreSystem();
  const delivery = new DeliverySystem({ station: world.kitchen.stations.get('delivery'), carrySystem: carry,
    customerSystem: system, scoreSystem: score, sound: { playError() {}, playComplete() {} }, isPaused: () => false });
  assert.ok(delivery.interact().success); answerDelivery(delivery); assert.ok(score.score > 0);
  until(() => served.state === 'REMOVED');
  assert.ok(served.model.position.distanceTo(system.entry) < 1e-5);
  assert.equal(served.slot.customerId, null);
  for (const pending of system.orderSystem.getActiveOrders()) pending.remainingTime = .01;
  until(() => system.customers.size === 0, 120);
  assert.ok(guests.slice(1).every(guest => guest.serviceResult === 'EXPIRED'));
  assert.ok(guests.every(guest => guest.model.position.distanceTo(system.entry) < 1e-5));
  assert.ok(doorCrossings >= guests.length * 2);
  for (let i = 0; i < fps; i++) step();
  assert.equal(system.entrance.openAmount, 0, 'Door closes after the last guest');
  assert.ok(system.slots.every(slot => slot.customerId === null));
  assert.equal(system.orderSystem.orders.size, 0);
  assert.deepEqual(camera.camera.projectionMatrix.toArray(), projection);
  assert.deepEqual([...world.kitchen.stations.values()].map(station => station.position.toArray()), stationSnapshot);
  assert.equal(world.scene.getObjectByName('entry-screen'), undefined);
  assert.ok(world.scene.getObjectByName('exterior-garden'));
  assert.equal(world.scene.getObjectByName('hello-kitty-sushi-sign').userData.text, 'Hello Kitty Sushi');
  delivery.dispose(); carry.dispose(); sushi.dispose(); ingredients.dispose();
  system.dispose(); system.dispose(); collision.dispose(); world.dispose();
}
console.log('OK: Hello Kitty Sushi, external spawn/exit, real doorway, opening/closing, reserved routes, no walls/overlap, arrival-only patience, delivery/expiry, difficulty capacity, solo/coop at 20/60/144 FPS and unchanged framing.');
