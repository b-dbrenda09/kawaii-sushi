import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Camera } from '../src/game/Camera.js';
import { CollisionSystem } from '../src/game/CollisionSystem.js';
import { ControlSettings } from '../src/game/ControlSettings.js';
import { Input } from '../src/game/Input.js';
import { InteractionSystem } from '../src/game/InteractionSystem.js';
import { KitchenNavigation } from '../src/game/KitchenNavigation.js';
import { Player } from '../src/game/Player.js';
import { PLAYER_CONTROLS } from '../src/game/PlayerControls.js';
import { Scene } from '../src/game/Scene.js';

const world = new Scene({ gameMode: 'coop' });
const collisions = new CollisionSystem({ bounds: world.collisionBounds });
world.collisionObstacles.forEach(obstacle => collisions.registerObstacle(obstacle));
const [kitty, daniel] = world.players;
kitty.collisionSystem = collisions;
daniel.collisionSystem = collisions;
collisions.players = world.players;
daniel.group.position.set(0, 0, 7);
const navigation = new KitchenNavigation(collisions, kitty);
const point = (x, z) => new Vector3(x, 0, z);
const start = point(0, 2.3), goal = point(0, -2.7);
const shorterSide = (x) => {
  const origin = point(x, start.z), target = point(x, goal.z);
  const route = navigation.findRoute(origin, target);
  assert.ok(route.length >= 2);
  assert.ok(route.at(-1).equals(target));
  assert.ok(route.slice(0, -1).some(p => Math.sign(p.x) === Math.sign(x) && Math.abs(p.x) > 2.4));
  let length = origin.distanceTo(route[0]);
  route.slice(1).forEach((p, i) => { length += p.distanceTo(route[i]); });
  assert.ok(length < 7.6, `Desvio muito longo: ${length}`);
};
shorterSide(-1);
shorterSide(1);
const inside = navigation.findRoute(start, point(0, 0)).at(-1);
assert.ok(inside && Math.abs(inside.z) >= 1.7);
const outside = navigation.findRoute(start, point(500, 500)).at(-1);
assert.ok(outside.x <= navigation.bounds.maxX && outside.z <= navigation.bounds.maxZ);

const split = new CollisionSystem({ bounds: { minX: -4, maxX: 4, minZ: -4, maxZ: 4 } });
split.registerObstacle({ id: 'wall', bounds: { minX: -.1, maxX: .1, minZ: -4, maxZ: 4 } });
const fallback = new KitchenNavigation(split, kitty).findRoute(point(-2, 0), point(2, 0)).at(-1);
assert.ok(fallback.x < -.6);
const dynamic = new CollisionSystem({ bounds: split.bounds });
dynamic.players = [kitty, daniel];
daniel.group.position.set(0, 0, 0);
const detour = new KitchenNavigation(dynamic, kitty).findRoute(point(-2, 0), point(2, 0));
assert.ok(detour.length >= 2 && detour.at(-1).equals(point(2, 0)));
daniel.group.position.set(0, 0, 7);

const width = 1280, height = 800;
const camera = new Camera(width, height, world.bounds).camera;
const canvas = new EventTarget();
canvas.getBoundingClientRect = () => ({ left: 30, top: 20, right: width + 30, bottom: height + 20, width, height });
canvas.ownerDocument = { elementFromPoint: () => canvas };
let saved = 'joystick';
const settings = new ControlSettings({ storage: { getItem: () => saved, setItem: (_, value) => { saved = value; } } });
assert.equal(settings.movementMode, 'gps');
assert.equal(saved, 'gps');
const target = new EventTarget(), documentTarget = new EventTarget();
const input = new Input(camera, { target, documentTarget, player: kitty, settings, navigationCanvas: canvas,
  navigationObstacles: world.collisionObstacles, scene: world.scene, controls: PLAYER_CONTROLS.p1 });
