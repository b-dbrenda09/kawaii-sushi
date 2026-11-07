import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { Input } from '../src/game/Input.js';
import { Scene } from '../src/game/Scene.js';
import { Station } from '../src/game/Station.js';
import { CollisionSystem } from '../src/game/CollisionSystem.js';
import { InteractionSystem, STATION_INTERACTIONS } from '../src/game/InteractionSystem.js';

const target = new EventTarget();
const documentTarget = new EventTarget();
const input = new Input(new PerspectiveCamera(), { target, documentTarget });
input.setEnabled(true);
const key = (type, code = 'KeyE', extra = {}) => {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { code, ...extra });
  target.dispatchEvent(event);
  return event;
};
assert.equal(key('keydown').defaultPrevented, true);
assert.equal(input.consumeInteraction(), true);
assert.equal(input.consumeInteraction(), false);
key('keydown', 'KeyE', { repeat: true });
key('keydown');
assert.equal(input.consumeInteraction(), false, 'Segurar E não gera novos pressionamentos.');
key('keyup'); key('keydown');
assert.equal(input.consumeInteraction(), true);
for (const type of ['blur', 'visibilitychange']) {
  input.reset(); key('keydown');
  (type === 'blur' ? target : documentTarget).dispatchEvent(new Event(type));
  assert.equal(input.consumeInteraction(), false);
  key('keydown', 'KeyE', { repeat: true });
  assert.equal(input.consumeInteraction(), false);
}
for (const extra of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }]) {
  input.reset(); key('keydown', 'KeyE', extra);
  assert.equal(input.consumeInteraction(), false);
}
const typingTarget = { isContentEditable: true };
input.onKeyDown({ code: 'KeyE', target: typingTarget });
assert.equal(input.consumeInteraction(), false);
input.reset(); key('keydown', 'KeyW'); key('keydown', 'Space'); key('keydown');
assert.equal(input.getDirection().length(), 1);
assert.equal(input.consumeDash(), true);
assert.equal(input.consumeInteraction(), true);
input.reset();

const world = new Scene();
const collision = new CollisionSystem({ bounds: world.collisionBounds });
world.collisionObstacles.forEach((obstacle) => collision.registerObstacle(obstacle));
const player = world.player;
const calls = [];
const ui = { activeId: null, message: '', render(entry, message) { this.activeId = entry?.station.id ?? null; this.message = message; } };
const interaction = new InteractionSystem({ stations: world.kitchen.stations.values(), collisionSystem: collision,
  ui, onInteract: (event) => calls.push(event.stationId) });
assert.equal(interaction.stations.size, 16);
const visualCounts = [...world.kitchen.stations.values()].map((station) => station.model.children.length);
const playerParts = player.group.children.length;
for (const station of world.kitchen.stations.values()) {
  interaction.reset();
  player.group.position.copy(station.getApproachPosition());
  interaction.update(1 / 60, player);
  assert.equal(interaction.activeStation.id, station.id);
  assert.equal(interaction.active.action, STATION_INTERACTIONS[station.type].action);
  const before = calls.length;
  key('keydown');
  let event = interaction.update(1 / 60, player, { interactPressed: input.consumeInteraction() });
  assert.equal(event.stationId, station.id);
  assert.equal(calls.length, before + 1);
  assert.equal(ui.message, STATION_INTERACTIONS[station.type].confirmation);
  for (let i = 0; i < 5; i++) {
    key('keydown', 'KeyE', { repeat: true });
    event = interaction.update(1 / 60, player, { interactPressed: input.consumeInteraction() });
    assert.equal(event, null);
  }
  assert.equal(calls.length, before + 1);
  key('keyup');
}
assert.equal(player.group.children.length, playerParts, 'Interações preparatórias não criam ingredientes na personagem.');
assert.deepEqual([...world.kitchen.stations.values()].map((station) => station.model.children.length), visualCounts);

// Distância à borda de um balcão largo, em vez da distância ao seu centro.
player.group.position.set(2.8, 0, -3.4);
interaction.reset(); interaction.update(0.01, player);
assert.equal(interaction.activeStation.id, 'delivery');
for (const position of [[0, 1.9], [0, -1.9], [2.6, 0], [-2.6, 0]]) {
  player.group.position.set(position[0], 0, position[1]);
  interaction.reset(); interaction.update(0.01, player);
  assert.equal(interaction.activeStation.id, 'assembly', 'A ilha aceita interação nos quatro lados.');
}
// O plano de interação é XZ, independente da altura visual.
player.group.position.y = 20;
interaction.update(0.01, player);
assert.equal(interaction.activeStation.id, 'assembly');
player.group.position.y = 0;

const salmon = world.kitchen.stations.get('salmonBox');
player.group.position.copy(salmon.position).addScaledVector(salmon.front, -1.4);
interaction.reset(); interaction.update(0.01, player);
assert.notEqual(interaction.activeStation?.id, 'salmonBox', 'Caixas usam a própria área acessível, não o fundo.');
player.group.position.set(0, 0, 6.8);
const beforeOutOfRange = calls.length;
interaction.update(0.01, player, { interactPressed: true });
assert.equal(interaction.activeStation, null);
assert.equal(ui.activeId, null);
assert.equal(calls.length, beforeOutOfRange);
// Pressionar longe e continuar segurando ao se aproximar não executa ação atrasada.
key('keydown'); interaction.update(0.01, player, { interactPressed: input.consumeInteraction() });
player.group.position.copy(salmon.getApproachPosition());
key('keydown', 'KeyE', { repeat: true });
interaction.update(0.01, player, { interactPressed: input.consumeInteraction() });
assert.equal(calls.length, beforeOutOfRange);
key('keyup');

