import assert from 'node:assert/strict';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { Scene } from '../src/game/Scene.js';
import { Input } from '../src/game/Input.js';
import { IngredientFactory } from '../src/game/IngredientFactory.js';
import { CarrySystem } from '../src/game/CarrySystem.js';
import { CollisionSystem } from '../src/game/CollisionSystem.js';
import { InteractionSystem } from '../src/game/InteractionSystem.js';
import { CuttingSystem } from '../src/game/CuttingSystem.js';
import { CuttingEffects } from '../src/game/CuttingEffects.js';
import { RiceCookerSystem } from '../src/game/RiceCookerSystem.js';
import { SoundSystem } from '../src/game/SoundSystem.js';

const world = new Scene();
const { player } = world;
const stations = world.kitchen.stations;
const station = stations.get('cutting');
const originalPosition = station.position.clone();
const originalCollider = JSON.stringify(station.collider);
const board = station.model.getObjectByName('cutting-board');
const boardGeometry = board.geometry;
const boardPosition = board.position.clone();
const knifeBlade = station.model.getObjectByName('decorative-knife-blade');
const knifePosition = knifeBlade.position.clone();
const decoration = station.model.getObjectByName('salmon-piece');
const factory = new IngredientFactory();
const carry = new CarrySystem({ player, stations, factory });
const collision = new CollisionSystem({ bounds: world.collisionBounds });
world.collisionObstacles.forEach((obstacle) => collision.registerObstacle(obstacle));
player.collisionSystem = collision;
const effects = new CuttingEffects(station);
const sounds = { hits: 0, completions: 0, playChop() { this.hits++; }, playComplete() { this.completions++; } };
// Mantém a cobertura de parametrização; o padrão atual de três golpes é testado em verify-update.mjs.
const cutting = new CuttingSystem({ station, player, carrySystem: carry, factory, effects, sound: sounds, requiredCuts: 5 });
const cooker = new RiceCookerSystem({ station: stations.get('riceCooker'), carrySystem: carry, factory });
const events = [];
const ui = { action: '', message: '', render(active, message) { this.action = active?.action; this.message = message; } };
const interaction = new InteractionSystem({ stations: stations.values(), collisionSystem: collision, carrySystem: carry,
  ui, onInteract: (event) => events.push(event) });
const target = new EventTarget();
const input = new Input(new PerspectiveCamera(), { target, documentTarget: new EventTarget() });
input.setEnabled(true);
function key(type, code = 'KeyE', repeat = false) {
  const event = new Event(type, { cancelable: true }); Object.assign(event, { code, repeat }); target.dispatchEvent(event);
}
function frame(dt = 0, forcedDirection = null, forcedDash = false) {
  const wasCutting = cutting.isCutting;
  input.setActionsBlocked(wasCutting);
  const wasDashing = player.dashRemaining > 0;
  const pressed = input.consumeInteraction();
  const direction = forcedDirection ?? input.getDirection();
  const dash = forcedDash || input.consumeDash();
  cooker.update(dt); cutting.update(dt);
  player.update(Math.min(dt, 0.05), wasCutting ? null : direction, wasCutting ? false : dash);
  const event = interaction.update(Math.min(dt, 0.05), player, { interactPressed: !wasCutting && pressed, disabled: wasDashing });
  input.setActionsBlocked(cutting.isCutting);
  return event;
}
function approach(id) {
  assert.equal(cutting.isCutting, false, 'Preparação do teste não deve mover a personagem durante um golpe.');
  input.reset(); player.stopMoving();
  player.group.position.copy(stations.get(id).getApproachPosition());
  interaction.reset(); frame(); assert.equal(interaction.activeStation?.id, id);
}
function press() { key('keydown'); const result = frame(); key('keyup'); return result; }
function act(id, kind) { approach(id); const result = press(); assert.equal(result.kind, kind); return result; }
const advance = (seconds, fps = 60) => {
  let time = 0;
  while (time < seconds - 1e-10) { const dt = Math.min(1 / fps, seconds - time); frame(dt); time += dt; }
};

assert.equal(cutting.state, 'EMPTY');
assert.equal(cutting.requiredCuts, 5);
assert.equal(cutting.strokeDuration, 0.25);
assert.equal(decoration.visible, false, 'A tábua funcional não deve confundir decoração com ingredientes reais.');
approach('cutting'); assert.equal(ui.action, 'Bancada vazia');
assert.equal(act('cutting', 'unavailable').success, false);
assert.throws(() => cutting.transition('READY'));
assert.throws(() => cutting.transition('LOADED'));
for (const [type, state] of [['rice', 'rice_raw'], ['rice', 'rice_cooked'], ['nori', 'nori_sheet']]) {
  const item = factory.create(type, state); carry.attach(item);
  assert.equal(act('cutting', 'unavailable').success, false);
  assert.equal(ui.action, 'Ingrediente não pode ser cortado');
  assert.equal(carry.carriedIngredient, item);
  assert.equal(item.state, state);
  assert.equal(cutting.state, 'EMPTY');
  act('trash', 'discard');
}

