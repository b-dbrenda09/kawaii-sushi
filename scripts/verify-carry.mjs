import assert from 'node:assert/strict';
import { Box3, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { Scene } from '../src/game/Scene.js';
import { Input } from '../src/game/Input.js';
import { CollisionSystem } from '../src/game/CollisionSystem.js';
import { InteractionSystem } from '../src/game/InteractionSystem.js';
import { IngredientFactory } from '../src/game/IngredientFactory.js';
import { INGREDIENT_TYPES } from '../src/game/Ingredient.js';
import { CarrySystem } from '../src/game/CarrySystem.js';

const world = new Scene();
const player = world.player;
const stations = world.kitchen.stations;
const factory = new IngredientFactory();
const carry = new CarrySystem({ player, stations, factory });
const collisions = new CollisionSystem({ bounds: world.collisionBounds });
world.collisionObstacles.forEach((obstacle) => collisions.registerObstacle(obstacle));
player.collisionSystem = collisions;
const ui = { action: '', available: true, message: '', render(active, message) {
  this.action = active?.action ?? ''; this.available = active?.available; this.message = message;
} };
const events = [];
const interaction = new InteractionSystem({ stations: stations.values(), collisionSystem: collisions, carrySystem: carry,
  ui, onInteract: (event) => events.push(event) });
const target = new EventTarget();
const input = new Input(new PerspectiveCamera(), { target, documentTarget: new EventTarget() });
input.setEnabled(true);
const key = (type, repeat = false) => {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { code: 'KeyE', repeat }); target.dispatchEvent(event);
};
const update = () => interaction.update(1 / 60, player, { interactPressed: input.consumeInteraction() });
function approach(id) {
  input.reset(); player.stopMoving();
  player.group.position.copy(stations.get(id).getApproachPosition());
  interaction.reset(); update();
  assert.equal(interaction.activeStation.id, id);
}
function press() { key('keydown'); const result = update(); key('keyup'); return result; }
function act(id, kind, type = null) {
  approach(id);
  const result = press();
  assert.equal(result.kind, kind);
  assert.equal(carry.carriedIngredient?.type ?? null, type);
  assert.equal(player.carryAnchor.children.length, type ? 1 : 0);
  return result;
}
const contents = [...stations.values()].filter((station) => station.ingredientSource).map((station) => ({
  model: station.model.getObjectByName(`${station.ingredientSource.ingredient}-contents`),
  count: station.model.getObjectByName(`${station.ingredientSource.ingredient}-contents`).children.length,
}));
assert.deepEqual([...stations.values()].filter((station) => station.storage).map((station) => station.id).sort(), ['assembly', 'assembly2', 'assembly3', 'cutting', 'cutting2', 'cutting3']);
for (const definition of Object.values(INGREDIENT_TYPES)) {
  approach(definition.originBoxId);
  assert.equal(ui.action, `Pegar ${definition.label}`);
  press();
  const ingredient = carry.carriedIngredient;
  assert.equal(ingredient.id, definition.id);
  assert.equal(ingredient.name, definition.name);
  assert.equal(ingredient.state, definition.initialState);
  assert.equal(ingredient.originBoxId, definition.originBoxId);
  assert.equal(ingredient.model.parent, player.carryAnchor);
  assert.equal(ingredient.ownerId, 'player');
  assert.equal(ingredient.location, 'carried');
  assert.equal(ui.action, `Devolver ${definition.label}`, 'Texto deve mudar na mesma estação sem se afastar.');
  assert.equal(factory.instances.size, 1);
  // Repetições do teclado não devolvem, recriam ou duplicam o objeto.
  key('keydown'); update(); key('keyup'); // Devolve com um novo pressionamento.
  assert.equal(carry.carriedIngredient, null);
  key('keydown'); update();
  const held = carry.carriedIngredient;
  const beforeRepeat = events.length;
  for (let i = 0; i < 20; i++) { key('keydown', true); update(); }
  assert.equal(events.length, beforeRepeat);
  assert.equal(carry.carriedIngredient, held);
  assert.equal(player.carryAnchor.children.length, 1);
  assert.equal(factory.instances.size, 1);
  key('keyup'); press();
  assert.equal(carry.carriedIngredient, null);
  assert.equal(factory.instances.size, 0);
  assert.equal(held.model.parent, null);
  assert.equal(held.disposed, true);
}

act('salmonBox', 'pickup', 'salmon');
const first = carry.carriedIngredient;
approach('cucumberBox');
assert.equal(ui.action, 'Trocar por pepino');
assert.equal(press().kind, 'swap');
assert.equal(carry.carriedIngredient.type, 'cucumber');
assert.notEqual(carry.carriedIngredient.instanceId, first.instanceId);
assert.equal(first.disposed, true);
assert.equal(first.model.parent, null);
assert.equal(first.model.children.length, 0);
assert.equal(factory.instances.size, 1);
act('cucumberBox', 'return');
assert.equal(factory.instances.size, 0);

