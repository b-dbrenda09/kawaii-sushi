import assert from 'node:assert/strict';
import { Group, PerspectiveCamera, Vector3 } from 'three';
import { Scene } from '../src/game/Scene.js';
import { Station } from '../src/game/Station.js';
import { Input } from '../src/game/Input.js';
import { CollisionSystem } from '../src/game/CollisionSystem.js';
import { InteractionSystem } from '../src/game/InteractionSystem.js';
import { IngredientFactory } from '../src/game/IngredientFactory.js';
import { CarrySystem } from '../src/game/CarrySystem.js';
import { RiceCookerSystem } from '../src/game/RiceCookerSystem.js';
import { RiceCookerEffects } from '../src/game/RiceCookerEffects.js';

const world = new Scene();
const player = world.player;
const stations = world.kitchen.stations;
const station = stations.get('riceCooker');
const originalPosition = station.position.clone();
const originalCollider = JSON.stringify(station.collider);
const originalBody = station.model.getObjectByName('rice-cooker-body');
const originalLid = station.model.getObjectByName('rice-cooker-lid');
const lidPosition = originalLid.position.clone();
const originalPanel = station.model.getObjectByName('rice-cooker-display').material;
const sharedColor = world.kitchen.materials.dark.color.getHex();
const factory = new IngredientFactory();
const carry = new CarrySystem({ player, stations, factory });
const effects = new RiceCookerEffects(station);
const cooker = new RiceCookerSystem({ station, carrySystem: carry, factory, effects });
const collision = new CollisionSystem({ bounds: world.collisionBounds });
world.collisionObstacles.forEach((obstacle) => collision.registerObstacle(obstacle));
player.collisionSystem = collision;
const ui = { action: '', message: '', render(active, message) { this.action = active?.action; this.message = message; } };
const interaction = new InteractionSystem({ stations: stations.values(), collisionSystem: collision, carrySystem: carry, ui });
const target = new EventTarget();
const input = new Input(new PerspectiveCamera(), { target, documentTarget: new EventTarget() });
input.setEnabled(true);
const key = (type, repeat = false) => {
  const event = new Event(type, { cancelable: true }); Object.assign(event, { code: 'KeyE', repeat }); target.dispatchEvent(event);
};
function frame(dt = 0, direction = null, dash = false) {
  const wasDashing = player.dashRemaining > 0;
  cooker.update(dt);
  player.update(Math.min(Math.max(dt, 0), 0.05), direction, dash);
  return interaction.update(Math.min(Math.max(dt, 0), 0.05), player,
    { interactPressed: input.consumeInteraction(), disabled: wasDashing });
}
function approach(id) {
  player.stopMoving(); input.reset();
  player.group.position.copy(stations.get(id).getApproachPosition());
  interaction.reset(); frame();
  assert.equal(interaction.activeStation?.id, id);
}
function act(id, kind) {
  approach(id); key('keydown'); const event = frame(); key('keyup');
  assert.equal(event.kind, kind); return event;
}
assert.equal(cooker.state, 'EMPTY');
assert.equal(station.behavior, cooker);
assert.equal(cooker.content, null);
assert.equal(factory.instances.size, 0);
assert.throws(() => cooker.transition('READY'));
assert.throws(() => cooker.transition('LOADED'), 'Sem arroz, nem a transição de carregamento é válida.');
assert.equal(cooker.state, 'EMPTY');
approach('riceCooker'); assert.equal(ui.action, 'Panela vazia');
assert.equal(act('riceCooker', 'unavailable').success, false);

for (const [box, type] of [['salmonBox', 'salmon'], ['cucumberBox', 'cucumber'], ['noriBox', 'nori']]) {
  act(box, 'pickup');
  const held = carry.carriedIngredient;
  assert.equal(act('riceCooker', 'unavailable').success, false);
  assert.equal(carry.carriedIngredient, held);
  assert.equal(held.type, type);
  assert.equal(cooker.state, 'EMPTY');
  assert.ok(ui.message.includes('arroz cru'));
  act(box, 'return');
}
const preCooked = factory.create('rice', 'rice_cooked');
carry.attach(preCooked);
assert.equal(act('riceCooker', 'unavailable').success, false);
assert.equal(preCooked.state, 'rice_cooked');
act('trash', 'discard');

