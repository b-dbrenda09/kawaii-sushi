import assert from 'node:assert/strict';
import { Box3, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { Scene } from '../src/game/Scene.js';
import { Camera } from '../src/game/Camera.js';
import { CAMERA_CONFIG } from '../src/game/CameraConfig.js';
import { CustomerSystem } from '../src/game/CustomerSystem.js';
import { Input } from '../src/game/Input.js';
import { MOVEMENT_MODES } from '../src/game/ControlSettings.js';

const sizes = [[1920, 1080], [1440, 1000], [1280, 720], [375, 812], [390, 844], [812, 375], [768, 1024]];
for (const mode of ['solo', 'coop']) {
  const world = new Scene({ gameMode: mode });
  const customers = new CustomerSystem({ scene: world.scene, delivery: world.kitchen.stations.get('delivery'), architecture: world.architecture });
  const bounds = world.bounds.clone().union(customers.bounds);
  const rig = new Camera(1440, 1000, bounds), camera = rig.camera;
  assert.ok(camera.isOrthographicCamera);
  const direction = camera.getWorldDirection(new Vector3());
  assert.ok(Math.abs(direction.x) < 1e-10);
  assert.ok(Math.abs(Math.atan2(-direction.y, -direction.z) * 180 / Math.PI - 55) < 1e-9);
  assert.equal(camera.position.x, rig.target.x);
  assert.ok(camera.position.z > rig.target.z && camera.position.y > rig.target.y);
  const left = new Vector3(-4, 1.2, 0).project(camera), right = new Vector3(4, 1.2, 0).project(camera);
  assert.ok(Math.abs(left.y - right.y) < 1e-10 && left.x < right.x);
  for (const angle of [45, 55, 60]) for (const zoom of [.85, 1, 1.1, CAMERA_CONFIG.zoom]) {
    rig.configure({ inclination: angle, zoom });
    assert.equal(rig.camera, camera, 'Inputs and raycasters retain the same camera instance');
    for (const [width, height] of sizes) {
      rig.resize(width, height);
      const center = bounds.getCenter(new Vector3()).project(camera);
      assert.ok(Math.abs(center.x) < 1e-10 && Math.abs(center.y) < 1e-10,
        `Geometry remains at the full canvas center at ${width}x${height}`);
      assert.equal(camera.left, -camera.right); assert.equal(camera.bottom, -camera.top);
      const span = camera.right - camera.left;
      rig.resize(width, height); rig.resize(width, height);
      assert.equal(camera.right - camera.left, span, 'Resizing must not accumulate zoom');
      assert.ok(Math.abs((camera.right - camera.left) / (camera.top - camera.bottom) - width / height) < 1e-10);
      const visible = point => {
        point.project(camera);
        const x = (point.x + 1) * width / 2, y = (1 - point.y) * height / 2;
        assert.ok(x >= rig.insets.left - 1e-7 && x <= width - rig.insets.right + 1e-7);
        assert.ok(y >= rig.insets.top - 1e-7 && y <= height - rig.insets.bottom + 1e-7);
        assert.ok(Math.abs(point.z) < 1);
      };
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) visible(new Vector3(x, y, z));
      if (angle === 55 && zoom === 1) {
        const projectedBounds = new Box3();
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) projectedBounds.expandByPoint(new Vector3(x, y, z).project(camera));
        const size = projectedBounds.getSize(new Vector3());
        assert.ok(Math.abs(Math.max(size.y / 2 / .85, size.x / 2 / .94) - 1) < 1e-9,
          'Default framing fills 85% of height or 94% of width, whichever limits first');
      }
      for (const player of world.players) {
        assert.deepEqual(player.group.scale.toArray(), [.8, .8, .8]);
        const playerBounds = new Box3().setFromObject(player.group);
        visible(playerBounds.min.clone()); visible(playerBounds.max.clone());
      }
      const raycaster = new Raycaster(), plane = new Plane(new Vector3(0, 1, 0), 0);
      for (const station of world.kitchen.stations.values()) {
        const point = station.getApproachPosition().setY(0), projected = point.clone().project(camera);
        raycaster.setFromCamera(new Vector2(projected.x, projected.y), camera);
        const hit = raycaster.ray.intersectPlane(plane, new Vector3());
        assert.ok(hit && hit.distanceTo(point) < 1e-8, 'Mouse projection reaches the same station approach point');
      }
    }
  }
  rig.configure({ inclination: 55, zoom: 1 }); rig.resize(1280, 800);
  const target = new EventTarget();
  const input = new Input(camera, { target, documentTarget: new EventTarget(), settings: { movementMode: MOVEMENT_MODES.CAMERA } });
  input.setEnabled(true);
  for (const [codes, axis, sign] of [
    [['KeyW', 'ArrowUp'], 'y', 1], [['KeyS', 'ArrowDown'], 'y', -1],
    [['KeyA', 'ArrowLeft'], 'x', -1], [['KeyD', 'ArrowRight'], 'x', 1],
  ]) for (const code of codes) {
    input.reset(); input.keys.add(code);
    const origin = new Vector3().project(camera);
    const moved = input.getDirection().clone().project(camera);
    assert.ok((moved[axis] - origin[axis]) * sign > 0, `${code} matches its screen direction`);
  }
  input.dispose();
  rig.configure({ inclination: 55, zoom: 1 });
  const previousSpan = camera.right - camera.left;
  rig.configure({ zoom: CAMERA_CONFIG.zoom });
  assert.ok(camera.right - camera.left < previousSpan, 'The new default must make the scene visibly larger');
  assert.ok(rig.effectiveZoom <= 1.15 && rig.effectiveZoom > 1);
  rig.configure({ inclination: 90, zoom: 99 });
  assert.equal(rig.settings.inclination, CAMERA_CONFIG.maxInclination); assert.equal(rig.settings.zoom, CAMERA_CONFIG.maxZoom);
  rig.configure({ height: 24, frontDistance: 24 }); assert.equal(rig.settings.inclination, 45);
  rig.configure({ inclination: 55 }); assert.equal(rig.settings.height, null);
  const shifted = bounds.clone().translate(new Vector3(13, 2, -9));
  const shiftedRig = new Camera(1280, 720, shifted);
  assert.ok(shiftedRig.target.equals(shifted.getCenter(new Vector3())));
  const shiftedCenter = shiftedRig.target.clone().project(shiftedRig.camera);
  assert.ok(Math.abs(shiftedCenter.x) < 1e-10 && Math.abs(shiftedCenter.y) < 1e-10,
    'Centering follows translated geometry instead of world origin');
  customers.dispose(); world.dispose();
}
console.log('OK: frontal orthographic camera at 55 degrees, no diagonal/roll, horizontal counters, real bounds including customers, solo/coop, 7 sizes, 45/55/60 degrees, safe zoom, WASD/arrows and ground raycasting.');
