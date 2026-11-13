import assert from 'node:assert/strict';
import { Vector3, Scene as ThreeScene } from 'three';
import { CollisionSystem } from '../src/game/CollisionSystem.js';
import { Player } from '../src/game/Player.js';
import { Scene } from '../src/game/Scene.js';

const tolerance = 1e-8;
const circle = 0.52;
const systems = [];
const players = [];
const makeSystem = (options) => { const system = new CollisionSystem(options); systems.push(system); return system; };
const makePlayer = (options) => { const player = new Player(options); players.push(player); return player; };
function clearOfObstacles(system, position, radius = circle) {
  for (const obstacle of system.obstacles.values()) {
    const x = Math.max(obstacle.minX - position.x, 0, position.x - obstacle.maxX);
    const z = Math.max(obstacle.minZ - position.z, 0, position.z - obstacle.maxZ);
    assert.ok(Math.hypot(x, z) >= radius - tolerance, `Sobreposição com ${obstacle.id}`);
  }
  if (system.bounds) {
    assert.ok(position.x >= system.bounds.minX + radius - tolerance);
    assert.ok(position.x <= system.bounds.maxX - radius + tolerance);
    assert.ok(position.z >= system.bounds.minZ + radius - tolerance);
    assert.ok(position.z <= system.bounds.maxZ - radius + tolerance);
  }
}

const system = makeSystem({ bounds: { minX: -9, maxX: 9, minZ: -7, maxZ: 7 } });
system.registerObstacle({ id: 'thin-wall', position: { x: 2, z: 0 }, width: 0.02, depth: 6 });
assert.equal(system.obstacles.size, 1);
system.registerObstacle({ id: 'thin-wall', bounds: { minX: 1.99, maxX: 2.01, minZ: -3, maxZ: 3 } });
assert.equal(system.obstacles.size, 1, 'Registrar o mesmo ID atualiza o obstáculo.');
assert.throws(() => system.registerObstacle({ id: 'bad', position: { x: 0, z: 0 }, width: -1, depth: 1 }));
assert.throws(() => system.move(new Vector3(), new Vector3(Infinity, 0, 0), circle));

const position = new Vector3(0, 0, 0);
let result = system.move(position, new Vector3(100, 0, 0), circle);
assert.ok(result.blockedX);
assert.ok(Math.abs(position.x - (1.99 - circle)) < tolerance, 'Não salta uma parede fina mesmo num deslocamento enorme.');
clearOfObstacles(system, position);
const contactX = position.x;
result = system.move(position, new Vector3(0.4, 0, 0.4), circle);
assert.ok(result.blockedX && !result.blockedZ);
assert.ok(Math.abs(position.x - contactX) < tolerance);
assert.ok(Math.abs(position.z - 0.4) < tolerance, 'Componente tangencial deve ser preservada.');
system.move(position, new Vector3(-0.5, 0, 0), circle);
assert.ok(position.x < contactX - 0.49, 'Pode se afastar normalmente.');

// Cantos externos usam distância circular, sem transformar o collider em quadrado.
const cornerSystem = makeSystem();
cornerSystem.registerObstacle({ id: 'test-obstacle', position: { x: 0, z: 0 }, width: 2, depth: 2 });
const aroundCorner = new Vector3(-1.4, 0, -1.4);
cornerSystem.move(aroundCorner, new Vector3(0.01, 0, 0), circle);
assert.ok(aroundCorner.x > -1.4, 'Círculo pode ocupar a região diagonal livre do canto.');
clearOfObstacles(cornerSystem, aroundCorner);
for (const origin of [new Vector3(-4, 0, -4), new Vector3(4, 0, -4), new Vector3(-4, 0, 4), new Vector3(4, 0, 4)]) {
  const point = origin.clone();
  const direction = origin.clone().negate().normalize();
  for (let i = 0; i < 120; i++) {
    cornerSystem.move(point, direction.clone().multiplyScalar(0.25), circle);
    clearOfObstacles(cornerSystem, point);
  }
  const stuck = point.clone();
  cornerSystem.move(point, direction.clone().multiplyScalar(-0.5), circle);
  assert.ok(point.distanceTo(stuck) > 0.49);
}

const world = new Scene();
const kitchen = makeSystem({ bounds: world.collisionBounds });
// Estes casos exercitam a arquitetura isolada; o layout completo tem suíte própria.
world.collisionObstacles.filter((obstacle) => !world.kitchen.stations.has(obstacle.id))
  .forEach((obstacle) => kitchen.registerObstacle(obstacle));
