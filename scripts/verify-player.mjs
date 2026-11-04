import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { Player } from '../src/game/Player.js';
import { Scene } from '../src/game/Scene.js';
import { Camera } from '../src/game/Camera.js';

const player = new Player();
const head = player.group.getObjectByName('white-oval-head');
assert.ok(head.scale.x > head.scale.y && head.scale.z > 0.5);
assert.ok(head.scale.x > player.group.getObjectByName('yellow-shirt').scale.x * 1.8);
assert.equal(player.group.getObjectByName('mouth'), undefined);
assert.ok(player.bow.position.x > 0);
for (const name of ['yellow-nose', 'yellow-shirt', 'overall-bib', 'overall-bottom', 'bow-knot']) {
  assert.ok(player.group.getObjectByName(name), `${name} deve existir`);
}
for (const side of [-1, 1]) {
  for (const name of ['black-eye', 'white-ear', 'white-button', 'overall-strap', 'white-hand', 'foot']) {
    assert.ok(player.group.getObjectByName(`${name}-${side}`));
  }
  for (let i = 0; i < 3; i++) assert.ok(player.group.getObjectByName(`whisker-${side}-${i}`));
}
const origin = player.group.position.clone();
player.group.updateMatrixWorld(true);
const feet = new Box3().setFromObject(player.feet);
assert.ok(Math.abs(feet.min.y) < 1e-8, 'Pés devem tocar Y=0.');
const initialArm = player.leftArm.rotation.z;
player.update(0.5);
assert.notEqual(player.leftArm.rotation.z, initialArm, 'Idle deve mover os braços.');
for (let i = 0; i < 600; i++) {
  player.update(1 / 60);
  assert.ok(new Box3().setFromObject(player.feet).equals(feet), 'Pés não devem sair do chão.');
  assert.ok(new Box3().setFromObject(player.group).min.y >= -1e-8);
  assert.ok(player.group.position.equals(origin), 'Idle não pode deslocar a personagem.');
}
const slow = new Player();
const fast = new Player();
for (let i = 0; i < 90; i++) slow.update(1 / 30);
for (let i = 0; i < 432; i++) fast.update(1 / 144);
assert.ok(Math.abs(slow.body.position.y - fast.body.position.y) < 1e-10);
assert.ok(Math.abs(slow.leftArm.rotation.z - fast.leftArm.rotation.z) < 1e-10);

const world = new Scene();
const camera = new Camera(1280, 800, world.bounds);
assert.ok(world.scene.getObjectByName('kitchen-architecture'));
assert.equal(world.scene.getObjectByName('hello-kitty'), world.player.group);
const oldTime = world.player.elapsedTime;
world.update(0.2);
assert.ok(world.player.elapsedTime > oldTime, 'Scene.update deve atualizar Player.');
for (const [width, height] of [[1280, 800], [375, 812], [812, 375]]) {
  camera.resize(width, height);
  const bounds = new Box3().setFromObject(world.player.group);
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new Vector3(x, y, z).project(camera.camera);
        assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1);
      }
    }
  }
}
let released = 0;
player.geometries.forEach((geometry) => geometry.addEventListener('dispose', () => released++));
const geometryCount = player.geometries.size;
player.dispose();
player.dispose();
assert.equal(released, geometryCount, 'Cada geometria deve ser liberada uma vez.');
slow.dispose();
fast.dispose();
world.dispose();
assert.equal(world.player.disposed, true);
console.log('OK: modelo completo, pés no chão, idle em 30/144 FPS, integração, enquadramento e limpeza.');