for (const [box, type, raw, prepared] of [
  ['salmonBox', 'salmon', 'salmon_raw', 'salmon_cut'], ['cucumberBox', 'cucumber', 'cucumber_whole', 'cucumber_cut'],
]) {
  act(box, 'pickup');
  const ingredient = carry.carriedIngredient;
  const instanceId = ingredient.instanceId;
  const model = ingredient.model;
  approach('cutting'); assert.equal(ui.action, 'Colocar ingrediente');
  key('keydown'); assert.equal(frame().kind, 'load-cutting');
  assert.equal(cutting.state, 'LOADED');
  assert.equal(cutting.cuts, 0);
  assert.equal(carry.carriedIngredient, null);
  assert.equal(cutting.content, ingredient);
  assert.equal(ingredient.model.parent, cutting.boardAnchor);
  assert.equal(ingredient.location, 'cutting');
  assert.equal(ingredient.ownerId, 'cutting');
  assert.equal(ui.action, 'Toque para pegar • segure para cortar');
  for (let i = 0; i < 10; i++) { key('keydown', 'KeyE', true); frame(0.05); }
  assert.equal(cutting.cuts, 0, 'A tecla que coloca o ingrediente não começa o corte.');
  assert.equal(player.movementLocked, false);
  key('keyup');
  const itemBounds = new Box3().setFromObject(ingredient.model);
  assert.ok(itemBounds.min.y > new Box3().setFromObject(board).max.y);
  assert.equal(cutting.retrieve().success, true);
  assert.equal(carry.carriedIngredient, ingredient);
  assert.equal(carry.interact(station).success, true);
  player.group.rotation.y = -Math.PI / 2; // Começa olhando para longe para verificar a preparação do golpe.
  const hitsBefore = sounds.hits;
  const completionsBefore = sounds.completions;
  for (let count = 1; count <= 5; count++) {
    const origin = player.group.position.clone();
    assert.equal(press().kind, 'cut-stroke');
    assert.equal(cutting.state, 'CUTTING');
    assert.equal(player.movementLocked, true);
    assert.equal(player.velocity.length(), 0);
    assert.equal(ui.action, 'Cortando...');
    const cutCount = cutting.cuts;
    const eventCount = events.length;
    assert.equal(cutting.strike().success, false);
    // Nem teclas novas nem comandos diretos do movimento podem escapar do bloqueio.
    key('keydown', 'KeyW'); key('keydown', 'Space');
    key('keydown'); frame(0.01, new Vector3(1, 0, 0), true); key('keyup');
    assert.equal(input.consumeDash(), false);
    assert.equal(input.getDirection().length(), 0);
    assert.equal(cutting.cuts, cutCount);
    assert.equal(events.length, eventCount);
    for (let i = 0; i < 8; i++) { key('keydown'); frame(0.01); key('keyup'); }
    assert.equal(events.length, eventCount, 'E durante a animação deve ser ignorado.');
    const target = cutting.boardAnchor.getWorldPosition(new Vector3());
    const angle = Math.atan2(target.x - origin.x, target.z - origin.z);
    assert.ok(Math.abs(Math.atan2(Math.sin(player.group.rotation.y - angle), Math.cos(player.group.rotation.y - angle))) < 1e-8);
    const aimedAngle = player.group.rotation.y;
    for (let i = 0; i < 16; i++) {
      frame(0.01, new Vector3(0, 0, -1), true);
      assert.ok(player.group.position.distanceTo(origin) < 1e-9);
      assert.equal(player.group.rotation.y, aimedAngle, 'Após alinhar, o golpe não deve girar com comandos de movimento.');
      assert.equal(player.dashRemaining, 0);
      assert.ok(Math.abs(player.leftArm.rotation.z) < 0.8 && Math.abs(player.rightArm.rotation.z) < 0.8);
    }
    assert.equal(cutting.cuts, count);
    assert.ok(Math.abs(cutting.progress - count * 0.2) < 1e-9);
    assert.equal(player.movementLocked, false);
    assert.equal(sounds.hits, hitsBefore + count);
    assert.equal(sounds.completions, completionsBefore + (count === 5 ? 1 : 0));
    assert.equal(ingredient.instanceId, instanceId);
    assert.equal(ingredient.model, model);
    assert.equal(ingredient.disposed, false);
    assert.equal(factory.instances.size, 1);
    // Teclas mantidas ou repetidas durante o bloqueio não começam movimento/dash depois.
    key('keydown', 'KeyW', true); key('keydown', 'Space', true);
    frame(0.02);
    assert.ok(player.group.position.distanceTo(origin) < 1e-9);
    assert.equal(player.dashRemaining, 0);
    key('keyup', 'KeyW'); key('keyup', 'Space');
    if (count < 5) assert.equal(ingredient.state, raw);
    if (count === 3) {
      const position = ingredient.model.getWorldPosition(new Vector3());
      key('keydown', 'KeyA'); advance(0.5); key('keyup', 'KeyA');
      advance(0.25);
      assert.notEqual(interaction.activeStation?.id, 'cutting');
      assert.equal(cutting.cuts, 3);
      assert.equal(cutting.content, ingredient);
      assert.ok(ingredient.model.getWorldPosition(new Vector3()).distanceTo(position) < 1e-9);
      key('keydown', 'KeyD'); advance(0.5); key('keyup', 'KeyD');
      advance(0.15);
      assert.equal(interaction.activeStation?.id, 'cutting');
      assert.equal(cutting.cuts, 3);
      player.stopMoving();
    }
  }
  assert.equal(cutting.state, 'READY');
  assert.equal(ingredient.state, prepared);
  const slices = ingredient.model.children.filter((mesh) => mesh.name.startsWith(`${type}-slice-`) && !mesh.name.includes('stripe') && !mesh.name.includes('center'));
  assert.equal(slices.length, 6);
  act('noriBox', 'pickup');
  const occupiedHands = carry.carriedIngredient;
  assert.equal(act('cutting', 'unavailable').success, false);
  assert.equal(ui.message, 'Mãos ocupadas');
  assert.equal(cutting.content, ingredient);
  assert.equal(carry.carriedIngredient, occupiedHands);
  act('trash', 'discard');
  act('cutting', 'take-cut-ingredient');
  assert.equal(carry.carriedIngredient, ingredient);
  assert.equal(ingredient.instanceId, instanceId);
  assert.equal(ingredient.state, prepared);
  assert.equal(ingredient.model.parent, player.carryAnchor);
  assert.equal(cutting.state, 'EMPTY');
  assert.equal(cutting.content, null);
  assert.equal(cutting.progress, 0);
  assert.equal(cutting.boardAnchor.children.length, 0);
  assert.equal(cutting.retrieve().success, false);
  assert.equal(act('cutting', 'load-cutting').success, true, 'Preparados podem ser apoiados sem cortar outra vez.');
  assert.equal(cutting.state, 'READY');
  act('cutting', 'take-cut-ingredient');
  act('assembly', 'place'); act('assembly', 'retrieve');
  assert.equal(carry.carriedIngredient.state, prepared);
  assert.equal(carry.carriedIngredient.instanceId, instanceId);
  player.group.position.copy(world.kitchen.spawnPosition); player.stopMoving(); player.cooldownRemaining = 0;
  frame(0.02, new Vector3(1, 0, 0), true);
  assert.equal(player.state, 'dashing', 'O dash volta a funcionar depois dos golpes.');
  advance(0.3);
  assert.equal(ingredient.model.parent, player.carryAnchor);
  assert.ok(ingredient.model.getWorldPosition(new Vector3()).distanceTo(player.carryAnchor.getWorldPosition(new Vector3())) < 1e-8);
  act('trash', 'discard');
  advance(1.5);
  assert.equal(player.cutPose, null);
  assert.equal(player.cutWeight, 0);
  assert.equal(factory.instances.size, 0);
}