act('riceBox', 'pickup');
const rice = carry.carriedIngredient;
const originalId = rice.instanceId;
const rawGeometry = rice.model.getObjectByName('raw-rice-bed').geometry;
approach('riceCooker');
assert.equal(ui.action, 'Colocar arroz');
key('keydown');
assert.equal(frame().kind, 'load-rice');
assert.equal(cooker.state, 'LOADED');
assert.equal(carry.carriedIngredient, null);
assert.equal(player.carryAnchor.children.length, 0);
assert.equal(cooker.content, rice);
assert.equal(rice.model.parent, cooker.contentAnchor);
assert.equal(rice.location, 'cooker');
assert.equal(rice.ownerId, 'riceCooker');
assert.equal(factory.instances.size, 1);
assert.equal(ui.action, 'Iniciar cozimento');
for (let i = 0; i < 30; i++) { key('keydown', true); frame(0.2); }
assert.equal(cooker.state, 'LOADED', 'O mesmo E não deve carregar e iniciar simultaneamente.');
assert.equal(cooker.elapsed, 0);
key('keyup');
assert.equal(effects.mound.visible, true);
act('riceBox', 'pickup');
const extraRaw = carry.carriedIngredient;
assert.equal(cooker.load().success, false);
assert.equal(carry.carriedIngredient, extraRaw);
assert.equal(cooker.content, rice);
act('riceBox', 'return');
act('riceCooker', 'start-cooking');
assert.equal(cooker.state, 'COOKING');
assert.equal(cooker.elapsed, 0);
assert.equal(ui.action, 'Cozinhando...');
assert.equal(cooker.start().success, false);
assert.equal(cooker.retrieve().success, false);
player.group.position.copy(world.kitchen.spawnPosition); player.stopMoving(); player.cooldownRemaining = 0;
const movementOrigin = player.group.position.clone();
for (let i = 0; i < 60; i++) frame(1 / 60, new Vector3(1, 0, 0), i === 15);
assert.ok(player.group.position.distanceTo(movementOrigin) > 4, 'É possível andar e usar dash durante o cozimento.');
cooker.update(1);
assert.ok(Math.abs(cooker.progress - 0.25) < 1e-8);
assert.equal(effects.particles.filter(({ mesh }) => mesh.visible).length, 5);
assert.equal(effects.led.visible, true);
assert.ok(effects.panel.material.emissiveIntensity > 0);
assert.equal(world.kitchen.materials.dark.color.getHex(), sharedColor, 'A luz da panela não deve alterar materiais compartilhados da cozinha.');
const beforeRepeatedE = cooker.elapsed;
for (let i = 0; i < 15; i++) assert.equal(act('riceCooker', 'unavailable').success, false);
assert.equal(cooker.elapsed, beforeRepeatedE);
assert.equal(cooker.content, rice);
act('riceBox', 'pickup');
const blockedRaw = carry.carriedIngredient;
assert.equal(act('riceCooker', 'unavailable').success, false);
assert.equal(carry.carriedIngredient, blockedRaw);
assert.equal(cooker.content, rice);
assert.equal(factory.instances.size, 2);
cooker.update(5.99);
assert.equal(cooker.state, 'COOKING');
cooker.update(0.01);
assert.equal(cooker.state, 'READY');
assert.ok(Math.abs(cooker.burnRemaining - 12) < 1e-8);
assert.equal(rice.instanceId, originalId);
assert.equal(rice.state, 'rice_cooked');
assert.equal(rice.name, 'Arroz cozido');
assert.ok(rice.model.getObjectByName('cooked-rice-mound'));
assert.equal(rice.model.getObjectByName('raw-rice-bed'), undefined);
assert.equal(blockedRaw.state, 'rice_raw');
assert.equal(blockedRaw.model.getObjectByName('raw-rice-bed').geometry, rawGeometry, 'O modelo do arroz cru permanece disponível e intacto.');
assert.equal(effects.glow.visible, true);
assert.equal(effects.particles.some(({ mesh }) => mesh.visible), false);
assert.equal(act('riceCooker', 'unavailable').success, false);
assert.equal(ui.message, 'Mãos ocupadas');
assert.equal(ui.action, 'Mãos ocupadas');
cooker.update(3);
assert.ok(Math.abs(cooker.burnRemaining - 9) < 1e-8);
assert.equal(act('riceCooker', 'unavailable').success, false);
assert.ok(Math.abs(cooker.burnRemaining - 9) < 1e-8);
act('trash', 'discard');
act('riceCooker', 'take-cooked-rice');
assert.equal(carry.carriedIngredient, rice);
assert.equal(rice.model.visible, true);
assert.equal(rice.model.parent, player.carryAnchor);
assert.equal(cooker.content, null);
assert.equal(cooker.state, 'EMPTY');
assert.equal(cooker.elapsed, 0);
assert.equal(cooker.contentAnchor.children.length, 0);
assert.equal(cooker.retrieve().success, false);
assert.equal(act('riceCooker', 'unavailable').success, false, 'Arroz cozido não pode ser colocado para cozinhar outra vez.');
assert.equal(carry.carriedIngredient, rice);
act('assembly', 'place');
cooker.update(100);
assert.equal(stations.get('assembly').storedIngredient.state, 'rice_cooked');
act('assembly', 'retrieve');
assert.equal(carry.carriedIngredient.instanceId, originalId);
player.group.position.copy(world.kitchen.spawnPosition); player.stopMoving(); player.cooldownRemaining = 0;
for (let i = 0; i < 30; i++) {
  frame(1 / 60, new Vector3(-1, 0, 0), i === 0);
  assert.equal(rice.model.parent, player.carryAnchor);
  assert.ok(rice.model.getWorldPosition(new Vector3()).distanceTo(player.carryAnchor.getWorldPosition(new Vector3())) < 1e-8);
}
act('riceBox', 'return');
assert.equal(factory.instances.size, 0);
assert.equal(effects.led.visible, false);
assert.equal(effects.mound.visible, false);

