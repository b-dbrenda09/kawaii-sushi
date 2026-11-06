import assert from 'node:assert/strict';
import { Box3, Raycaster, Vector3 } from 'three';
import { Scene } from '../src/game/Scene.js';
import { Camera } from '../src/game/Camera.js';
import { CollisionSystem } from '../src/game/CollisionSystem.js';

const world = new Scene();
const { kitchen, player } = world;
const system = new CollisionSystem({ bounds: world.collisionBounds });
world.collisionObstacles.forEach((obstacle) => system.registerObstacle(obstacle));
player.collisionSystem = system;
const stations = [...kitchen.stations.values()];
const ingredientIds = ['salmonBox', 'riceBox', 'cucumberBox', 'noriBox'];
const ids = [...ingredientIds, 'cutting', 'cutting2', 'cutting3', 'riceCooker', 'riceCooker2', 'riceCooker3', 'riceCooker4', 'assembly', 'assembly2', 'assembly3', 'delivery', 'trash'];
assert.deepEqual([...kitchen.stations.keys()].sort(), ids.sort());
assert.equal(kitchen.colliders.length, 16);
assert.equal(player.maxSpeed, 5.04);
assert.equal(player.dashDuration, 0.18);
assert.equal(player.dashCooldown, 0.65);
assert.equal(player.dashSpeedMultiplier, 11.55 / 5.04);
assert.ok(player.group.position.equals(kitchen.spawnPosition));
assert.ok(player.group.position.z > 3);
for (const id of ingredientIds) assert.ok(kitchen.stations.get(id).position.x < -6);
for (const id of ['cutting', 'cutting2', 'cutting3']) assert.ok(kitchen.stations.get(id).position.x > 6);
for (const station of stations.filter(s => s.type === 'riceCooker')) assert.ok(station.position.z > 8);
assert.ok(kitchen.stations.get('delivery').position.z < -4);
assert.ok(kitchen.clientArea.position.z < kitchen.stations.get('delivery').collider.bounds.minZ);

const radius = player.collider.radius;
function isFree(position) {
  const b = system.bounds;
  if (position.x < b.minX + radius || position.x > b.maxX - radius || position.z < b.minZ + radius || position.z > b.maxZ - radius) return false;
  return [...system.obstacles.values()].every((obstacle) => {
    const dx = Math.max(obstacle.minX - position.x, 0, position.x - obstacle.maxX);
    const dz = Math.max(obstacle.minZ - position.z, 0, position.z - obstacle.maxZ);
    return Math.hypot(dx, dz) >= radius - 1e-8;
  });
}
assert.ok(isFree(player.group.position), 'Spawn deve ficar fora de todos os móveis.');
for (const id of ['fridge', 'pantry']) {
  assert.equal(kitchen.stations.has(id), false);
  assert.equal(system.obstacles.has(id), false);
  assert.equal(world.scene.getObjectByName(`station-${id}`), undefined);
}
for (const [index, id] of ingredientIds.entries()) {
  const station = kitchen.stations.get(id);
  const ingredient = ['salmon', 'rice', 'cucumber', 'nori'][index];
  assert.equal(station.ingredientSource.ingredient, ingredient);
  assert.equal(station.ingredientSource.unlimited, true);
  assert.ok(station.model.getObjectByName(`${ingredient}-contents`));
  assert.ok(station.model.getObjectByName(`${ingredient}-icon${ingredient === 'rice' ? '-bowl' : ''}`));
  assert.ok(station.model.getObjectByName('ingredient-box-bottom'));
  assert.equal(station.model.getObjectByName('ingredient-box-lid'), undefined);
  assert.ok(station.interactionArea.position.equals(station.getApproachPosition()));
  assert.ok(isFree(station.interactionArea.position));
  for (const otherId of ingredientIds.slice(index + 1)) {
    const other = kitchen.stations.get(otherId);
    assert.notEqual(station.model, other.model);
    assert.notEqual(station.collider, other.collider);
    assert.notEqual(station.interactionArea, other.interactionArea);
    assert.ok(station.interactionArea.position.distanceTo(other.interactionArea.position)
      > station.interactionArea.radius + other.interactionArea.radius);
  }
}
for (const station of stations) {
  assert.equal(system.obstacles.has(station.id), true);
  assert.equal(world.scene.getObjectByName(`station-${station.id}`), station.model);
  const modelBounds = new Box3().setFromObject(station.model);
  const collider = station.collider.bounds;
  assert.ok(Math.abs(modelBounds.min.x - collider.minX) < 0.12);
  assert.ok(Math.abs(modelBounds.max.x - collider.maxX) < 0.12);
  assert.ok(Math.abs(modelBounds.min.z - collider.minZ) < 0.12);
  assert.ok(Math.abs(modelBounds.max.z - collider.maxZ) < 0.12);
  assert.ok(isFree(station.getApproachPosition()), `Aproximação livre em ${station.id}.`);
}

