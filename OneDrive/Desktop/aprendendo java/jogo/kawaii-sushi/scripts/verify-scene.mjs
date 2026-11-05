import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Scene } from '../src/game/Scene.js';
import { Camera } from '../src/game/Camera.js';

const world = new Scene();
assert.equal(world.cube, undefined);
assert.equal(world.dimensions.width, 18);
assert.equal(world.dimensions.depth, 14);
for (const name of ['floor-foundation', 'back-wall', 'left-wall', 'right-low-wall']) {
  assert.ok(world.scene.getObjectByName(name), `${name} deve existir`);
}
assert.ok(world.scene.children.some((object) => object.isAmbientLight));
assert.ok(world.scene.children.some((object) => object.isDirectionalLight));
world.update(1 / 60);

const camera = new Camera(1920, 1080, world.bounds);
for (const [width, height] of [[1920, 1080], [1280, 720], [375, 812], [812, 375], [768, 1024]]) {
  camera.resize(width, height);
  const lens = camera.camera;
  assert.ok(Math.abs((lens.right - lens.left) / (lens.top - lens.bottom) - width / height) < 1e-10);
  for (const x of [world.bounds.min.x, world.bounds.max.x]) {
    for (const y of [world.bounds.min.y, world.bounds.max.y]) {
      for (const z of [world.bounds.min.z, world.bounds.max.z]) {
        const point = new Vector3(x, y, z).project(lens);
        assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1,
          `Cenário deve caber na câmera em ${width}x${height}`);
      }
    }
  }
}
let geometriesDisposed = 0;
const materials = new Set();
world.scene.traverse((object) => {
  object.geometry?.addEventListener('dispose', () => geometriesDisposed++);
  if (object.material) materials.add(object.material);
});
let materialsDisposed = 0;
materials.forEach((material) => material.addEventListener('dispose', () => materialsDisposed++));
world.dispose();
assert.ok(geometriesDisposed > 0);
assert.equal(materialsDisposed, materials.size);
assert.equal(world.scene.children.length, 0);
console.log('OK: arquitetura, ausência do cubo, iluminação, enquadramento em cinco resoluções e limpeza de recursos.');
