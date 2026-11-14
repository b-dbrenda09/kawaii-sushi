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
import { BALANCE } from '../src/game/Balance.js';
import { Game } from '../src/game/Game.js';
import { SessionState } from '../src/game/SessionState.js';
import { QuestionSystem } from '../src/game/QuestionSystem.js';

for (const path of ['index.html', 'src/main.js', 'src/game/PauseUI.js', 'src/game/ResultsUI.js']) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  assert.ok(/hello kitty sushi/i.test(source), path);
  assert.ok(!/kawaii sushi/i.test(source), path);
}
assert.equal(JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).name, 'hello-kitty-sushi');

let fastestArrival = Infinity, slowestArrival = 0;
for (const mode of ['solo', 'coop']) for (const fps of [10, 20, 60, 144]) {
  const dt = 1 / fps;
  const world = new Scene({ gameMode: mode });
  const stationSnapshot = [...world.kitchen.stations.values()].map(station => station.position.toArray());
  const collision = new CollisionSystem({ bounds: world.collisionBounds });
  world.collisionObstacles.forEach(obstacle => collision.registerObstacle(obstacle));
  const difficulty = new DifficultySystem({ gameMode: mode, elapsed: () => 120, random: () => 0 });
  const system = new CustomerSystem({ scene: world.scene, architecture: world.architecture, collisionSystem: collision,
    delivery: world.kitchen.stations.get('delivery'), difficulty, firstArrival: 10000 });
  const arrivedAt = new Map();
  system.orderSystem.onCreated = order => {
    const customer = system.customers.get(order.customerId);
    assert.ok(customer.arrivalComplete, 'Order is created immediately at the final service pose');
    assert.equal(order.remainingTime, order.maxPatience, 'No patience consumed before arrival');
    arrivedAt.set(customer.id, system.clock);
  };
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
    const previousPositions = new Map([...system.customers.values()].map(customer => [customer.id, customer.model.position.clone()]));
    const previousWaypoints = new Map([...system.customers.values()].map(customer => [customer.id, customer.waypoint]));
    system.update(dt);
    const guests = [...system.customers.values()];
    for (const customer of guests) {
      const p = customer.model.position;
      const movement = p.clone().sub(previousPositions.get(customer.id) ?? p);
      assert.ok(movement.length() <= customer.speed * dt + 1e-6, 'No teleports or excessive steps');
      if (movement.lengthSq() > 1e-10 && previousWaypoints.get(customer.id) === customer.waypoint) {
        const facing = Math.atan2(movement.x, movement.z) - customer.model.rotation.y;
        assert.ok(Math.abs(Math.atan2(Math.sin(facing), Math.cos(facing))) < .31, 'Faces the actual walking direction');
      }
      assert.ok(p.z <= system.counterZ - .64, 'Never crosses the service counter');
      for (const station of world.kitchen.stations.values()) {
        const bounds = station.collider.bounds;
        const dx = p.x - Math.max(bounds.minX, Math.min(p.x, bounds.maxX));
        const dz = p.z - Math.max(bounds.minZ, Math.min(p.z, bounds.maxZ));
        assert.ok(Math.hypot(dx, dz) >= .4, 'No furniture penetration');
      }
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
    const appearedAt = system.clock;
    assert.equal(guest.arrivalElapsed, 0);
    assert.ok(guest.speed < BALANCE.player.walkSpeed, 'Arrival stays slower than the player walking');
    assert.ok(Math.abs(guest.speed * (BALANCE.customers.arrivalTarget - BALANCE.customers.arrivalTurnAllowance) - guest.arrivalPathLength) < 1e-8);
    assert.ok(guest.model.position.x > world.collisionBounds.maxX);
    assert.equal(system.spawn(), null, 'Single transit reservation');
    if (i === 0) {
      // Use the production simulation gate while a guest is still walking, including Cisco pause.
      const session = new SessionState(), questions = new QuestionSystem({ session });
      const game = Object.create(Game.prototype);
      Object.assign(game, { disposed: false, session, world, players: [], customerSystem: system, questionSystem: questions,
        preparation: { updatePreparation() {}, assemblySystems: new Map() } });
      const savedDocument = globalThis.document;
      globalThis.document = { hidden: false };
      const frozen = () => JSON.stringify([system.clock, guest.arrivalElapsed, guest.model.position.toArray(), guest.model.rotation.y,
        guest.elapsed, guest.orderId, system.entrance.openAmount]);
      try {
        session.play(); game.updateSimulation(.3);
        session.pause(); const paused = frozen();
        for (let n = 0; n < 20; n++) game.updateSimulation(2);
        assert.equal(frozen(), paused, 'Manual pause freezes movement and the arrival clock');
        session.play(); game.updateSimulation(.1);
        assert.ok(questions.open({ playerId: 'test', orderId: 'test', resolve() {} }));
        const duringQuestion = frozen();
        for (let n = 0; n < 20; n++) game.updateSimulation(2);
        assert.equal(frozen(), duringQuestion, 'Cisco question freezes movement and the arrival clock');
        questions.cancel(); game.updateSimulation(.1);
        assert.ok(Math.abs(guest.arrivalElapsed - .5) < 1e-8, 'Only active time counts after resuming');
        assert.equal(guest.orderId, null);
      } finally {
        questions.dispose();
        if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
      }
    }
    until(() => Boolean(guest.orderId));
    const activeTime = arrivedAt.get(guest.id) - appearedAt;
    assert.ok(activeTime <= BALANCE.customers.arrivalLimit + 1e-8, `Arrival deadline: ${mode}/${fps}FPS/slot${i}: ${activeTime}s`);
    assert.ok(activeTime >= 5 && activeTime <= 8, `Preferred 5–8 seconds: ${activeTime}s`);
    assert.ok(Math.abs(guest.arrivalDuration - activeTime) <= dt + 1e-8);
    fastestArrival = Math.min(fastestArrival, activeTime); slowestArrival = Math.max(slowestArrival, activeTime);
    const order = system.orderSystem.getActiveOrder(guest.id);
    assert.ok(Math.abs(order.remainingTime - (order.maxPatience - (system.clock - arrivedAt.get(guest.id)))) < 1e-6, 'Patience starts at arrival, including remaining substeps on low FPS');
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
console.log(`OK: arrivals ${fastestArrival.toFixed(2)}–${slowestArrival.toFixed(2)}s active (limit 10s), distance-based speed, manual/Cisco pause, four unique seats, no teleports/wall/furniture overlap, arrival-only orders/patience, exit through door, solo/coop at 10/20/60/144 FPS and unchanged framing.`);
