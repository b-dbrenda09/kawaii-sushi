import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Input } from '../src/game/Input.js';
import { Player } from '../src/game/Player.js';
import { Camera } from '../src/game/Camera.js';

const camera = new Camera(1280, 800).camera;
const target = new EventTarget();
const documentTarget = new EventTarget();
const input = new Input(camera, { target, documentTarget });
input.setEnabled(true);
function key(type, code, extra = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { code, ...extra });
  target.dispatchEvent(event);
  return event;
}
const directions = new Map();
for (const [code, axis, sign] of [
  ['KeyW', 'z', -1], ['ArrowUp', 'z', -1], ['KeyS', 'z', 1], ['ArrowDown', 'z', 1],
  ['KeyA', 'x', -1], ['ArrowLeft', 'x', -1], ['KeyD', 'x', 1], ['ArrowRight', 'x', 1],
]) {
  input.reset();
  assert.ok(key('keydown', code).defaultPrevented);
  const direction = input.getDirection().clone();
  directions.set(code, direction);
  assert.equal(direction[axis], sign, `${code} deve seguir o eixo fixo da cozinha.`);
  assert.equal(Math.abs(direction[axis === 'x' ? 'z' : 'x']), 0);
  assert.ok(Math.abs(direction.length() - 1) < 1e-10);
  assert.equal(direction.y, 0);
  key('keyup', code);
  assert.equal(input.getDirection().length(), 0);
}
input.reset();
key('keydown', 'KeyW'); key('keydown', 'KeyD');
const diagonal = input.getDirection().clone();
assert.ok(Math.abs(diagonal.length() - 1) < 1e-10);
key('keydown', 'ArrowUp');
assert.ok(input.getDirection().equals(diagonal), 'W+seta para cima não devem duplicar a entrada.');
key('keydown', 'KeyS'); key('keydown', 'ArrowDown'); key('keydown', 'KeyA');
assert.equal(input.getDirection().length(), 0, 'Direções opostas se cancelam.');

input.reset(); key('keydown', 'KeyW');
input.onBlur({ target: new EventTarget() });
assert.ok(input.getDirection().equals(directions.get('KeyW')), 'Foco de elementos informativos não deve limpar o teclado da janela.');
for (const event of ['blur', 'visibilitychange']) {
  input.reset(); key('keydown', 'KeyW');
  (event === 'blur' ? target : documentTarget).dispatchEvent(new Event(event));
  assert.equal(input.getDirection().length(), 0);
}
input.reset();
assert.equal(key('keydown', 'KeyW', { ctrlKey: true }).defaultPrevented, false);
assert.equal(input.getDirection().length(), 0);

// A orientação da câmera não pode mudar nenhum dos oito controles.
for (const position of [[-24, 24, 24], [24, 24, -24], [-24, 24, -24]]) {
  camera.position.set(...position); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  for (const [code, expected] of directions) {
    input.reset(); key('keydown', code);
    assert.ok(input.getDirection().equals(expected), `${code} deve independer da câmera.`);
  }
}
input.dispose();
input.dispose();
key('keydown', 'KeyW');
assert.equal(input.keys.size, 0, 'Dispose deve remover os listeners.');

const players = [];
const create = (options) => { const player = new Player(options); players.push(player); return player; };
function advance(player, direction, seconds, fps) {
  for (let i = 0; i < Math.round(seconds * fps); i++) player.update(1 / fps, direction);
}
const forward = directions.get('KeyW');
const slow = create(); const fast = create();
const slowOrigin = slow.group.position.clone();
advance(slow, forward, 2, 30); advance(fast, forward, 2, 144);
assert.ok(slow.group.position.distanceTo(fast.group.position) < 1e-9, 'Distância deve independer do FPS.');
assert.ok(slow.velocity.distanceTo(fast.velocity) < 1e-9);
assert.ok(slow.velocity.length() <= slow.maxSpeed + 1e-10);
const diagonalPlayer = create();
advance(diagonalPlayer, diagonal, 2, 60);
assert.ok(Math.abs(diagonalPlayer.group.position.distanceTo(slowOrigin)
  - slow.group.position.distanceTo(slowOrigin)) < 1e-9, 'Diagonal não pode ser mais rápida.');

const moving = create();
moving.update(1 / 60, forward);
assert.ok(moving.velocity.length() > 0 && moving.velocity.length() < moving.maxSpeed);
const firstSpeed = moving.velocity.length();
moving.update(1 / 60, forward);
assert.ok(moving.velocity.length() > firstSpeed, 'Aceleração deve ser gradual.');
const beforeBrake = moving.velocity.length();
const beforePosition = moving.group.position.clone();
moving.update(1 / 60);
assert.ok(moving.velocity.length() > 0 && moving.velocity.length() < beforeBrake);
assert.ok(moving.group.position.distanceTo(beforePosition) > 0, 'Frenagem não pode ser instantânea.');
advance(moving, null, 2, 60);
assert.equal(moving.velocity.length(), 0);
const stopped = moving.group.position.clone();
moving.update(1 / 60);
assert.ok(moving.group.position.equals(stopped), 'Parada não pode causar deriva.');

const rotating = create({ rotation: Math.PI - 0.05 });
const turn = new Vector3(Math.sin(-Math.PI + 0.05), 0, Math.cos(-Math.PI + 0.05));
rotating.update(1 / 60, turn);
assert.ok(rotating.group.rotation.y > Math.PI - 0.05, 'Rotação deve cruzar ±PI pelo arco mais curto.');
assert.ok(rotating.group.rotation.y < Math.PI + 0.05, 'Rotação deve ser gradual.');
advance(rotating, turn, 1, 60);
assert.ok(Math.abs(Math.atan2(Math.sin(rotating.group.rotation.y + Math.PI - 0.05),
  Math.cos(rotating.group.rotation.y + Math.PI - 0.05))) < 1e-4);
assert.equal(rotating.group.rotation.x, 0);
assert.equal(rotating.group.rotation.z, 0);
assert.equal(rotating.body.rotation.z, 0);
assert.equal(rotating.group.position.y, 0);

const stalled = create(); const capped = create();
stalled.update(30, forward); capped.update(0.05, forward);
assert.ok(stalled.group.position.equals(capped.group.position), 'DeltaTime deve ser limitado a 50ms.');
const safePosition = stalled.group.position.clone();
for (const invalid of [-1, NaN, Infinity]) stalled.update(invalid, forward);
assert.ok(stalled.group.position.equals(safePosition));
stalled.stopMoving();
assert.equal(stalled.velocity.length(), 0);
players.forEach((player) => player.dispose());
console.log('OK: WASD/setas nos eixos fixos X/Z, independência da câmera, diagonal, aceleração/frenagem, 30/144 FPS, rotação Y, foco e deltaTime.');