// Não acessa a tábua pela lateral distante do balcão.
player.group.position.set(station.position.x, 0, station.position.z - station.dimensions.depth / 2 - 0.72);
interaction.reset(); frame(); assert.notEqual(interaction.activeStation?.id, 'cutting');
// Cancelamento de foco libera o controle e preserva os cortes já concluídos.
act('salmonBox', 'pickup'); act('cutting', 'load-cutting');
assert.equal(press().kind, 'cut-stroke');
frame(0.1); cutting.cancelStroke(); input.reset();
assert.equal(cutting.state, 'LOADED'); assert.equal(cutting.cuts, 0); assert.equal(player.movementLocked, false);
for (let i = 0; i < 5; i++) { assert.equal(press().kind, 'cut-stroke'); advance(0.25); }
act('cutting', 'take-cut-ingredient'); act('trash', 'discard');

for (const fps of [5, 15, 30, 60, 144]) {
  act('cucumberBox', 'pickup'); act('cutting', 'load-cutting');
  const item = cutting.content;
  for (let i = 1; i <= 5; i++) {
    assert.equal(press().kind, 'cut-stroke'); advance(0.25, fps);
    assert.equal(cutting.cuts, i);
    assert.equal(player.movementLocked, false);
    assert.equal(cutting.content, item);
  }
  assert.equal(item.state, 'cucumber_cut');
  act('cutting', 'take-cut-ingredient'); act('trash', 'discard');
}
// Um quadro enorme termina só o golpe solicitado; jamais realiza os outros automaticamente.
act('salmonBox', 'pickup'); act('cutting', 'load-cutting'); press(); frame(20);
assert.equal(cutting.cuts, 1); assert.equal(cutting.state, 'LOADED'); assert.equal(player.movementLocked, false);
for (const invalid of [-1, NaN, Infinity]) cutting.update(invalid);
assert.equal(cutting.cuts, 1);
for (let i = 0; i < 4; i++) { press(); advance(0.25); }
act('cutting', 'take-cut-ingredient'); act('trash', 'discard');
// Arroz continua cozinhando enquanto a personagem trabalha na tábua.
act('riceBox', 'pickup'); act('riceCooker', 'load-rice'); act('riceCooker', 'start-cooking');
act('salmonBox', 'pickup'); act('cutting', 'load-cutting');
for (let i = 0; i < 5; i++) { press(); advance(0.25); }
assert.equal(cooker.state, 'COOKING'); assert.ok(Math.abs(cooker.elapsed - 1.25) < 1e-8);
act('cutting', 'take-cut-ingredient'); act('trash', 'discard');
advance(6.75);
assert.equal(cooker.state, 'READY'); act('riceCooker', 'take-cooked-rice');
assert.equal(carry.carriedIngredient.state, 'rice_cooked'); act('trash', 'discard');
assert.ok(station.position.equals(originalPosition));
assert.equal(JSON.stringify(station.collider), originalCollider);
assert.equal(board.geometry, boardGeometry); assert.ok(board.position.equals(boardPosition));
assert.equal(player.maxSpeed, 5.04); assert.equal(player.dashDuration, 0.18); assert.equal(player.dashCooldown, 0.65);