act('riceBox', 'pickup'); act('riceCooker', 'load-rice'); act('riceCooker', 'start-cooking');
const burntRice = cooker.content;
cooker.update(19.999);
assert.equal(cooker.state, 'READY');
assert.ok(Math.abs(cooker.burnRemaining - 0.001) < 1e-8);
cooker.update(0.001);
assert.equal(cooker.state, 'BURNT');
assert.equal(burntRice.state, 'rice_burnt');
assert.equal(burntRice.name, 'Arroz queimado');
assert.ok(burntRice.model.getObjectByName('burnt-rice-mound'));
assert.equal(cooker.retrieve().success, false);
assert.equal(carry.carriedIngredient, null);
assert.equal(cooker.elapsed, 0);
cooker.update(50);
assert.equal(cooker.state, 'BURNT');
assert.equal(cooker.elapsed, 0);
assert.equal(effects.mound.material.color.getHexString(), '645149');
assert.equal(effects.particles.filter(({ mesh }) => mesh.visible).length, 5);
act('salmonBox', 'pickup');
const heldSalmon = carry.carriedIngredient;
approach('riceCooker'); assert.equal(ui.action, 'Descartar arroz queimado');
act('riceCooker', 'discard-burnt-rice');
assert.equal(carry.carriedIngredient, heldSalmon, 'Limpar a panela não deve descartar o objeto das mãos.');
assert.equal(burntRice.disposed, true);
assert.equal(burntRice.model.parent, null);
assert.equal(cooker.state, 'EMPTY');
assert.equal(effects.particles.some(({ mesh }) => mesh.visible), false);
assert.equal(effects.glow.visible, false);
assert.equal(effects.led.visible, false);
assert.equal(effects.lidPivot.rotation.x, 0);
act('trash', 'discard');
// Novo ciclo depois da limpeza não utiliza conteúdo, progresso ou temporizador antigos.
act('riceBox', 'pickup'); act('riceCooker', 'load-rice'); act('riceCooker', 'start-cooking');
assert.equal(cooker.elapsed, 0);
cooker.update(8);
assert.equal(cooker.state, 'READY');
assert.equal(cooker.burnRemaining, 12);
act('riceCooker', 'take-cooked-rice'); act('trash', 'discard');
assert.equal(factory.instances.size, 0);
assert.ok(station.position.equals(originalPosition));
assert.equal(JSON.stringify(station.collider), originalCollider);
assert.equal(station.model.getObjectByName('rice-cooker-body'), originalBody);
assert.equal(station.model.getObjectByName('rice-cooker-lid'), originalLid);
assert.equal(player.maxSpeed, 4.2);
assert.equal(player.dashDuration, 0.18);
assert.equal(player.dashCooldown, 0.65);

