import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { ControlSettings } from '../src/game/ControlSettings.js';
import { Input } from '../src/game/Input.js';
import { Game } from '../src/game/Game.js';
import { BALANCE } from '../src/game/Balance.js';
import { Player } from '../src/game/Player.js';
import { Camera } from '../src/game/Camera.js';
import { CollisionSystem } from '../src/game/CollisionSystem.js';
import { Scene } from '../src/game/Scene.js';
import { InteractionSystem } from '../src/game/InteractionSystem.js';
import { Station } from '../src/game/Station.js';

let saved; const storage = { getItem() { return saved; }, setItem(_, value) { saved = value; } };
const settings = new ControlSettings({ storage }); assert.equal(settings.movementMode, 'map');
settings.setMovementMode('camera'); assert.equal(new ControlSettings({ storage }).movementMode, 'camera');
assert.equal(settings.setMovementMode('invalid'), false);
const unavailable = new ControlSettings({ storage: { getItem() { throw Error(); }, setItem() { throw Error(); } } });
assert.equal(unavailable.movementMode, 'map'); assert.equal(unavailable.setMovementMode('character'), true);
const camera = new Camera(1280, 800).camera, player = new Player();
const target = new EventTarget(), input = new Input(camera, { settings, player, target, documentTarget: new EventTarget() });
const key = (type, code) => { const event = new Event(type, { cancelable: true }); Object.assign(event, { code }); target.dispatchEvent(event); };
input.setEnabled(true);
const original = JSON.stringify({ p: camera.position.toArray(), q: camera.quaternion.toArray() });
for (const mode of ['map', 'camera', 'character']) {
  settings.setMovementMode(mode); player.group.rotation.y = .7;
  const forward = mode === 'map' ? new Vector3(0, 0, -1) : mode === 'camera'
    ? camera.getWorldDirection(new Vector3()).setY(0).normalize() : new Vector3(Math.sin(.7), 0, Math.cos(.7));
  const right = mode === 'map' ? new Vector3(1, 0, 0) : mode === 'camera'
    ? new Vector3(-forward.z, 0, forward.x) : new Vector3(-Math.cos(.7), 0, Math.sin(.7));
  for (const [code, expected] of [['KeyW', forward], ['ArrowUp', forward], ['KeyS', forward.clone().negate()], ['ArrowDown', forward.clone().negate()],
    ['KeyD', mode === 'character' ? new Vector3() : right], ['ArrowRight', mode === 'character' ? new Vector3() : right], ['KeyA', mode === 'character' ? new Vector3() : right.clone().negate()], ['ArrowLeft', mode === 'character' ? new Vector3() : right.clone().negate()]]) {
    input.reset(); key('keydown', code); assert.ok(input.getDirection().distanceTo(expected) < 1e-10);
  }
  input.reset(); key('keydown', 'KeyW'); key('keydown', 'KeyD'); assert.ok(Math.abs(input.getDirection().length() - 1) < 1e-10);
  input.setEnabled(false); assert.equal(input.getDirection().length(), 0); assert.equal(input.getTurn(), 0); input.setEnabled(true);
}
assert.equal(JSON.stringify({ p: camera.position.toArray(), q: camera.quaternion.toArray() }), original);
settings.setMovementMode('character'); player.autoFaceMovement = false;
for (const code of ['KeyA', 'KeyD', 'KeyS']) {
  player.stopMoving(); input.reset(); key('keydown', code); const angle = player.group.rotation.y;
  for (let i = 0; i < 30; i++) player.update(1 / 60, input.getDirection());
  assert.equal(player.group.rotation.y, angle);
}
for (const [code, turn] of [['KeyA', 1], ['ArrowLeft', 1], ['KeyD', -1], ['ArrowRight', -1]]) {
  input.reset(); key('keydown', code); assert.equal(input.getTurn(), turn);
  input.setActionsBlocked(true); assert.equal(input.getTurn(), 0);
}
input.reset(); key('keydown', 'KeyQ'); key('keydown', 'KeyF'); assert.equal(input.getTurn(), 0);

// Exercita o mesmo caminho da simula??o, incluindo bloqueios e curvas.
const previousDocument = globalThis.document;
globalThis.document = { hidden: false };
const game = Object.create(Game.prototype);
Object.assign(game, { session: { paused: false }, input, controlSettings: settings,
  world: { player, update: (dt, direction, dash) => player.update(dt, direction, dash) },
  preparation: { isCutting: false, updatePreparation() {}, updateAssembly() {} },
  customerSystem: { update() {} }, interactionSystem: { update() {} } });