// Parâmetros ajustáveis e encerramento durante um golpe sem deixar controles presos.
cutting.requiredCuts = 3; cutting.strokeDuration = 0.4; cutting.recoverySpeed = 10;
act('cucumberBox', 'pickup'); act('cutting', 'load-cutting');
for (let i = 1; i <= 3; i++) { press(); advance(0.4); assert.equal(cutting.cuts, i); }
assert.equal(cutting.state, 'READY'); act('cutting', 'take-cut-ingredient'); act('trash', 'discard');
act('salmonBox', 'pickup'); act('cutting', 'load-cutting'); press(); frame(0.1);
cutting.dispose(); cutting.dispose();
assert.equal(player.movementLocked, false);
assert.equal(station.storedIngredient, null);
assert.equal(factory.instances.size, 0);
assert.equal(station.behavior, null);
assert.equal(station.interactionArea, undefined);
assert.equal(decoration.visible, true);
assert.ok(knifeBlade.position.distanceTo(knifePosition) < 1e-9);
assert.equal(station.model.getObjectByName('cutting-content'), undefined);
input.dispose(); interaction.dispose(); cooker.dispose(); carry.dispose(); factory.dispose(); collision.dispose(); world.dispose();

// Áudio só nasce com um gesto do usuário e funciona sem arquivos ou infraestrutura anterior.
let contexts = 0; let starts = 0; let closes = 0;
const audioTarget = new EventTarget();
const parameter = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
audioTarget.AudioContext = class {
  constructor() { contexts++; this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { closes++; this.state = 'closed'; return Promise.resolve(); }
  createGain() { return { gain: parameter(), connect() {}, disconnect() {} }; }
  createOscillator() { return { frequency: parameter(), connect() {}, disconnect() {}, start() { starts++; }, stop() { this.onended?.(); } }; }
};
const sound = new SoundSystem({ target: audioTarget });
assert.equal(contexts, 0); assert.equal(sound.playChop(), false);
audioTarget.dispatchEvent(new Event('keydown'));
assert.equal(contexts, 1); assert.equal(sound.playChop(), true); sound.playComplete();
assert.equal(starts, 3); assert.equal(sound.nodes.size, 0);
sound.dispose(); sound.dispose(); assert.equal(closes, 1);
audioTarget.dispatchEvent(new Event('keydown')); assert.equal(contexts, 1);
const silent = new SoundSystem({ target: new EventTarget() });
silent.unlock(); assert.equal(silent.playChop(), false); silent.dispose();
console.log('OK: salmão/pepino em cinco golpes, identidade e estados, 20% por golpe, bloqueio sem comandos pendentes, giro para a tábua, progresso persistente, modelos em fatias, mãos ocupadas, FPS variados, recuperação, áudio por gesto e arroz simultâneo.');