// Relógio independente do limite de movimento de 50 ms e consistente com FPS variáveis.
function timerFixture() {
  const factory = new IngredientFactory();
  const station = new Station({ id: 'riceCooker', position: [0, 0], width: 2.5, depth: 1.55, height: 1.92 });
  const player = { carryAnchor: new Group(), state: 'idle', dashRemaining: 0 };
  const carry = new CarrySystem({ player, stations: new Map([['riceCooker', station]]), factory });
  carry.attach(factory.create('rice'));
  const cooker = new RiceCookerSystem({ station, carrySystem: carry, factory });
  cooker.load(); cooker.start();
  return { factory, carry, cooker, dispose() { cooker.dispose(); carry.dispose(); factory.dispose(); } };
}
for (const fps of [1, 5, 15, 30, 60, 144, null]) {
  const fixture = timerFixture();
  let ticks = 0;
  const advance = (seconds) => {
    let time = 0;
    while (time < seconds - 1e-10) {
      const dt = Math.min(fps ? 1 / fps : [0.007, 0.24, 0.016, 0.4, 0.08][ticks++ % 5], seconds - time);
      fixture.cooker.update(dt); time += dt;
    }
  };
  advance(4); assert.equal(fixture.cooker.state, 'COOKING'); assert.ok(Math.abs(fixture.cooker.progress - 0.5) < 1e-8);
  advance(4); assert.equal(fixture.cooker.state, 'READY'); assert.ok(Math.abs(fixture.cooker.burnRemaining - 12) < 1e-8);
  advance(11.5); assert.equal(fixture.cooker.state, 'READY');
  advance(0.5); assert.equal(fixture.cooker.state, 'BURNT');
  assert.equal(fixture.factory.instances.size, 1);
  fixture.dispose(); assert.equal(fixture.factory.instances.size, 0);
}
const stalled = timerFixture();
for (const dt of [-1, NaN, Infinity]) stalled.cooker.update(dt);
assert.equal(stalled.cooker.elapsed, 0);
stalled.cooker.update(25);
assert.equal(stalled.cooker.state, 'BURNT', 'Excedente do quadro deve atravessar READY e chegar a BURNT corretamente.');
assert.equal(stalled.factory.instances.size, 1);
stalled.dispose();
// Descarte da cena durante um cozimento ativo remove conteúdo e recursos uma única vez.
act('riceBox', 'pickup'); act('riceCooker', 'load-rice'); act('riceCooker', 'start-cooking');
const resources = [...effects.geometries, ...effects.materials];
const disposed = new Map();
resources.forEach((resource) => resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1)));
cooker.dispose(); cooker.dispose();
assert.equal(factory.instances.size, 0);
assert.equal(station.behavior, null);
assert.equal(station.model.getObjectByName('rice-cooker-content'), undefined);
assert.equal(station.model.getObjectByName('rice-cooker-effects'), undefined);
assert.equal(station.model.getObjectByName('rice-cooker-display').material, originalPanel);
assert.ok(originalLid.position.distanceTo(lidPosition) < 1e-9);
for (const resource of resources) assert.equal(disposed.get(resource), 1);
input.dispose(); interaction.dispose(); carry.dispose(); factory.dispose(); collision.dispose(); world.dispose();
console.log('OK: EMPTY/LOADED/COOKING/READY/BURNT, E separado, 8s + 12s, 1/5/15/30/60/144 FPS e variações, validação, mãos ocupadas, mesma instância cozida, vapor/fumaça/luz, descarte/reinício, movimento/dash e limpeza.');