const p2 = new Input(camera, { target, documentTarget, player: daniel, settings, controls: PLAYER_CONTROLS.p2 });
const dispatch = (type, properties) => target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), properties));
const key = (type, code, repeat = false) => dispatch(type, { code, repeat });
const aim = (position) => {
  const screen = position.clone().project(camera);
  dispatch('pointermove', { pointerType: 'mouse', clientX: 30 + (screen.x + 1) * width / 2,
    clientY: 20 + (1 - screen.y) * height / 2 });
};
let now = 0;
const steer = input.mouseNavigation.steer.bind(input.mouseNavigation);
input.mouseNavigation.steer = direction => steer(direction, now);
const frame = () => {
  now += 1000 / 60;
  kitty.update(1 / 60, input.getDirection(), input.consumeDash());
};
input.setEnabled(true);
p2.setEnabled(true);
kitty.group.position.copy(start);
aim(goal);
frame();
assert.ok(kitty.group.position.equals(start));
assert.equal(input.mouseNavigation.marker.visible, false);
key('keydown', 'KeyW');
frame();
assert.equal(input.mouseNavigation.marker.visible, true);
assert.ok(input.mouseNavigation.marker.position.clone().setY(0).distanceTo(goal) < 1e-8);
assert.equal(p2.getDirection().lengthSq(), 0);
key('keydown', 'ArrowUp');
assert.ok(p2.getDirection().equals(point(0, -1)));
key('keyup', 'ArrowUp');
let wentAround = false;
for (let i = 0; i < 320; i++) {
  frame();
  const { x, z } = kitty.group.position;
  if (Math.abs(z) < 1.2) {
    wentAround = true;
    assert.ok(Math.abs(x) > 2.4, 'Cortou a ilha');
  }
}
assert.ok(wentAround);
assert.ok(kitty.group.position.distanceTo(goal) < .09, 'Não chegou ao destino');
assert.equal(kitty.velocity.lengthSq(), 0);
aim(point(2, -2.7));
for (let i = 0; i < 16; i++) frame();
assert.ok(kitty.group.position.x > .2);
key('keydown', 'KeyE'); key('keyup', 'KeyE');
assert.equal(input.consumeInteraction(), true);
key('keydown', 'Space'); key('keyup', 'Space');
frame();
assert.ok(kitty.dashRemaining > 0);
const released = kitty.group.position.clone();
key('keyup', 'KeyW');
frame();
assert.ok(kitty.group.position.equals(released));
assert.equal(input.mouseNavigation.marker.visible, false);

key('keydown', 'KeyW');
frame();
input.setActionsBlocked(true);
key('keydown', 'KeyW', true);
assert.equal(input.getDirection().lengthSq(), 0);
input.setActionsBlocked(false);
assert.ok(input.getDirection().lengthSq() > 0);
input.setEnabled(false);
assert.equal(kitty.velocity.lengthSq(), 0);
assert.equal(input.mouseNavigation.marker.visible, false);
input.setEnabled(true);
key('keydown', 'KeyW', true);
assert.equal(input.getDirection().lengthSq(), 0);
key('keydown', 'KeyW');
frame();
dispatch('blur', {});
assert.equal(input.getDirection().lengthSq(), 0);
assert.equal(input.mouseNavigation.marker.visible, false);
aim(new Vector3(0, 1.12, 0));
key('keydown', 'KeyW');
frame();
assert.ok(input.mouseNavigation.destination.distanceTo(point(0, 0)) < 1e-8);
assert.ok(Math.abs(input.mouseNavigation.marker.position.z) >= 1.7);
const interactions = new InteractionSystem({ stations: world.kitchen.stations.values(), collisionSystem: collisions });
input.mouseNavigation.interactions = interactions;
key('keyup', 'KeyW');
kitty.group.position.copy(start);
for (const { station } of interactions.stations.values()) {
  const route = navigation.findRoute(start, station.position, p => interactions.canApproach(station, kitty, p));
  assert.ok(route.length, `Sem aproximação acessível: ${station.id}`);
  assert.ok(interactions.canApproach(station, kitty, route.at(-1)));
}
const assembly = world.kitchen.stations.get('assembly');
aim(assembly.position.clone().setY(assembly.collider.top));
key('keydown', 'KeyW');
frame();
assert.equal(input.mouseNavigation.station, assembly);
assert.equal(input.mouseNavigation.stationMarker.visible, true);
for (let i = 0; i < 240; i++) frame();
assert.equal(kitty.velocity.lengthSq(), 0);
assert.ok(interactions.canApproach(assembly, kitty, kitty.group.position));
assert.equal(interactions.update(1 / 60, kitty, { preferredStation: assembly }), null);
assert.equal(interactions.activeStation, assembly);
key('keydown', 'KeyE');
key('keyup', 'KeyE');
assert.equal(interactions.update(1 / 60, kitty, {
  preferredStation: assembly, interactPressed: input.consumeInteraction(),
})?.stationId, assembly.id);
aim(goal);
frame();
assert.equal(input.mouseNavigation.station, null);
assert.equal(input.mouseNavigation.stationMarker.visible, false);
interactions.dispose();
input.dispose();
assert.equal(input.mouseNavigation.marker.parent, null);
p2.dispose();
world.dispose();
console.log('OK: GPS, raycasting, destinos, ilha nos dois sentidos, bloqueios, chegada, dash, E, pausa e independência do P2.');