// Mapeia a conectividade do chão usando o collider real e o resolvedor de movimento.
const step = 0.25;
const key = (x, z) => `${x},${z}`;
const point = (x, z) => new Vector3(x * step, 0, z * step);
const start = [Math.round(player.group.position.x / step), Math.round(player.group.position.z / step)];
const visited = new Set([key(...start)]);
const queue = [start];
for (let head = 0; head < queue.length; head++) {
  const [x, z] = queue[head];
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx; const nz = z + dz;
    if (visited.has(key(nx, nz)) || !isFree(point(nx, nz))) continue;
    const moved = point(x, z);
    system.move(moved, new Vector3(dx * step, 0, dz * step), radius);
    if (moved.distanceTo(point(nx, nz)) > 1e-8) continue;
    visited.add(key(nx, nz));
    queue.push([nx, nz]);
  }
}
for (let x = -33; x <= 33; x++) {
  for (let z = -25; z <= 25; z++) {
    if (isFree(point(x, z))) assert.ok(visited.has(key(x, z)), `Área isolada em ${x * step}, ${z * step}.`);
  }
}
for (const station of stations) {
  const approach = station.getApproachPosition();
  assert.ok(visited.has(key(Math.round(approach.x / step), Math.round(approach.z / step))), `${station.id} deve ser alcançável a partir do spawn.`);
}

// Caminho retangular ao redor da ilha: quatro lados livres, também durante o dash.
const loop = [new Vector3(-3, 0, 2.4), new Vector3(3, 0, 2.4), new Vector3(3, 0, -2.4), new Vector3(-3, 0, -2.4), new Vector3(-3, 0, 2.4)];
const cursor = loop[0].clone();
for (const target of loop.slice(1)) {
  const delta = target.clone().sub(cursor);
  const origin = cursor.clone();
  const parts = Math.ceil(delta.length() / 0.525);
  for (let i = 0; i < parts; i++) {
    system.move(cursor, delta.clone().divideScalar(parts), radius);
    assert.ok(isFree(cursor));
  }
  assert.ok(cursor.distanceTo(target) < 1e-8, `Volta da ilha bloqueada depois de ${origin.toArray()}.`);
}

// Investidas contra as quatro faces de cada móvel, usando Player e o dash existentes.
for (const fps of [20, 60]) {
  for (const station of stations) {
    for (const normal of [new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1)]) {
      const half = normal.x ? station.dimensions.width / 2 : station.dimensions.depth / 2;
      const origin = station.position.clone().addScaledVector(normal, half + radius + 0.35);
      // Fundos encostados nas paredes não são pontos de aproximação jogáveis.
      if (!isFree(origin)) continue;
      player.stopMoving();
      player.cooldownRemaining = 0;
      player.group.position.copy(origin);
      const direction = normal.clone().negate();
      for (let i = 0; i < fps; i++) {
        player.update(1 / fps, direction, i === 0);
        assert.ok(isFree(player.group.position), `Dash atravessou ${station.id} em ${fps} FPS.`);
      }
      const relative = player.group.position.clone().sub(station.position);
      assert.ok(relative.dot(normal) >= half + radius - 1e-8);
      player.update(10, direction, true);
      assert.ok(isFree(player.group.position));
    }
  }
}

const camera = new Camera(1280, 800, world.bounds);
const cameraPosition = camera.camera.position.clone();
const cameraRotation = camera.camera.quaternion.clone();
for (const [width, height] of [[1280, 800], [1920, 1080], [375, 812], [812, 375]]) {
  camera.resize(width, height);
  for (const station of stations) {
    const box = new Box3().setFromObject(station.model);
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const projected = new Vector3(x, y, z).project(camera.camera);
      assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1);
    }
  }
  assert.ok(camera.camera.position.equals(cameraPosition));
  assert.ok(camera.camera.quaternion.equals(cameraRotation));
}
world.scene.updateMatrixWorld(true);
// Confere a linha de visão até o centro de cada ingrediente, além da cabeça.
for (const id of ingredientIds) {
  const station = kitchen.stations.get(id);
  const contents = station.model.getObjectByName(`${station.ingredientSource.ingredient}-contents`);
  const contentBounds = new Box3().setFromObject(contents);
  const target = contentBounds.getCenter(new Vector3()).setY(contentBounds.max.y);
  const ray = new Raycaster(cameraPosition, target.clone().sub(cameraPosition).normalize(), 0, cameraPosition.distanceTo(target) - 0.02);
  const otherModels = stations.filter((other) => other !== station).map((other) => other.model);
  assert.equal(ray.intersectObjects(otherModels, true).length, 0, `Outra estação esconde ${id}.`);
}
// A cabeça permanece visível nos pontos de aproximação das estações.
for (const station of stations) {
  const head = station.getApproachPosition().setY(2.25);
  const direction = head.clone().sub(cameraPosition).normalize();
  const ray = new Raycaster(cameraPosition, direction, 0, cameraPosition.distanceTo(head) - 0.01);
  assert.equal(ray.intersectObjects([world.architecture, kitchen.group], true).length, 0, `Geometria oculta a cabeça junto a ${station.id}.`);
}
system.dispose();
world.dispose();
console.log('OK: quatro caixas independentes e visíveis, ingredientes distintos, fontes futuras ilimitadas, áreas individuais, nove estações, corredores conectados, ilha livre, dash a 20/60 FPS, câmera fixa e enquadramento.');
