import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { Scene } from '../src/game/Scene.js';
import { Camera } from '../src/game/Camera.js';
import { CollisionSystem } from '../src/game/CollisionSystem.js';
import { OrderSystem } from '../src/game/OrderSystem.js';
import { CustomerSystem } from '../src/game/CustomerSystem.js';

const world = new Scene();
const collision = new CollisionSystem({ bounds: world.collisionBounds });
world.collisionObstacles.forEach((obstacle) => collision.registerObstacle(obstacle));
const original = [...world.kitchen.stations.values()].map((station) => station.position.toArray());
const system = new CustomerSystem({ scene: world.scene, delivery: world.kitchen.stations.get('delivery'), collisionSystem: collision, architecture: world.architecture, firstArrival: 5, arrivalInterval: 10, maxCustomers: 3, orderSystem: new OrderSystem({ patience: { salmon_nigiri: 55, salmon_maki: 70, cucumber_uramaki: 70 } }) });
world.bounds.union(system.bounds);
const seen = new Map(), removed = new Set(), animations = new Set();
let full = false, reused = false;
const history = new Map();
for (let frame = 0; frame < 120 * 60; frame++) {
  system.update(1 / 60);
  if (frame < 299) assert.equal(system.customers.size, 0, 'Primeira chegada somente após 5s');
  assert.ok(system.customers.size <= 3);
  const occupied = system.slots.filter((slot) => slot.customerId);
  assert.equal(new Set(occupied.map((slot) => slot.customerId)).size, occupied.length);
  assert.equal(occupied.length, system.customers.size);
  if (system.customers.size === 3) { full = true; assert.equal(system.spawn(), null); }
  const customers = [...system.customers.values()];
  for (const customer of customers) {
    assert.equal(customer.slot.customerId, customer.id);
    animations.add(customer.animation);
    assert.ok(customer.model.position.z <= system.counterZ - 0.64, 'Nunca atravessa o balcão');
    assert.ok(customer.model.position.z > -9.4, 'Não entra na parede traseira');
    for (const other of customers) if (other !== customer) assert.ok(customer.model.position.distanceTo(other.model.position) > 0.9, 'Clientes não se atravessam');
    if (!seen.has(customer.id)) {
      seen.set(customer.id, customer);
      assert.ok(customer.model.position.distanceTo(system.entry) < 0.1, 'Nasce na entrada');
      if (history.has(customer.slot.id)) reused = true;
      history.set(customer.slot.id, customer.id);
      const box = new Box3().setFromObject(customer.model);
      assert.ok(box.max.y < 2.1);
      assert.equal(customer.rig.arms.length, 2); assert.equal(customer.rig.legs.length, 2);
      assert.equal(customer.orderId, null);
    }
    if (customer.state === 'WAITING') {
      assert.ok(customer.model.position.distanceTo(customer.slot.position) < 0.001);
      for (const [width, height] of [[1440, 1000], [390, 844]]) {
        const camera = new Camera(width, height, world.bounds).camera;
        const position = customer.model.position.clone().add(new Vector3(0, 1, 0)).project(camera);
        assert.ok(Math.abs(position.x) < 1 && Math.abs(position.y) < 1, 'Cliente enquadrado');
      }
    }
  }
  for (const [id, customer] of seen) if (customer.state === 'REMOVED' && !removed.has(id)) {
    removed.add(id);
    assert.ok(customer.waitTime + 1e-6 >= customer.patienceTime);
    assert.ok(customer.model.position.distanceTo(system.entry) < 0.001, 'Sai caminhando até o vestíbulo');
    assert.equal(customer.model.parent, null);
  }
}
assert.deepEqual(new Set([...seen.values()].map((customer) => customer.type)), new Set(['rabbit', 'bear', 'panda']));
assert.ok(full && reused && removed.size >= 3);
assert.ok(animations.has('WALK') && animations.has('WAIT') && animations.has('IDLE'));
assert.equal(new Set(seen.keys()).size, seen.size);
assert.deepEqual([...world.kitchen.stations.values()].map((station) => station.position.toArray()), original);
// A barreira externa também impede a jogadora de alcançar os clientes.
world.player.collisionSystem = collision;
world.player.group.position.set(4, 0, -4.5);
for (let i = 0; i < 120; i++) world.player.update(1 / 60, new Vector3(0, 0, -1), i === 0);
assert.ok(world.player.group.position.z >= system.counterZ + world.player.collider.radius);
let geometryDisposals = 0;
system.factory.geometry.addEventListener('dispose', () => geometryDisposals++);
system.dispose(); system.dispose();
assert.equal(geometryDisposals, 1);
assert.equal(system.customers.size, 0);
assert.ok(system.slots.every((slot) => slot.customerId === null));
assert.equal(collision.obstacles.has('customer-area-boundary'), false);
collision.dispose(); world.dispose();
console.log('OK: três animais, chegada 5s/10s, capacidade, reservas, trajetos sem sobreposição, animações, espera por paciência, saída, reutilização, separação, câmera e descarte.');