// A instância e o estado são preservados em cada transferência mão <-> superfície.
for (const surface of ['assembly', 'cutting']) {
  for (const definition of Object.values(INGREDIENT_TYPES)) {
    act(definition.originBoxId, 'pickup', definition.id);
    const ingredient = carry.carriedIngredient;
    approach(surface);
    assert.equal(ui.action, 'Colocar ingrediente');
    assert.equal(press().kind, 'place');
    const station = stations.get(surface);
    assert.equal(station.storedIngredient, ingredient);
    assert.equal(carry.carriedIngredient, null);
    assert.equal(ingredient.model.parent, station.storage.anchor);
    assert.equal(ingredient.location, 'surface');
    assert.equal(ingredient.ownerId, surface);
    assert.equal(player.carryAnchor.children.length, 0);
    assert.equal(ui.action, 'Pegar ingrediente');
    world.scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(ingredient.model);
    const plane = station.storage.anchor.getWorldPosition(new Vector3()).y;
    assert.ok(bounds.min.y >= plane + 0.004, 'Ingrediente deve ficar acima da superfície.');
    const b = station.collider.bounds;
    assert.ok(bounds.min.x >= b.minX - 1e-6 && bounds.max.x <= b.maxX + 1e-6);
    assert.ok(bounds.min.z >= b.minZ - 1e-6 && bounds.max.z <= b.maxZ + 1e-6);
    for (const child of station.model.children) {
      if (child === station.storage.anchor) continue;
      assert.equal(bounds.intersectsBox(new Box3().setFromObject(child)), false, `Objeto sobrepôs decoração em ${surface}.`);
    }
    const restingPosition = ingredient.model.getWorldPosition(new Vector3());
    player.group.position.copy(world.kitchen.spawnPosition);
    for (let i = 0; i < 20; i++) player.update(1 / 60, new Vector3(1, 0, 0));
    world.scene.updateMatrixWorld(true);
    assert.ok(ingredient.model.getWorldPosition(new Vector3()).distanceTo(restingPosition) < 1e-9);
    act(surface, 'retrieve', definition.id);
    assert.equal(carry.carriedIngredient, ingredient);
    assert.equal(ingredient.state, definition.initialState);
    assert.equal(station.storedIngredient, null);
    assert.equal(station.storage.anchor.children.length, 0);
    assert.equal(factory.instances.size, 1);
    act(definition.originBoxId, 'return');
  }
}

act('riceBox', 'pickup', 'rice');
act('assembly', 'place');
const storedRice = stations.get('assembly').storedIngredient;
act('salmonBox', 'pickup', 'salmon');
const heldSalmon = carry.carriedIngredient;
approach('assembly');
assert.equal(ui.action, 'Superfície ocupada');
assert.equal(ui.available, false);
assert.equal(press().success, false);
assert.equal(carry.carriedIngredient, heldSalmon);
assert.equal(stations.get('assembly').storedIngredient, storedRice);
assert.equal(stations.get('assembly').storage.anchor.children.length, 1);
assert.equal(factory.instances.size, 2);
assert.ok(ui.message.includes('ocupada'));
for (const id of ['riceCooker', 'delivery']) {
  assert.equal(act(id, 'unavailable', 'salmon').success, false);
  assert.equal(carry.carriedIngredient, heldSalmon);
  assert.equal(stations.get(id).storedIngredient, null);
}
act('trash', 'discard');
assert.equal(heldSalmon.disposed, true);
assert.equal(factory.instances.size, 1);
act('trash', 'unavailable');
assert.equal(factory.instances.size, 1);
act('assembly', 'retrieve', 'rice');
assert.equal(carry.carriedIngredient, storedRice);
act('riceBox', 'return');
assert.equal(factory.instances.size, 0);

// Sem espaço suficiente, o objeto continua nas mãos.
act('salmonBox', 'pickup', 'salmon');
const cutting = stations.get('cutting');
const normalStorage = cutting.storage;
cutting.storage = { ...normalStorage, width: 0.1, depth: 0.1 };
assert.equal(act('cutting', 'unavailable', 'salmon').success, false);
assert.equal(cutting.storedIngredient, null);
cutting.storage = normalStorage;