try {
  const results = [];
  for (const fps of [20, 30, 60, 144]) {
    player.stopMoving(); player.group.position.set(0, 0, 0); player.group.rotation.y = 0;
    input.reset(); key('keydown', 'KeyW'); key('keydown', 'KeyA');
    for (let i = 0; i < fps; i++) game.updateSimulation(1 / fps);
    assert.ok(Math.abs(player.group.rotation.y - BALANCE.player.characterTurnSpeed) < 1e-10);
    results.push(player.group.position.clone());
  }
  for (const result of results) assert.ok(result.distanceTo(results[0]) < .02, 'Curvas equivalentes entre FPS');
  const position = player.group.position.clone(), angle = player.group.rotation.y;
  game.session.paused = true; game.updateSimulation(.05);
  assert.ok(player.group.position.equals(position)); assert.equal(player.group.rotation.y, angle);
  game.session.paused = false; player.beginCutting(player.group.position.clone().add(new Vector3(0, 0, 2)));
  game.updateSimulation(.05);
  assert.ok(player.group.position.equals(position)); assert.equal(player.group.rotation.y, angle);
  player.endCutting(); input.reset();
} finally {
  if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
}

const wall = new CollisionSystem(); wall.registerObstacle({ id: 'wall', position: { x: 1, z: 0 }, width: .1, depth: 10 });
player.collisionSystem = wall;
for (const fps of [20, 30, 60, 144]) for (const dash of [false, true]) {
  player.stopMoving(); player.cooldownRemaining = 0; player.group.position.set(.43, 0, -2);
  const direction = new Vector3(1, 0, 1).normalize();
  for (let i = 0; i < fps / 2; i++) player.update(1 / fps, direction, dash && i === 0);
  assert.ok(player.group.position.x <= .43 + 1e-8); assert.ok(player.group.position.z > -1);
  assert.ok(player.velocity.length() <= player.maxSpeed * player.dashSpeedMultiplier + 1e-8);
  const before = player.group.position.clone(); player.update(.05, new Vector3(-1, 0, 0)); assert.ok(player.group.position.x < before.x);
}

const world = new Scene(), collision = new CollisionSystem({ bounds: world.collisionBounds });
world.collisionObstacles.forEach(o => collision.registerObstacle(o));
const interaction = new InteractionSystem({ stations: world.kitchen.stations.values(), collisionSystem: collision });
for (const station of world.kitchen.stations.values()) {
  const snapshot = JSON.stringify(station.collider);
  world.player.group.position.copy(station.getApproachPosition());
  world.player.group.position.addScaledVector(station.front, .45);
  assert.ok(interaction.measure(interaction.stations.get(station.id), world.player), station.id);
  world.player.group.position.copy(station.getApproachPosition()); interaction.reset(); interaction.update(.02, world.player);
  assert.equal(interaction.activeStation?.id, station.id, station.id);
  assert.equal(JSON.stringify(station.collider), snapshot);
  if (station.accessibleFront) {
    world.player.group.position.copy(station.position).addScaledVector(station.front, -station.localDimensions.depth / 2 - .72);
    interaction.reset(); interaction.update(.02, world.player); assert.notEqual(interaction.activeStation?.id, station.id);
  }
}
const isolated = new CollisionSystem();
const a = new Station({ id: 'box', position: [-1.2, 0], width: 1, depth: 1, height: 1 });
const b = new Station({ id: 'bench', position: [1.4, 0], width: 1, depth: 1, height: 1 });
let count = 0;
const selection = new InteractionSystem({ collisionSystem: isolated, carrySystem: {
  describe(station) { return { available: station === b, action: 'test' }; }, interact() { count++; return { success: true }; }
} });
selection.registerStation(a, { action: 'box' }); selection.registerStation(b, { action: 'bench' });
world.player.group.position.set(0, 0, 0); selection.update(.02, world.player, { interactPressed: true });
assert.equal(selection.activeStation?.id, b.id); assert.equal(count, 1);
selection.dispose(); isolated.dispose(); interaction.dispose(); collision.dispose(); world.dispose(); wall.dispose(); input.dispose(); player.dispose();
console.log('OK: tres modos WASD/setas, diagonal, camera fixa, frente/re, persistencia/fallback, pausa, giro A/D e setas, caminhada/dash com deslizamento em quatro FPS, alcance +30%, lados acessiveis, selecao valida unica.');
