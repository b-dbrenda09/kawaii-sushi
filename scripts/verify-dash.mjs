import assert from 'node:assert/strict';
import { Box3, Vector3, PerspectiveCamera } from 'three';
import { Player } from '../src/game/Player.js';
import { Input } from '../src/game/Input.js';

const target = new EventTarget();
const input = new Input(new PerspectiveCamera(), { target, documentTarget: new EventTarget() });
input.setEnabled(true);
function key(type, code, repeat = false) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { code, repeat });
  target.dispatchEvent(event);
}
key('keydown', 'Space');
assert.equal(input.consumeDash(), false);
key('keyup', 'Space');
key('keydown', 'KeyW');
for (const code of ['ShiftLeft', 'ShiftRight']) { key('keydown', code); assert.equal(input.consumeDash(), false); key('keyup', code); }
for (const shift of ['Space']) {
  key('keydown', shift);
  assert.equal(input.consumeDash(), true);
  assert.equal(input.consumeDash(), false);
  key('keydown', shift, true);
  assert.equal(input.consumeDash(), false);
  key('keyup', shift);
}
target.dispatchEvent(new Event('blur'));
assert.equal(input.getDirection().length(), 0);
assert.equal(input.consumeDash(), false);
input.dispose();

const players = [];
const create = (options) => { const p = new Player(options); players.push(p); return p; };
const forward = new Vector3(0, 0, 1);
const p = create();
p.update(0.01, null, true);
assert.equal(p.dashRemaining, 0);
p.update(0.01, forward, true);
assert.equal(p.state, 'dashing');
assert.equal(p.velocity.length(), p.maxSpeed * p.dashSpeedMultiplier);
const lockedX = p.group.position.x;
p.update(0.05, new Vector3(1, 0, 0));
assert.equal(p.group.position.x, lockedX);
for (let i = 0; i < 13; i++) p.update(0.01, forward);
assert.equal(p.state, 'walking');
p.update(0.01, forward, true);
assert.equal(p.dashRemaining, 0, 'Cooldown deve rejeitar outra ativação.');
for (let i = 0; i < 50; i++) p.update(0.01, forward);
p.update(0.01, forward, true);
assert.equal(p.state, 'dashing');

const straight = create();
const diagonal = create();
const origins = [straight, diagonal].map((v) => v.group.position.clone());
straight.update(0.05, forward, true);
diagonal.update(0.05, new Vector3(1, 0, 1), true);
assert.ok(Math.abs(straight.group.position.distanceTo(origins[0]) - diagonal.group.position.distanceTo(origins[1])) < 1e-10);
const bounded = create({ position: new Vector3(0.99, 0, 0), movementBounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 } });
bounded.update(10, new Vector3(1, 0, 1), true);
assert.ok(Math.abs(bounded.group.position.x - 1) < 1e-8, 'Contato respeita a pequena margem de separação.');
assert.ok(bounded.group.position.z > 0 && bounded.group.position.z <= 1);
assert.equal(bounded.velocity.x, 0);
const distances = [];
for (const fps of [30, 60, 144]) {
  const timed = create();
  const origin = timed.group.position.clone();
  let elapsed = 0;
  while (elapsed < timed.dashDuration - 1e-10) {
    const dt = Math.min(1 / fps, timed.dashDuration - elapsed);
    timed.update(dt, forward, elapsed === 0);
    elapsed += dt;
  }
  assert.ok(timed.dashRemaining < 1e-8);
  distances.push(timed.group.position.distanceTo(origin));
}
assert.ok(distances.every((distance) => Math.abs(distance - p.maxSpeed * p.dashSpeedMultiplier * p.dashDuration) < 1e-8));

const walking = create();
for (let i = 0; i < 120; i++) {
  walking.update(1 / 60, forward);
  assert.ok(new Box3().setFromObject(walking.feet).min.y >= -1e-8);
  assert.ok(Math.abs(walking.leftArm.rotation.z) < 0.15, 'Braços devem permanecer relaxados.');
}
assert.ok(Math.abs(walking.leftArm.rotation.x) > 0.01);
assert.ok(walking.leftArm.rotation.x * walking.leftLeg.rotation.x < 0);
assert.ok(walking.leftArm.rotation.x * walking.rightLeg.rotation.x > 0);
for (let i = 0; i < 240; i++) walking.update(1 / 60);
assert.equal(walking.state, 'idle');
assert.ok(Math.abs(walking.leftArm.rotation.x) < 1e-7);
for (let i = 0; i < 60; i++) p.update(1 / 60);
assert.ok(p.trails.every(({ mesh }) => !mesh.visible));
p.stopMoving();
assert.equal(p.dashRemaining, 0);
players.forEach((v) => v.dispose());
console.log('OK: Space, Shift desativado, repetição, foco, duração, cooldown, direção fixa, diagonal, limites, pivôs, chão, idle e rastros.');