// Oclusão é consultada no CollisionSystem, incluindo obstáculos finos.
const isolatedCollision = new CollisionSystem();
const station = new Station({ id: 'assembly', position: [0, 0], width: 1, depth: 1, height: 1 });
isolatedCollision.registerObstacle(station.collider);
const isolated = new InteractionSystem({ stations: [station], collisionSystem: isolatedCollision });
player.group.position.set(1.4, 0, 0);
isolated.update(0.01, player);
assert.equal(isolated.activeStation, station);
isolatedCollision.registerObstacle({ id: 'blocking-wall', position: { x: 0.7, z: 0 }, width: 0.025, depth: 1.5 });
assert.equal(isolatedCollision.hasLineOfSight(player.group.position, new Vector3(0.5, 0, 0), 'assembly'), false);
assert.equal(isolated.update(0.01, player, { interactPressed: true }), null);
assert.equal(isolated.activeStation, null, 'Não pode interagir através de parede ou outro móvel.');
isolatedCollision.removeObstacle('blocking-wall');
assert.equal(isolated.update(0.01, player, { interactPressed: true }).stationId, 'assembly');
player.group.position.set(1.801, 0, 0);
isolated.update(0.01, player);
assert.equal(isolated.activeStation, null, 'Alcance máximo não deve ser excedido.');
player.group.position.set(0, 0, 0);
isolated.update(0.01, player);
assert.equal(isolated.activeStation, null, 'Posição dentro do collider não deve permitir interação.');
assert.equal(collision.hasLineOfSight(new Vector3(10, 0, 0), new Vector3(8, 0, 0)), false);

// Empates usam orientação e ID; histerese evita oscilação entre duas estações.
const stableCollision = new CollisionSystem();
const stable = new InteractionSystem({ collisionSystem: stableCollision });
for (const [id, x] of [['left', -1.4], ['right', 1.4]]) {
  const candidate = new Station({ id, position: [x, 0], width: 1, depth: 1, height: 1 });
  stableCollision.registerObstacle(candidate.collider);
  stable.registerStation(candidate, { action: id, confirmation: id });
}
player.group.position.set(0, 0, 0); player.group.rotation.y = -Math.PI / 2;
stable.update(0.01, player);
assert.equal(stable.activeStation.id, 'left');
for (const x of [0.01, -0.01, 0.02, 0, -0.02]) {
  player.group.position.x = x;
  stable.update(0.01, player);
  assert.equal(stable.activeStation.id, 'left');
}
player.group.position.x = 0.07;
stable.update(0.01, player);
assert.equal(stable.activeStation.id, 'right');
stable.reset(); player.group.position.x = 0; player.group.rotation.y = Math.PI / 2;
stable.update(0.01, player);
assert.equal(stable.activeStation.id, 'right');

player.group.position.copy(salmon.getApproachPosition());
interaction.update(0.01, player, { interactPressed: true });
const beforeDash = calls.length;
player.state = 'dashing'; player.dashRemaining = 0.1;
key('keydown');
interaction.update(0.05, player, { interactPressed: input.consumeInteraction() });
assert.equal(interaction.activeStation, null);
assert.equal(ui.activeId, null);
assert.equal(ui.message, '');
player.state = 'idle'; player.dashRemaining = 0;
// Também bloqueia o quadro em que o dash termina, sinalizado pelo loop do Game.
interaction.update(0.05, player, { interactPressed: true, disabled: true });
key('keydown', 'KeyE', { repeat: true });
interaction.update(0.05, player, { interactPressed: input.consumeInteraction() });
assert.equal(calls.length, beforeDash);
key('keyup'); key('keydown');
interaction.update(0.01, player, { interactPressed: input.consumeInteraction() });
assert.equal(calls.length, beforeDash + 1, 'Um novo E funciona normalmente depois do dash.');
key('keyup');
for (let i = 0; i < 40; i++) interaction.update(0.05, player);
assert.equal(ui.message, '', 'Confirmação desaparece automaticamente, sem outro loop ou timer.');
assert.equal(ui.activeId, 'salmonBox');
assert.equal(interaction.unregisterStation('salmonBox'), true);
assert.equal(interaction.activeStation, null);
assert.equal(ui.activeId, null);
interaction.dispose(); interaction.dispose();
assert.equal(interaction.update(0.01, player, { interactPressed: true }), null);
input.dispose(); isolated.dispose(); stable.dispose();
collision.dispose(); isolatedCollision.dispose(); stableCollision.dispose(); world.dispose();
console.log('OK: E por pressionamento, nove ações, XZ/bordas, áreas independentes, ilha nos quatro lados, obstáculos, seleção estável, fora de alcance, bloqueio durante dash, confirmação temporária e limpeza.');
