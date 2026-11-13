import assert from 'node:assert/strict';
import { Box3, Raycaster, Vector3 } from 'three';
import { Scene } from '../src/game/Scene.js';
import { KITCHEN_LAYOUT } from '../src/game/KitchenLayout.js';
import { CollisionSystem } from '../src/game/CollisionSystem.js';
import { KitchenNavigation } from '../src/game/KitchenNavigation.js';
import { InteractionSystem } from '../src/game/InteractionSystem.js';
import { CustomerSystem } from '../src/game/CustomerSystem.js';
import { Camera } from '../src/game/Camera.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
for (const mode of ['solo', 'coop']) {
  const original = new Scene({ gameMode: mode, layout: { ...KITCHEN_LAYOUT, width: KITCHEN_LAYOUT.baseWidth } });
  const world = new Scene({ gameMode: mode });
  close(world.dimensions.width / original.dimensions.width, 1.2);
  close(world.sideExpansion, 1.8);
  assert.equal(world.dimensions.depth, original.dimensions.depth);
  assert.equal(world.backZ, original.backZ); assert.equal(world.frontZ, original.frontZ);
  assert.equal(world.kitchen.stations.size, original.kitchen.stations.size);
  for (const [id, station] of world.kitchen.stations) {
    const before = original.kitchen.stations.get(id);
    assert.deepEqual(station.dimensions, before.dimensions);
    assert.deepEqual(station.model.scale.toArray(), [1, 1, 1]);
    close(station.position.z, before.position.z);
    const stationary = station.type === 'assembly' || station.type === 'delivery';
    close(station.position.x, before.position.x + (stationary ? 0 : Math.sign(before.position.x) * 1.8));
    close(station.collider.position.x, station.position.x);
    close(station.collider.bounds.minX, station.position.x - station.dimensions.width / 2);
    const parts = [], oldParts = [];
    station.model.traverse(part => { if (part.isMesh) parts.push(part); });
    before.model.traverse(part => { if (part.isMesh) oldParts.push(part); });
    assert.equal(parts.length, oldParts.length);
    parts.forEach((part, index) => {
      const old = oldParts[index];
      assert.equal(part.name, old.name);
      assert.deepEqual(part.geometry.parameters, old.geometry.parameters);
      assert.ok(part.scale.equals(old.scale) && part.position.equals(old.position));
      assert.ok(part.quaternion.equals(old.quaternion));
    });
    if (station.type === 'assembly') assert.equal(station.storage.anchor.parent.name, 'assembly-bamboo-mat');
  }
  original.architecture.children.forEach(before => {
    const after = world.architecture.getObjectByName(before.name);
    assert.ok(after);
    assert.deepEqual(after.geometry.parameters, before.geometry.parameters, `${before.name} retains its native dimensions`);
    assert.deepEqual(after.scale.toArray(), [1, 1, 1]);
  });
  world.architecture.children.forEach(part => assert.deepEqual(part.scale.toArray(), [1, 1, 1]));
  world.players.forEach((player, i) => {
    assert.deepEqual(player.group.scale.toArray(), [.8, .8, .8]);
    assert.ok(player.group.position.equals(original.players[i].group.position));
  });

  world.architecture.updateWorldMatrix(true, true);
  const floor = world.architecture.children.filter(part => part.name.startsWith('floor-'));
  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
  for (const x of [-10.7, -9.25, -9.01, -8.99, 0, 8.99, 9.01, 9.25, 10.7]) for (const z of [-6.8, -5.5, 0, 6.4, 10.8]) {
    ray.ray.origin.set(x, .5, z);
    const hit = ray.intersectObjects(floor, false)[0];
    assert.ok(hit && hit.point.y >= -.071, `Continuous floor at ${x}, ${z}`);
  }
  const back = world.architecture.children.filter(part => /^back-wall/.test(part.name))
    .map(part => new Box3().setFromObject(part)).sort((a, b) => a.min.x - b.min.x);
  assert.equal(back.length, 3);
  for (let i = 1; i < back.length; i++) assert.ok(back[i].min.x <= back[i - 1].max.x + 1e-6);
  for (const name of ['left-wall', 'right-low-wall']) {
    const wall = new Box3().setFromObject(world.architecture.getObjectByName(name));
    assert.ok(back.some(part => part.intersectsBox(wall)), 'Back and side walls remain joined');
  }

  const collisions = new CollisionSystem({ bounds: world.collisionBounds });
  world.collisionObstacles.forEach(obstacle => collisions.registerObstacle(obstacle));
  world.players.forEach(player => { player.collisionSystem = collisions; }); collisions.players = world.players;
  const clients = new CustomerSystem({ scene: world.scene, delivery: world.kitchen.stations.get('delivery'),
    collisionSystem: collisions, architecture: world.architecture, areaWidth: world.dimensions.width });
  world.refreshArchitectureColliders(collisions);
  close(collisions.obstacles.get('customer-area-boundary').maxX, 10.8);
  for (const name of ['left-wall', 'right-low-wall']) {
    const wall = new Box3().setFromObject(world.architecture.getObjectByName(name));
    const extension = new Box3().setFromObject(clients.area.getObjectByName(`customer-wall-extension-${name === 'left-wall' ? -1 : 1}`));
    assert.ok(extension.intersectsBox(wall));
    if (name === 'right-low-wall') extension.union(new Box3().setFromObject(clients.area.getObjectByName('customer-wall-extension-1-0')));
    assert.ok(world.architecture.children.filter(part => /^back-wall/.test(part.name)).some(part => new Box3().setFromObject(part).intersectsBox(extension)));
  }
  for (const collider of world.collisionObstacles) {
    const object = world.architecture.getObjectByName(collider.id);
    if (!object) continue;
    const box = new Box3().setFromObject(object);
    close(collider.bounds.minX, box.min.x); close(collider.bounds.maxZ, box.max.z);
    close(collisions.obstacles.get(collider.id).minX, box.min.x);
  }
  const player = world.player, navigation = new KitchenNavigation(collisions, player);
  const interactions = new InteractionSystem({ stations: world.kitchen.stations.values(), collisionSystem: collisions });
  for (const station of world.kitchen.stations.values()) {
    const accepts = point => interactions.canApproach(station, player, point);
    const route = navigation.findRoute(player.group.position, station.position, accepts);
    assert.ok(route.length && accepts(route.at(-1)), `${station.id} stays reachable by GPS`);
  }
  for (const sign of [-1, 1]) {
    const goal = new Vector3(sign * 9.7, 0, 6.4);
    const route = navigation.findRoute(player.group.position, goal);
    assert.ok(route.length && route.at(-1).distanceTo(goal) < 1e-6, 'GPS reaches the new side strips');
    player.group.position.set(sign * 8.7, 0, 6.4); player.stopMoving();
    for (let frame = 0; frame < 180; frame++) player.update(1 / 60, new Vector3(sign, 0, 0), frame === 0);
    assert.ok(sign * player.group.position.x > 9.5, 'Old wall does not leave a ghost barrier');
    assert.ok(sign * player.group.position.x <= 10.8 - player.collider.radius + 1e-7, 'New wall blocks walking and dash');
    player.group.position.copy(world.kitchen.spawnPosition); player.stopMoving();
  }
  const bounds = world.bounds.clone().union(clients.bounds);
  const camera = new Camera(1440, 1000, bounds);
  for (const [width, height] of [[1440, 1000], [1280, 720], [390, 844], [812, 375]]) {
    camera.resize(width, height);
    const center = bounds.getCenter(new Vector3()).project(camera.camera);
    close(center.x, 0); close(center.y, 0);
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const point = new Vector3(x, y, z).project(camera.camera);
      assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1);
    }
  }
  interactions.dispose(); clients.dispose(); collisions.dispose(); world.dispose(); original.dispose();
}
console.log('OK: 20% wider world, symmetric 1.8-unit extensions, unchanged native geometries/scales, modular floor without holes, joined walls, real colliders, every station reachable, GPS/new strips, old wall removed, new wall blocks dash, solo/coop and centered camera.');