// Caminhada, giro, pernas e dash continuam no mesmo Player, sem física do objeto.
player.group.position.set(0, 0, 2.4);
player.stopMoving();
const movingItem = carry.carriedIngredient;
const point = new Vector3();
for (let i = 0; i < 60; i++) {
  player.update(1 / 60, new Vector3(1, 0, 0));
  assert.equal(movingItem.model.parent, player.carryAnchor);
  assert.ok(movingItem.model.getWorldPosition(point).distanceTo(player.carryAnchor.getWorldPosition(new Vector3())) < 1e-8);
}
assert.ok(player.carryWeight > 0.99);
assert.ok(player.leftArm.rotation.x < -1 && player.rightArm.rotation.x < -1);
assert.ok(Math.abs(player.leftLeg.rotation.x) > 0.01);
assert.ok(player.leftLeg.rotation.x * player.rightLeg.rotation.x < 0);
const originalRotation = player.group.rotation.y;
for (let i = 0; i < 12; i++) player.update(1 / 60, new Vector3(0, 0, 1));
assert.notEqual(player.group.rotation.y, originalRotation);
const itemQuaternion = movingItem.model.getWorldQuaternion(new Quaternion());
assert.ok(itemQuaternion.angleTo(player.carryAnchor.getWorldQuaternion(new Quaternion())) < 1e-7);
player.cooldownRemaining = 0;
player.update(0.02, new Vector3(-1, 0, 0), true);
assert.equal(player.state, 'dashing');
const eventsBeforeDash = events.length;
interaction.update(0.02, player, { interactPressed: true });
assert.equal(events.length, eventsBeforeDash);
for (let i = 0; i < 12; i++) {
  player.update(0.02, new Vector3(-1, 0, 0));
  assert.ok(movingItem.model.getWorldPosition(new Vector3()).distanceTo(player.carryAnchor.getWorldPosition(new Vector3())) < 1e-8);
}
assert.equal(player.maxSpeed, 5.04);
assert.equal(player.dashDuration, 0.18);
assert.equal(player.dashCooldown, 0.65);
player.stopMoving();
// Colisão com a ilha continua bloqueando o mesmo círculo enquanto carrega.
player.group.position.set(0, 0, 2.2); player.cooldownRemaining = 0;
for (let i = 0; i < 30; i++) player.update(0.05, new Vector3(0, 0, -1), i === 0);
assert.ok(player.group.position.z >= 1.2 + player.collider.radius - 1e-8);
assert.equal(carry.carriedIngredient, movingItem);
player.group.position.copy(world.kitchen.spawnPosition); player.stopMoving();
const beforeFloor = events.length;
key('keydown'); update(); key('keyup');
assert.equal(events.length, beforeFloor);
assert.equal(carry.carriedIngredient, movingItem, 'E fora de uma estação não solta o objeto no chão.');
act('salmonBox', 'return');
assert.ok(player.carryWeight > 0.9);
player.update(1 / 60);
assert.ok(player.carryWeight > 0 && player.carryWeight < 1);
for (let i = 0; i < 120; i++) player.update(1 / 60);
assert.ok(player.carryWeight < 1e-10);
assert.ok(Math.abs(player.leftArm.rotation.x) < 1e-9);
assert.ok(Math.abs(player.leftArm.rotation.z) < 0.15);

// Reuso dos recursos e remoção de instâncias, sem estoque decorativo consumível.
const sampleA = factory.create('salmon');
const sampleB = factory.create('salmon');
assert.equal(sampleA.model.children[0].geometry, sampleB.model.children[0].geometry);
assert.equal(sampleA.model.children[0].material, sampleB.model.children[0].material);
sampleA.dispose(); sampleB.dispose();
const geometryCount = factory.boxes.size;
for (let i = 0; i < 30; i++) {
  act('salmonBox', 'pickup', 'salmon'); act('cucumberBox', 'swap', 'cucumber'); act('trash', 'discard');
  assert.equal(factory.instances.size, 0);
}
assert.equal(factory.boxes.size, geometryCount);
for (const entry of contents) assert.equal(entry.model.children.length, entry.count);
// A limpeza encerra tanto os objetos carregados quanto os armazenados.
act('salmonBox', 'pickup', 'salmon'); act('assembly', 'place');
act('riceBox', 'pickup', 'rice'); act('cutting', 'place');
act('noriBox', 'pickup', 'nori');
assert.equal(factory.instances.size, 3);
carry.dispose(); carry.dispose();
assert.equal(factory.instances.size, 0);
assert.equal(player.carryAnchor.children.length, 0);
for (const station of stations.values()) assert.equal(station.storedIngredient, null);
const resources = [factory.sphere, factory.cylinder, ...factory.boxes.values(), ...Object.values(factory.materials)];
const disposalCounts = new Map();
for (const resource of resources) resource.addEventListener('dispose', () => disposalCounts.set(resource, (disposalCounts.get(resource) ?? 0) + 1));
factory.dispose(); factory.dispose();
for (const resource of resources) assert.equal(disposalCounts.get(resource), 1);
assert.throws(() => factory.create('salmon'));
input.dispose(); interaction.dispose(); collisions.dispose(); world.dispose();
console.log('OK: quatro tipos/estados, coleta, transporte único, E sem repetição, troca/devolução, duas superfícies, recuperação, bloqueios, descarte, caminhada/giro/dash, colisões, animação e recursos compartilhados sem instâncias órfãs.');