assert.equal(world.dimensions.width, 21.6);
assert.equal(world.dimensions.depth, 18);
for (const name of ['back-wall', 'left-wall', 'right-low-wall', 'front-boundary']) assert.ok(kitchen.obstacles.has(name));
const directions = [
  new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1),
  new Vector3(1, 0, 1).normalize(), new Vector3(-1, 0, 1).normalize(),
  new Vector3(1, 0, -1).normalize(), new Vector3(-1, 0, -1).normalize(),
];
for (const direction of directions) {
  const point = new Vector3();
  kitchen.move(point, direction.clone().multiplyScalar(100), circle);
  clearOfObstacles(kitchen, point);
  const resting = point.clone();
  for (let i = 0; i < 100; i++) kitchen.move(point, direction.clone().multiplyScalar(0.525), circle);
  assert.ok(point.distanceTo(resting) < tolerance, 'Contato constante não deve causar tremor.');
  kitchen.move(point, direction.clone().multiplyScalar(-0.4), circle);
  assert.ok(point.distanceTo(resting) > 0.39, 'Deve conseguir sair de todos os cantos.');
  clearOfObstacles(kitchen, point);
}

for (const fps of [20, 30, 60, 144]) {
  for (const direction of directions) {
    const player = makePlayer({ collisionSystem: kitchen });
    assert.equal(player.maxSpeed, 5.04);
    assert.equal(player.dashDuration, 0.18);
    assert.equal(player.dashCooldown, 0.65);
    assert.equal(player.collider.position, player.group.position);
    for (let i = 0; i < Math.ceil(fps * 4); i++) {
      player.update(1 / fps, direction, i % Math.ceil(fps * 0.7) === 0);
      clearOfObstacles(kitchen, player.group.position, player.collider.radius);
      assert.equal(player.group.position.y, 0);
    }
    for (let i = 0; i < Math.ceil(fps * 2); i++) player.update(1 / fps, direction);
    assert.equal(player.actualSpeed, 0);
    assert.equal(player.state, 'idle', 'Pressionar parede sem avançar deve terminar a caminhada.');
    assert.ok(Math.abs(player.leftLeg.rotation.x) < 1e-6);
    const before = player.group.position.clone();
    for (let i = 0; i < Math.ceil(fps * 0.3); i++) player.update(1 / fps, direction.clone().negate());
    assert.ok(player.group.position.distanceTo(before) > 0.2);
  }
}

// Dash oblíquo contra obstáculo fino, incluindo um quadro de duração extrema.
const dashPlayer = makePlayer({ collisionSystem: system, position: new Vector3() });
const diagonal = new Vector3(1, 0, 0.3).normalize();
dashPlayer.update(0.05, diagonal, true);
for (let i = 0; i < 12; i++) {
  dashPlayer.update(i === 1 ? 10 : 0.05, diagonal);
  clearOfObstacles(system, dashPlayer.group.position);
}
assert.ok(dashPlayer.group.position.x <= 1.99 - circle + tolerance);
assert.ok(dashPlayer.group.position.z > 0.5, 'Dash e caminhada deslizam ao longo do obstáculo.');

// Sem obstáculos, integrar o sistema não deve alterar a curva de movimento.
const free = makePlayer();
const connected = makePlayer({ collisionSystem: makeSystem() });
for (let i = 0; i < 180; i++) {
  const direction = i < 120 ? directions[4] : null;
  free.update(1 / 60, direction, i === 30);
  connected.update(1 / 60, direction, i === 30);
  assert.ok(free.group.position.distanceTo(connected.group.position) < tolerance);
  assert.ok(free.velocity.distanceTo(connected.velocity) < tolerance);
}

const debugScene = new ThreeScene();
kitchen.updateDebug(debugScene, connected.collider);
assert.equal(debugScene.children.length, 0, 'Depuração desativada por padrão.');
kitchen.updateDebug(debugScene, connected.collider, true);
assert.equal(kitchen.debugGroup.visible, true);
assert.equal(kitchen.debugGroup.children.length, kitchen.obstacles.size + 2);
assert.equal(kitchen.debugCollider.position.x, connected.group.position.x);
kitchen.updateDebug(debugScene, connected.collider, false);
assert.equal(kitchen.debugGroup.visible, false);
kitchen.clearDebug();
assert.equal(debugScene.children.length, 0);
assert.equal(system.removeObstacle('thin-wall'), true);
assert.equal(system.removeObstacle('thin-wall'), false);
players.forEach((player) => player.dispose());
systems.forEach((collisionSystem) => collisionSystem.dispose());
world.dispose();
console.log('OK: círculo XZ, registro, paredes reais, frente aberta, deslizamento, cantos, afastamento, dash, paredes finas, 20/30/60/144 FPS, animação bloqueada, velocidade 4.2, depuração e limpeza.');
